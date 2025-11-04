from __future__ import annotations

import base64
import io
import json
import os
import re
import secrets
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple, Union

from fastapi import (
    APIRouter,
    Body,
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError
from urllib.parse import urlencode

from .analytics import get_risk_engine
from .models import (
    CredentialAction,
    CredentialActionRequest,
    CredentialOffer,
    CredentialPayload,
    CredentialStatus,
    DisclosurePolicy,
    DisclosureScope,
    ForgetSummary,
    IdentityAssuranceLevel,
    IssuanceMode,
    NonceResponse,
    Presentation,
    ProblemDetail,
    QRCodeResponse,
    RiskInsightResponse,
    VerificationCodeResponse,
    VerificationResult,
    VerificationSession,
)
from .store import store

try:
    import qrcode
except Exception:
    qrcode = None

app = FastAPI(title="MedSSI Sandbox APIs", version="0.6.0")
allowed_origins_env = os.getenv(
    "MEDSSI_ALLOWED_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173",
)
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

api_v2 = APIRouter(prefix="/v2", tags=["MedSSI v2"])
api_public = APIRouter(prefix="/api", tags=["MODA Sandbox compatibility"])


def _load_tokens(env_name: str, default: str) -> List[str]:
    raw = os.getenv(env_name, default)
    return [token.strip() for token in raw.split(",") if token.strip()]


# 修正：使用簡單的 Token
ISSUER_ACCESS_TOKENS = _load_tokens("MEDSSI_ISSUER_TOKEN", "issuer-sandbox-token")
VERIFIER_ACCESS_TOKENS = _load_tokens("MEDSSI_VERIFIER_TOKEN", "verifier-sandbox-token")
WALLET_ACCESS_TOKENS = _load_tokens("MEDSSI_WALLET_TOKEN", "wallet-sandbox-token")
DEFAULT_ISSUER_ID = os.getenv("MEDSSI_DEFAULT_ISSUER_ID", "did:example:moda-issuer")

WALLET_SCHEME = os.getenv("MEDSSI_WALLET_SCHEME", "modadigitalwallet://")
OID4VCI_REQUEST_BASE = os.getenv(
    "MEDSSI_OID4VCI_REQUEST_BASE",
    "https://issuer-oid4vci.medssi.dev/api/credential-offer",
)
OID4VCI_CLIENT_ID = os.getenv(
    "MEDSSI_OID4VCI_CLIENT_ID",
    "https://issuer-oid4vci.medssi.dev/api/credential-offer/callback",
)
OIDVP_REQUEST_BASE = os.getenv(
    "MEDSSI_OIDVP_REQUEST_BASE",
    "https://verifier-oidvp.medssi.dev/api/oidvp/request",
)
OIDVP_CLIENT_ID = os.getenv(
    "MEDSSI_OIDVP_CLIENT_ID",
    "https://verifier-oidvp.medssi.dev/api/oidvp/authorization-response",
)


def _raise_problem(*, status: int, type_: str, title: str, detail: str) -> None:
    raise HTTPException(
        status_code=status,
        detail=ProblemDetail(type=type_, title=title, status=status, detail=detail).dict(),
    )


def _validate_token(
    authorization: Optional[str], expected_tokens: List[str], audience: str
) -> None:
    if not authorization:
        _raise_problem(
            status=401,
            type_="https://medssi.dev/errors/missing-token",
            title=f"{audience.capitalize()} token required",
            detail=f"Provide Bearer token for {audience} access.",
        )
    scheme, _, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        _raise_problem(
            status=401,
            type_="https://medssi.dev/errors/invalid-token-format",
            title="Bearer token format required",
            detail="Authorization header must be formatted as 'Bearer <token>'.",
        )
    if token not in expected_tokens:
        _raise_problem(
            status=403,
            type_="https://medssi.dev/errors/token-rejected",
            title="Access token rejected",
            detail=f"The supplied token is not valid for {audience} operations.",
        )


def _merge_authorization(
    authorization: Optional[str],
    alt_token: Optional[str],
) -> Optional[str]:
    if authorization:
        return authorization
    if alt_token:
        stripped = alt_token.strip()
        if not stripped:
            return None
        if stripped.lower().startswith("bearer "):
            return stripped
        return f"Bearer {stripped}"
    return None


def require_issuer_token(
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Header(None, alias="access-token"),
) -> None:
    header_value = _merge_authorization(authorization, access_token)
    _validate_token(header_value, ISSUER_ACCESS_TOKENS, "issuer")


def require_verifier_token(
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Header(None, alias="access-token"),
) -> None:
    header_value = _merge_authorization(authorization, access_token)
    _validate_token(header_value, VERIFIER_ACCESS_TOKENS, "verifier")


def require_wallet_token(
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Header(None, alias="access-token"),
) -> None:
    header_value = _merge_authorization(authorization, access_token)
    _validate_token(header_value, WALLET_ACCESS_TOKENS, "wallet")


def require_any_sandbox_token(
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Header(None, alias="access-token"),
) -> None:
    header_value = _merge_authorization(authorization, access_token)
    if header_value is None:
        _raise_problem(
            status=401,
            type_="https://medssi.dev/errors/missing-token",
            title="Sandbox token required",
            detail="Provide issuer, wallet, or verifier token.",
        )
    try:
        _validate_token(header_value, ISSUER_ACCESS_TOKENS, "issuer")
        return
    except HTTPException:
        pass
    try:
        _validate_token(header_value, VERIFIER_ACCESS_TOKENS, "verifier")
        return
    except HTTPException:
        pass
    _validate_token(header_value, WALLET_ACCESS_TOKENS, "wallet")


@app.middleware("http")
async def cleanup_expired_middleware(request, call_next):
    store.cleanup_expired()
    response = await call_next(request)
    return response


# ==================== Pydantic Models ====================

class IssuanceWithDataRequest(BaseModel):
    issuer_id: str = Field(..., alias="issuerId")
    holder_did: Optional[str] = Field(None, alias="holderDid")
    holder_hint: Optional[str] = Field(None, alias="holderHint")
    ial: IdentityAssuranceLevel = Field(IdentityAssuranceLevel.NHI_CARD_PIN, alias="ial")
    primary_scope: DisclosureScope = Field(DisclosureScope.MEDICAL_RECORD, alias="primaryScope")
    payload: Optional[Union[CredentialPayload, Dict[str, Any]]] = Field(None, alias="payload")
    disclosure_policies: Optional[List[DisclosurePolicy]] = Field(
        default=None, alias="disclosurePolicies"
    )
    valid_for_minutes: int = Field(5, ge=1, le=5, alias="validMinutes")
    transaction_id: Optional[str] = Field(None, alias="transactionId")

    class Config:
        allow_population_by_field_name = True


class IssuanceWithoutDataRequest(BaseModel):
    issuer_id: str = Field(..., alias="issuerId")
    ial: IdentityAssuranceLevel = Field(IdentityAssuranceLevel.NHI_CARD_PIN, alias="ial")
    primary_scope: DisclosureScope = Field(DisclosureScope.MEDICAL_RECORD, alias="primaryScope")
    disclosure_policies: Optional[List[DisclosurePolicy]] = Field(
        default=None, alias="disclosurePolicies"
    )
    valid_for_minutes: int = Field(5, ge=1, le=5, alias="validMinutes")
    holder_hint: Optional[str] = Field(None, alias="holderHint")
    holder_did: Optional[str] = Field(None, alias="holderDid")
    transaction_id: Optional[str] = Field(None, alias="transactionId")
    payload_template: Optional[Union[CredentialPayload, Dict[str, Any]]] = Field(
        None, alias="payloadTemplate"
    )

    class Config:
        allow_population_by_field_name = True


class VerificationSubmission(BaseModel):
    session_id: str
    credential_id: str
    holder_did: str
    disclosed_fields: Dict[str, str]


class ResetResponse(BaseModel):
    message: str
    timestamp: datetime


class MODAIssuanceField(BaseModel):
    ename: str
    content: Optional[str] = ""


class MODAIssuanceRequest(BaseModel):
    vc_uid: str = Field(..., alias="vcUid")
    issuance_date: Optional[date] = Field(None, alias="issuanceDate")
    expired_date: Optional[date] = Field(None, alias="expiredDate")
    fields: List[MODAIssuanceField] = Field(default_factory=list, alias="fields")
    holder_did: Optional[str] = Field(None, alias="holderDid")
    issuer_id: Optional[str] = Field(None, alias="issuerId")
    transaction_id: Optional[str] = Field(None, alias="transactionId")
    valid_minutes: Optional[int] = Field(None, alias="validMinutes")
    ial: Optional[IdentityAssuranceLevel] = Field(None, alias="ial")

    class Config:
        allow_population_by_field_name = True


class GovIssueResponse(BaseModel):
    """官方格式：使用 camelCase"""
    transaction_id: str = Field(..., alias="transactionId")
    qr_code: str = Field(..., alias="qrCode")
    qr_payload: str = Field(..., alias="qrPayload")
    deep_link: str = Field(..., alias="deepLink")
    credential_id: str = Field(..., alias="credentialId")
    expires_at: datetime = Field(..., alias="expiresAt")
    ial: IdentityAssuranceLevel = Field(..., alias="ial")
    ial_description: str = Field(..., alias="ialDescription")
    scope: DisclosureScope = Field(..., alias="scope")

    class Config:
        allow_population_by_field_name = True
        by_alias = True  # 重要：序列化時使用 camelCase


class GovCredentialNonceResponse(BaseModel):
    transaction_id: str = Field(..., alias="transactionId")
    credential_id: str = Field(..., alias="credentialId")
    credential_status: CredentialStatus = Field(..., alias="credentialStatus")
    nonce: str = Field(..., alias="nonce")
    ial: IdentityAssuranceLevel = Field(..., alias="ial")
    ial_description: str = Field(..., alias="ialDescription")
    mode: IssuanceMode = Field(..., alias="mode")
    expires_at: datetime = Field(..., alias="expiresAt")
    payload_available: bool = Field(..., alias="payloadAvailable")
    disclosure_policies: List[DisclosurePolicy] = Field(..., alias="disclosurePolicies")
    payload_template: Optional[CredentialPayload] = Field(None, alias="payloadTemplate")
    payload: Optional[CredentialPayload] = Field(None, alias="payload")
    credential: str = Field(..., alias="credential")

    class Config:
        allow_population_by_field_name = True
        by_alias = True


class OIDVPSessionRequest(BaseModel):
    verifier_id: str = Field(..., alias="verifierId")
    verifier_name: str = Field(..., alias="verifierName")
    purpose: Optional[str] = Field("憑證驗證", alias="purpose")
    scope: DisclosureScope = Field(DisclosureScope.MEDICAL_RECORD, alias="scope")
    ial: IdentityAssuranceLevel = Field(IdentityAssuranceLevel.NHI_CARD_PIN, alias="ial")
    fields: Optional[List[str]] = Field(None, alias="fields")
    valid_minutes: int = Field(5, ge=1, le=10, alias="validMinutes")
    transaction_id: Optional[str] = Field(None, alias="transactionId")
    ref: Optional[str] = Field(None, alias="ref")

    class Config:
        allow_population_by_field_name = True


class OIDVPQRCodeResponse(BaseModel):
    """官方格式：qrcodeImage, authUri"""
    transaction_id: str = Field(..., alias="transactionId")
    qrcode_image: str = Field(..., alias="qrcodeImage")
    auth_uri: str = Field(..., alias="authUri")
    qr_payload: str = Field(..., alias="qrPayload")
    scope: DisclosureScope = Field(..., alias="scope")
    ial: IdentityAssuranceLevel = Field(..., alias="ial")
    expires_at: datetime = Field(..., alias="expiresAt")

    class Config:
        allow_population_by_field_name = True
        by_alias = True


class OIDVPResultRequest(BaseModel):
    """官方格式：POST body 帶 transactionId"""
    transaction_id: str = Field(..., alias="transactionId")

    class Config:
        allow_population_by_field_name = True


class OIDVPResultResponse(BaseModel):
    """官方格式：verifyResult, resultDescription"""
    verify_result: bool = Field(..., alias="verifyResult")
    result_description: str = Field(..., alias="resultDescription")
    transaction_id: str = Field(..., alias="transactionId")
    data: List[Dict[str, Any]] = Field(default_factory=list, alias="data")

    class Config:
        allow_population_by_field_name = True
        by_alias = True


# ==================== Helper Functions ====================

def _build_qr_payload(token: str, kind: str, *, transaction_id: Optional[str] = None) -> str:
    if kind == "credential":
        request_uri = f"{OID4VCI_REQUEST_BASE.rstrip('/')}/{token}"
        params = {
            "client_id_scheme": "redirect_uri",
            "state": transaction_id or secrets.token_urlsafe(12),
            "request_uri": request_uri,
            "client_id": OID4VCI_CLIENT_ID,
        }
        return f"{WALLET_SCHEME}credential_offer?{urlencode(params)}"

    if kind in {"vp-session", "oidvp"}:
        request_uri = f"{OIDVP_REQUEST_BASE.rstrip('/')}/{token}"
        params = {
            "client_id_scheme": "redirect_uri",
            "state": transaction_id or secrets.token_urlsafe(12),
            "nonce": secrets.token_urlsafe(12),
            "client_id": OIDVP_CLIENT_ID,
            "request_uri": request_uri,
            "response_mode": "direct_post",
        }
        return f"{WALLET_SCHEME}authorize?{urlencode(params)}"

    return f"medssi://{kind}?token={token}"


def _make_qr_data_uri(payload: str) -> str:
    if qrcode is not None:
        buffer = io.BytesIO()
        image = qrcode.make(payload)
        image.save(buffer, format="PNG")
        encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        return f"data:image/png;base64,{encoded}"
    encoded = base64.b64encode(payload.encode("utf-8")).decode("ascii")
    return f"data:text/plain;base64,{encoded}"


def _normalize_vc_uid(vc_uid: str) -> str:
    slug = vc_uid.lower()
    if "_" in slug:
        slug = slug.split("_")[-1]
    return slug


MODA_VC_SCOPE_MAP = {
    "vc_cond": DisclosureScope.MEDICAL_RECORD,
    "vc_algy": DisclosureScope.MEDICAL_RECORD,
    "vc_pid": DisclosureScope.MEDICAL_RECORD,
    "vc_cons": DisclosureScope.RESEARCH_ANALYTICS,
    "vc_rx": DisclosureScope.MEDICATION_PICKUP,
    "cond": DisclosureScope.MEDICAL_RECORD,
    "rx": DisclosureScope.MEDICATION_PICKUP,
}

MODA_SCOPE_DEFAULT_FIELDS = {
    DisclosureScope.MEDICAL_RECORD: ["cond_code", "cond_display", "cond_onset"],
    DisclosureScope.MEDICATION_PICKUP: [
        "med_code",
        "med_name",
        "qty_value",
        "pickup_deadline",
    ],
    DisclosureScope.RESEARCH_ANALYTICS: ["cons_scope", "cons_purpose"],
}

MODA_FIELD_TO_FHIR = {
    "cond_code": "condition.code.coding[0].code",
    "cond_display": "condition.code.coding[0].display",
    "cond_onset": "condition.recordedDate",
    "med_code": "medication_dispense[0].medicationCodeableConcept.coding[0].code",
    "med_name": "medication_dispense[0].medicationCodeableConcept.coding[0].display",
    "qty_value": "medication_dispense[0].days_supply",
    "pickup_deadline": "medication_dispense[0].pickup_window_end",
}

CAMEL_TO_SNAKE = re.compile(r"(?<!^)(?=[A-Z])")


def _canonical_alias_key(name: str) -> str:
    if not name:
        return ""
    raw = name.strip()
    if not raw:
        return ""
    normalized = raw.replace("-", "_").strip()
    lower_key = normalized.lower()
    
    # 直接映射
    alias_map = {
        "condcode": "cond_code",
        "conditioncode": "cond_code",
        "conddisplay": "cond_display",
        "condonset": "cond_onset",
        "medcode": "med_code",
        "medname": "med_name",
        "qtyvalue": "qty_value",
        "pickupdeadline": "pickup_deadline",
    }
    
    if lower_key in alias_map:
        return alias_map[lower_key]
    
    # camelCase 轉 snake_case
    camel_snake = CAMEL_TO_SNAKE.sub("_", normalized).lower()
    if camel_snake in alias_map:
        return alias_map[camel_snake]
    
    return normalized


def _mock_credential_jwt(offer: CredentialOffer) -> str:
    header = {"typ": "JWT", "alg": "ES256"}
    payload = {
        "jti": f"https://medssi.dev/api/credential/{offer.credential_id}",
        "sub": offer.holder_did or "did:example:patient-demo",
        "iss": offer.issuer_id,
        "iat": int(offer.created_at.timestamp()),
        "exp": int(offer.expires_at.timestamp()),
        "scope": offer.primary_scope.value,
        "nonce": offer.nonce,
        "ial": offer.ial.value,
    }
    encoded_header = base64.urlsafe_b64encode(json.dumps(header).encode("utf-8")).decode(
        "ascii"
    ).rstrip("=")
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode("utf-8")).decode(
        "ascii"
    ).rstrip("=")
    signature = base64.urlsafe_b64encode(
        f"sig:{offer.credential_id}".encode("utf-8")
    ).decode("ascii").rstrip("=")
    return f"{encoded_header}.{encoded_payload}.{signature}"


def _default_disclosure_policies() -> List[DisclosurePolicy]:
    return [
        DisclosurePolicy(
            scope=DisclosureScope.MEDICAL_RECORD,
            fields=[
                "condition.code.coding[0].code",
                "condition.recordedDate",
                "managing_organization.value",
            ],
            description="跨院病歷摘要",
        ),
        DisclosurePolicy(
            scope=DisclosureScope.MEDICATION_PICKUP,
            fields=[
                "medication_dispense[0].medicationCodeableConcept.coding[0].code",
                "medication_dispense[0].days_supply",
                "medication_dispense[0].pickup_window_end",
            ],
            description="領藥資訊",
        ),
        DisclosurePolicy(
            scope=DisclosureScope.RESEARCH_ANALYTICS,
            fields=["condition.code.coding[0].code", "encounter_summary_hash"],
            description="匿名化研究卡",
        ),
    ]


def _ensure_valid_policies(policies: List[DisclosurePolicy]) -> None:
    if not policies:
        _raise_problem(
            status=400,
            type_="https://medssi.dev/errors/policy-empty",
            title="Disclosure policies required",
            detail="Select at least one disclosure policy scope.",
        )

    seen_scopes = set()
    for policy in policies:
        if policy.scope in seen_scopes:
            _raise_problem(
                status=400,
                type_="https://medssi.dev/errors/policy-duplicate",
                title="Duplicate disclosure scope",
                detail=f"Scope {policy.scope} defined more than once.",
            )
        seen_scopes.add(policy.scope)
        if not policy.fields:
            _raise_problem(
                status=400,
                type_="https://medssi.dev/errors/policy-fields-empty",
                title="Disclosure fields required",
                detail=f"Scope {policy.scope} must list at least one field.",
            )


def _resolve_policies(policies: Optional[List[DisclosurePolicy]]) -> List[DisclosurePolicy]:
    if policies:
        _ensure_valid_policies(policies)
        return policies
    defaults = _default_disclosure_policies()
    _ensure_valid_policies(defaults)
    return defaults


def _sample_payload() -> CredentialPayload:
    today = date.today()
    sample_dict: Dict[str, Any] = {
        "fhir_profile": "https://profiles.iisigroup.com.tw/StructureDefinition/medssi-bundle",
        "condition": {
            "resourceType": "Condition",
            "id": "cond-sample",
            "code": {
                "coding": [
                    {
                        "system": "http://hl7.org/fhir/sid/icd-10",
                        "code": "K29.7",
                        "display": "Gastritis, unspecified",
                    }
                ],
                "text": "Gastritis, unspecified",
            },
            "recordedDate": today.isoformat(),
            "encounter": {"system": "urn:medssi:encounter-id", "value": "enc-sample"},
            "subject": {"system": "did:example", "value": "did:example:patient-demo"},
        },
        "encounter_summary_hash": "urn:sha256:demo-sample-hash",
        "managing_organization": {"system": "urn:medssi:org", "value": "org:demo-hospital"},
        "issued_on": today.isoformat(),
        "consent_expires_on": None,
        "medication_dispense": [],
    }
    return CredentialPayload.parse_obj(sample_dict)


def _deep_merge(target: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    for key, value in updates.items():
        if value is None:
            continue
        if key not in target:
            target[key] = value
            continue
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            target[key] = _deep_merge(dict(target[key]), value)
        else:
            target[key] = value
    return target


def _payload_overrides_from_alias(alias_map: Dict[str, str]) -> Optional[Dict[str, Any]]:
    overrides: Dict[str, Any] = {}

    def merge(update: Dict[str, Any]) -> None:
        nonlocal overrides
        overrides = _deep_merge(overrides, update)

    if alias_map.get("cond_code"):
        merge({
            "condition": {
                "code": {
                    "coding": [{
                        "system": "http://hl7.org/fhir/sid/icd-10",
                        "code": alias_map["cond_code"],
                    }]
                }
            }
        })
    if alias_map.get("cond_display"):
        merge({
            "condition": {
                "code": {
                    "coding": [{"display": alias_map["cond_display"]}],
                    "text": alias_map["cond_display"],
                }
            }
        })
    if alias_map.get("cond_onset"):
        merge({"condition": {"recordedDate": alias_map["cond_onset"]}})

    if alias_map.get("med_code"):
        merge({
            "medication_dispense": [{
                "medicationCodeableConcept": {
                    "coding": [{
                        "system": "http://www.whocc.no/atc",
                        "code": alias_map["med_code"],
                    }]
                }
            }]
        })
    if alias_map.get("med_name"):
        merge({
            "medication_dispense": [{
                "medicationCodeableConcept": {
                    "coding": [{"display": alias_map["med_name"]}],
                    "text": alias_map["med_name"],
                }
            }]
        })
    
    qty_value = alias_map.get("qty_value")
    if qty_value:
        try:
            days_supply = int(qty_value)
        except ValueError:
            days_supply = None
        merge({
            "medication_dispense": [{
                "days_supply": days_supply if days_supply is not None else qty_value,
            }]
        })
    
    if alias_map.get("pickup_deadline"):
        merge({
            "medication_dispense": [{
                "pickup_window_end": alias_map["pickup_deadline"],
            }]
        })

    return overrides or None


def _coerce_payload(
    payload: Optional[Union[CredentialPayload, Dict[str, Any]]]
) -> CredentialPayload:
    if isinstance(payload, CredentialPayload):
        return payload
    sample = _sample_payload()
    if payload is None:
        return sample
    if isinstance(payload, dict):
        base = sample.dict()
        merged = _deep_merge(base, payload)
        try:
            return CredentialPayload.parse_obj(merged)
        except ValidationError:
            return sample
    try:
        return CredentialPayload.parse_obj(payload)
    except ValidationError:
        return sample


def _issue_offer(
    *,
    issuer_id: str,
    primary_scope: DisclosureScope,
    ial: IdentityAssuranceLevel,
    mode: IssuanceMode,
    disclosure_policies: List[DisclosurePolicy],
    valid_for_minutes: int,
    holder_did: Optional[str],
    holder_hint: Optional[str],
    payload: Optional[CredentialPayload] = None,
    payload_template: Optional[CredentialPayload] = None,
    transaction_id: Optional[str] = None,
    selected_disclosures: Optional[Dict[str, str]] = None,
    external_fields: Optional[Dict[str, str]] = None,
) -> Tuple[CredentialOffer, str]:
    offer = _create_offer(
        issuer_id=issuer_id,
        primary_scope=primary_scope,
        ial=ial,
        mode=mode,
        disclosure_policies=disclosure_policies,
        valid_for
