from __future__ import annotations

import base64
import io
import json
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
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
    Request,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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


try:  # pragma: no cover - optional dependency for nicer QR codes
    import qrcode
except Exception:  # pragma: no cover - fallback to text payloads
    qrcode = None

app = FastAPI(title="MedSSI Sandbox APIs", version="0.6.0")
allowed_origins_env = os.getenv(
    "MEDSSI_ALLOWED_ORIGINS",
    (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,"
        "http://127.0.0.1:5174,http://localhost:4173"
    ),
)
ALLOWED_ORIGINS = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
allowed_origin_regex = os.getenv(
    "MEDSSI_ALLOWED_ORIGIN_REGEX",
    r"https?://(localhost|127\.0\.0\.1|192\.168\.[0-9]{1,3}\.[0-9]{1,3})(:[0-9]{2,5})?",
).strip()

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=allowed_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)
api_v2 = APIRouter(prefix="/v2", tags=["MedSSI v2"])


def _load_tokens(env_name: str, default: str) -> List[str]:
    raw = os.getenv(env_name, default)
    return [token.strip() for token in raw.split(",") if token.strip()]


ISSUER_ACCESS_TOKENS = _load_tokens(
    "MEDSSI_ISSUER_TOKEN", "koreic2ZEFZ2J4oo2RaZu58yGVXiqDQy"
)
VERIFIER_ACCESS_TOKENS = _load_tokens(
    "MEDSSI_VERIFIER_TOKEN", "J3LdHEiVxmHBYJ6iStnmATLblzRkz2AC"
)
WALLET_ACCESS_TOKENS = _load_tokens("MEDSSI_WALLET_TOKEN", "wallet-sandbox-token")
DEFAULT_ISSUER_ID = os.getenv(
    "MEDSSI_DEFAULT_ISSUER_ID", "did:example:moda-issuer"
)

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
GOV_ISSUER_BASE = os.getenv(
    "MEDSSI_GOV_ISSUER_BASE", "https://issuer-sandbox.wallet.gov.tw"
)
GOV_VERIFIER_BASE = os.getenv(
    "MEDSSI_GOV_VERIFIER_BASE", "https://verifier-sandbox.wallet.gov.tw"
)


print(f"🌐 Gov issuer base: {GOV_ISSUER_BASE}")
print(f"🌐 Gov verifier base: {GOV_VERIFIER_BASE}")

def _normalize_identifier_slug(value: str) -> str:
    slug = (value or "").strip().lower()
    if "_" in slug:
        slug = slug.split("_")[-1]
    return slug


DEFAULT_MODA_VC_IDENTIFIERS: Dict[str, Dict[str, str]] = {
    "vc_cons": {"vcUid": "00000000_vc_cons", "vcCid": "vc_cons"},
    "vc_cond": {"vcUid": "00000000_vc_cond", "vcCid": "vc_cond"},
    "vc_algy": {"vcUid": "00000000_vc_algy", "vcCid": "vc_algy"},
    "vc_rx": {"vcUid": "00000000_vc_rx", "vcCid": "vc_rx"},
    "vc_pid": {"vcUid": "00000000_vc_pid", "vcCid": "vc_pid"},
}


def _load_moda_identifier_config() -> Dict[str, Dict[str, str]]:
    config = {slug: dict(values) for slug, values in DEFAULT_MODA_VC_IDENTIFIERS.items()}
    raw = os.getenv("MEDSSI_MODA_VC_IDENTIFIERS", "").strip()
    if not raw:
        return config
    try:
        overrides = json.loads(raw)
    except json.JSONDecodeError:
        return config
    if not isinstance(overrides, dict):
        return config
    for key, value in overrides.items():
        slug = _normalize_identifier_slug(str(key))
        if not slug:
            continue
        if not isinstance(value, dict):
            continue
        target = config.setdefault(slug, {})
        for field_key, field_value in value.items():
            if field_key not in {"vcUid", "vcId", "vcCid", "apiKey"}:
                continue
            if field_value is None:
                continue
            text = str(field_value).strip()
            if not text:
                continue
            target[field_key] = text
    return config


MODA_VC_IDENTIFIERS = _load_moda_identifier_config()

DEFAULT_VERIFIER_REF = os.getenv(
    "MEDSSI_VERIFIER_REF_DEFAULT", "00000000_vp_consent"
)
DEFAULT_SCOPE_REF_MAP = {
    DisclosureScope.MEDICAL_RECORD: os.getenv(
        "MEDSSI_VERIFIER_REF_CONSENT", DEFAULT_VERIFIER_REF
    ),
    DisclosureScope.RESEARCH_ANALYTICS: os.getenv(
        "MEDSSI_VERIFIER_REF_RESEARCH", "00000000_vp_research"
    ),
    DisclosureScope.MEDICATION_PICKUP: os.getenv(
        "MEDSSI_VERIFIER_REF_RX", "00000000_vp_rx_pickup"
    ),
}


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


def _normalize_authorization_header(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    if " " not in stripped:
        return f"Bearer {stripped}"
    scheme, _, token = stripped.partition(" ")
    if not token:
        return None
    if scheme.lower() == "bearer":
        return f"Bearer {token.strip()}"
    # Preserve original token but coerce into Bearer format so downstream
    # validation continues to compare only against the token payload. This
    # mirrors the MODA samples where Authorization headers may omit the
    # explicit scheme or use custom identifiers.
    return f"Bearer {token.strip()}"


def _merge_authorization(
    authorization: Optional[str],
    alt_token: Optional[str],
) -> Optional[str]:
    header = _normalize_authorization_header(authorization)
    if header:
        return header
    if alt_token:
        return _normalize_authorization_header(alt_token)
    return None


def _extract_token_from_request(request: Request) -> str:
    header_value = _merge_authorization(
        request.headers.get("authorization"), request.headers.get("access-token")
    )
    if not header_value:
        _raise_problem(
            status=401,
            type_="https://medssi.dev/errors/missing-token",
            title="Token required",
            detail="Provide issuer, wallet, or verifier token.",
        )
    _, _, token = header_value.partition(" ")
    return token.strip()


def _call_remote_api(
    *,
    method: str,
    base_url: str,
    path: str,
    token: str,
    payload: Optional[Dict[str, Any]] = None,
    params: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    url = base_url.rstrip("/") + path
    if params:
        encoded = urllib.parse.urlencode(
            {key: value for key, value in params.items() if value is not None}, doseq=True
        )
        if encoded:
            url = f"{url}?{encoded}"

    data: Optional[bytes] = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")

    request = urllib.request.Request(url, data=data, method=method.upper())
    request.add_header("Content-Type", "application/json")
    request.add_header("access-token", token)

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read()
            if not body:
                return {}
            encoding = response.headers.get_content_charset() or "utf-8"
            text = body.decode(encoding)
            if not text:
                return {}
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                return {"raw": text}
    except urllib.error.HTTPError as exc:
        detail: Any = {
            "code": str(exc.code),
            "message": exc.reason or "Remote service error",
        }
        try:
            payload_text = exc.read().decode("utf-8")
            if payload_text:
                detail = json.loads(payload_text)
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            detail = {
                "code": str(exc.code),
                "message": exc.reason or "Remote service error",
            }
        raise HTTPException(status_code=exc.code or 502, detail=detail) from None
    except urllib.error.URLError as exc:
        _raise_problem(
            status=502,
            type_="https://medssi.dev/errors/remote-unavailable",
            title="Remote service unavailable",
            detail=str(exc.reason) if exc.reason else "Unable to reach sandbox APIs.",
        )


def _resolve_verifier_ref(
    scope: Optional[DisclosureScope], ref: Optional[str]
) -> str:
    if ref:
        return ref
    if scope and scope in DEFAULT_SCOPE_REF_MAP:
        mapped = DEFAULT_SCOPE_REF_MAP[scope]
        if mapped:
            return mapped
    return DEFAULT_VERIFIER_REF


def _format_gov_date(value: Optional[Union[str, date, datetime]]) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime("%Y%m%d")
    if isinstance(value, str):
        digits = value.replace("-", "").strip()
        if len(digits) == 8 and digits.isdigit():
            return digits
        return value
    return str(value)


def _build_moda_field_entries(request: MODAIssuanceRequest) -> List[Dict[str, str]]:
    vc_slug = _normalize_vc_uid(request.vc_uid)
    provided: Dict[str, Dict[str, str]] = {}
    for field in request.fields:
        canonical = _canonical_alias_key(field.ename)
        if not canonical:
            continue
        field_type = (field.field_type or "NORMAL").strip() or "NORMAL"
        provided[canonical] = {
            "content": "" if field.content is None else str(field.content),
            "type": field_type,
        }

    sample_raw = MODA_SAMPLE_FIELD_VALUES.get(vc_slug, {})
    sample_values: Dict[str, Dict[str, str]] = {
        key: {"content": value, "type": "NORMAL"}
        for key, value in sample_raw.items()
    }

    merged: Dict[str, Dict[str, str]] = {**sample_values, **provided}

    required_order = MODA_VC_FIELD_KEYS.get(vc_slug)
    if not required_order:
        required_order = list(sample_values.keys()) or list(merged.keys())

    ordered_keys: List[str] = []
    for key in required_order:
        if key and key not in ordered_keys:
            ordered_keys.append(key)
    for key in merged.keys():
        if key and key not in ordered_keys:
            ordered_keys.append(key)

    if not ordered_keys:
        ordered_keys = list(merged.keys())

    if not ordered_keys and sample_values:
        ordered_keys = list(sample_values.keys())

    fields: List[Dict[str, str]] = []
    for key in ordered_keys:
        entry = merged.get(key, {"content": "", "type": "NORMAL"})
        fields.append(
            {
                "ename": key,
                "content": entry.get("content", ""),
                "type": entry.get("type", "NORMAL") or "NORMAL",
            }
        )

    return fields


def _prepare_moda_remote_payload(raw_payload: Dict[str, Any]) -> Dict[str, Any]:
    try:
        moda_request = MODAIssuanceRequest.parse_obj(raw_payload)
    except ValidationError:
        return raw_payload

    payload = dict(raw_payload)

    slug = _normalize_vc_uid(moda_request.vc_uid)
    identifiers = MODA_VC_IDENTIFIERS.get(slug, {})

    payload["vcUid"] = moda_request.vc_uid or identifiers.get("vcUid")
    if not payload.get("vcUid") and identifiers.get("vcUid"):
        payload["vcUid"] = identifiers["vcUid"]
    if moda_request.vc_id:
        payload["vcId"] = moda_request.vc_id
    elif not payload.get("vcId") and identifiers.get("vcId"):
        payload["vcId"] = identifiers["vcId"]
    if moda_request.vc_cid:
        payload["vcCid"] = moda_request.vc_cid
    elif not payload.get("vcCid") and identifiers.get("vcCid"):
        payload["vcCid"] = identifiers["vcCid"]
    if moda_request.api_key:
        payload["apiKey"] = moda_request.api_key
    elif not payload.get("apiKey") and identifiers.get("apiKey"):
        payload["apiKey"] = identifiers["apiKey"]
    if moda_request.issuer_id:
        payload["issuerId"] = moda_request.issuer_id
    if moda_request.holder_did:
        payload["holderDid"] = moda_request.holder_did

    if "issuanceDate" not in payload:
        payload["issuanceDate"] = _format_gov_date(moda_request.issuance_date) or _format_gov_date(
            date.today()
        )
    else:
        payload["issuanceDate"] = _format_gov_date(payload["issuanceDate"])

    if "expiredDate" in payload:
        payload["expiredDate"] = _format_gov_date(payload["expiredDate"])
    elif moda_request.expired_date:
        payload["expiredDate"] = _format_gov_date(moda_request.expired_date)

    fields = _build_moda_field_entries(moda_request)
    payload["fields"] = fields

    cleaned: Dict[str, Any] = {}
    field_slug = _normalize_vc_uid(payload.get("vcUid"))
    required_fields = MODA_VC_FIELD_KEYS.get(field_slug, []) or []
    sample_values = MODA_SAMPLE_FIELD_VALUES.get(field_slug, {})

    for key, value in payload.items():
        if value is None:
            continue
        if key == "fields" and isinstance(value, list):
            cleaned_fields = []
            for item in value:
                if not isinstance(item, dict):
                    continue
                ename = item.get("ename") or item.get("name")
                if not ename:
                    continue
                content = item.get("content")
                if content is None:
                    content = item.get("value", "")
                entry_type = item.get("type") or "NORMAL"
                cleaned_fields.append(
                    {"ename": ename, "content": content, "type": entry_type}
                )

            if cleaned_fields:
                field_map = {entry["ename"]: entry for entry in cleaned_fields}
                for required_key in required_fields:
                    entry = field_map.get(required_key)
                    needs_fallback = not entry or not str(entry.get("content", "")).strip()
                    if needs_fallback:
                        fallback_value = sample_values.get(required_key)
                        if fallback_value is not None:
                            field_map[required_key] = {
                                "ename": required_key,
                                "content": fallback_value,
                                "type": "NORMAL",
                            }

                ordered_fields: List[Dict[str, str]] = []
                for required_key in required_fields:
                    entry = field_map.get(required_key)
                    if not entry:
                        continue
                    content_text = str(entry.get("content", "")).strip()
                    if content_text:
                        ordered_fields.append(
                            {
                                "ename": required_key,
                                "content": _normalize_moda_field_value(
                                    required_key, content_text
                                ),
                            }
                        )

                for entry in cleaned_fields:
                    name = entry["ename"]
                    if name in required_fields:
                        continue
                    content_text = str(entry.get("content", "")).strip()
                    if content_text:
                        ordered_fields.append(
                            {
                                "ename": name,
                                "content": _normalize_moda_field_value(
                                    name, content_text
                                ),
                            }
                        )

                if ordered_fields:
                    cleaned[key] = ordered_fields
            continue
        cleaned[key] = value

    return cleaned


def require_issuer_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Header(None, alias="access-token"),
) -> None:
    if request.method == "OPTIONS":
        return
    header_value = _merge_authorization(authorization, access_token)
    _validate_token(header_value, ISSUER_ACCESS_TOKENS, "issuer")


def require_verifier_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Header(None, alias="access-token"),
) -> None:
    if request.method == "OPTIONS":
        return
    header_value = _merge_authorization(authorization, access_token)
    _validate_token(header_value, VERIFIER_ACCESS_TOKENS, "verifier")


def require_wallet_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Header(None, alias="access-token"),
) -> None:
    if request.method == "OPTIONS":
        return
    header_value = _merge_authorization(authorization, access_token)
    _validate_token(header_value, WALLET_ACCESS_TOKENS, "wallet")


def require_any_sandbox_token(
    request: Request,
    authorization: Optional[str] = Header(None),
    access_token: Optional[str] = Header(None, alias="access-token"),
) -> None:
    if request.method == "OPTIONS":
        return
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


class IssuanceWithDataRequest(BaseModel):
    issuer_id: str = Field(..., alias="issuerId")
    holder_did: Optional[str] = Field(None, alias="holderDid")
    holder_hint: Optional[str] = Field(
        None,
        alias="holderHint",
        description="Optional hint shown to wallets (e.g. patient name)",
    )
    ial: IdentityAssuranceLevel = Field(
        IdentityAssuranceLevel.NHI_CARD_PIN, alias="ial"
    )
    primary_scope: DisclosureScope = Field(
        DisclosureScope.MEDICAL_RECORD, alias="primaryScope"
    )
    payload: Optional[Union[CredentialPayload, Dict[str, Any]]] = Field(
        None, alias="payload"
    )
    disclosure_policies: Optional[List[DisclosurePolicy]] = Field(
        default=None,
        alias="disclosurePolicies",
        description="Selective disclosure policies grouped by scope.",
    )
    valid_for_minutes: int = Field(5, ge=1, le=5, alias="validMinutes")
    transaction_id: Optional[str] = Field(None, alias="transactionId")

    class Config:
        allow_population_by_field_name = True


class IssuanceWithoutDataRequest(BaseModel):
    issuer_id: str = Field(..., alias="issuerId")
    ial: IdentityAssuranceLevel = Field(
        IdentityAssuranceLevel.NHI_CARD_PIN, alias="ial"
    )
    primary_scope: DisclosureScope = Field(
        DisclosureScope.MEDICAL_RECORD, alias="primaryScope"
    )
    disclosure_policies: Optional[List[DisclosurePolicy]] = Field(
        default=None, alias="disclosurePolicies"
    )
    valid_for_minutes: int = Field(5, ge=1, le=5, alias="validMinutes")
    holder_hint: Optional[str] = Field(None, alias="holderHint")
    holder_did: Optional[str] = Field(None, alias="holderDid")
    transaction_id: Optional[str] = Field(None, alias="transactionId")
    payload_template: Optional[Union[CredentialPayload, Dict[str, Any]]] = Field(
        None,
        alias="payloadTemplate",
        description="Template describing the FHIR structure the holder must supply.",
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
    ename: str = Field(..., alias="name")
    content: Optional[Union[str, int, float]] = Field("", alias="value")
    field_type: Optional[str] = Field("NORMAL", alias="type")

    class Config:
        allow_population_by_field_name = True


class MODAIssuanceRequest(BaseModel):
    vc_uid: str = Field(..., alias="vcUid")
    vc_id: Optional[str] = Field(None, alias="vcId")
    vc_cid: Optional[str] = Field(None, alias="vcCid")
    api_key: Optional[str] = Field(None, alias="apiKey")
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
    transaction_id: str = Field(..., alias="transactionId")
    qrcode_image: str = Field(..., alias="qrcodeImage")
    auth_uri: str = Field(..., alias="authUri")
    qr_payload: str = Field(..., alias="qrPayload")
    scope: DisclosureScope = Field(..., alias="scope")
    ial: IdentityAssuranceLevel = Field(..., alias="ial")
    expires_at: datetime = Field(..., alias="expiresAt")

    class Config:
        allow_population_by_field_name = True


class OIDVPResultRequest(BaseModel):
    transaction_id: str = Field(..., alias="transactionId")

    class Config:
        allow_population_by_field_name = True


class OIDVPResultResponse(BaseModel):
    verify_result: bool = Field(..., alias="verifyResult")
    result_description: str = Field(..., alias="resultDescription")
    transaction_id: str = Field(..., alias="transactionId")
    data: List[Dict[str, Any]] = Field(default_factory=list, alias="data")

    class Config:
        allow_population_by_field_name = True


class GovVerificationSessionResponse(BaseModel):
    session_id: str = Field(..., alias="sessionId")
    transaction_id: str = Field(..., alias="transactionId")
    verifier_id: str = Field(..., alias="verifierId")
    verifier_name: str = Field(..., alias="verifierName")
    purpose: str = Field(..., alias="purpose")
    ial: IdentityAssuranceLevel = Field(..., alias="ial")
    ial_description: str = Field(..., alias="ialDescription")
    scope: DisclosureScope = Field(..., alias="scope")
    allowed_fields: List[str] = Field(..., alias="allowedFields")
    created_at: datetime = Field(..., alias="createdAt")
    expires_at: datetime = Field(..., alias="expiresAt")
    ref: Optional[str] = Field(None, alias="ref")

    class Config:
        allow_population_by_field_name = True


def _build_qr_payload(
    token: str,
    kind: str,
    *,
    transaction_id: Optional[str] = None,
) -> str:
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
    return _normalize_identifier_slug(vc_uid)


MODA_VC_SCOPE_MAP = {
    "vc_cond": DisclosureScope.MEDICAL_RECORD,
    "vc_algy": DisclosureScope.MEDICAL_RECORD,
    "vc_cons": DisclosureScope.RESEARCH_ANALYTICS,
    "vc_rx": DisclosureScope.MEDICATION_PICKUP,
    "vc_pid": DisclosureScope.RESEARCH_ANALYTICS,
}


MODA_VC_FIELD_KEYS = {
    "vc_cons": ["cons_scope", "cons_purpose", "cons_end", "cons_path"],
    "vc_cond": ["cond_code", "cond_display", "cond_onset"],
    "vc_algy": ["algy_code", "algy_name", "algy_severity"],
    "vc_rx": ["med_code", "med_name", "dose_text", "qty_value", "qty_unit"],
    "vc_pid": [
        "pid_hash",
        "pid_type",
        "pid_ver",
        "pid_issuer",
        "pid_valid_to",
        "wallet_id",
    ],
}


MODA_SCOPE_DEFAULT_FIELDS = {
    DisclosureScope.MEDICAL_RECORD: ["cond_code", "cond_display", "cond_onset"],
    DisclosureScope.MEDICATION_PICKUP: [
        "med_code",
        "med_name",
        "dose_text",
        "qty_value",
        "qty_unit",
    ],
    DisclosureScope.RESEARCH_ANALYTICS: [
        "cons_scope",
        "cons_purpose",
        "cons_end",
        "cons_path",
        "pid_hash",
        "pid_type",
        "pid_ver",
        "pid_issuer",
        "pid_valid_to",
        "wallet_id",
    ],
}


MODA_FIELD_TO_FHIR = {
    "cond_code": "condition.code.coding[0].code",
    "cond_display": "condition.code.coding[0].display",
    "cond_onset": "condition.recordedDate",
    "med_code": "medication_dispense[0].medicationCodeableConcept.coding[0].code",
    "med_name": "medication_dispense[0].medicationCodeableConcept.coding[0].display",
    "qty_value": "medication_dispense[0].days_supply",
    "qty_unit": "medication_dispense[0].quantity_text",
    "dose_text": "medication_dispense[0].dose_text",
    "medication_list[0].medication_code": "medication_dispense[0].medicationCodeableConcept.coding[0].code",
    "medication_list[0].medication_name": "medication_dispense[0].medicationCodeableConcept.coding[0].display",
    "medication_list[0].dosage": "medication_dispense[0].days_supply",
    "condition_info.condition_code": "condition.code.coding[0].code",
    "condition_info.condition_display": "condition.code.coding[0].display",
    "condition_info.condition_onset": "condition.recordedDate",
    "algy_code": "allergies[0].code.coding[0].code",
    "algy_name": "allergies[0].code.coding[0].display",
    "algy_severity": "allergies[0].criticality",
    "cons_scope": "consent.scope",
    "cons_purpose": "consent.purpose",
    "cons_path": "consent.path",
    "pid_hash": "patient_digest.hashed_id",
    "pid_type": "patient_digest.document_type",
    "pid_ver": "patient_digest.document_version",
    "pid_issuer": "patient_digest.issuer",
    "pid_valid_to": "patient_digest.valid_to",
    "wallet_id": "patient_digest.wallet_id",
}


MODA_FIELD_DIRECT_ALIASES = {
    "medicationList[0].medicationCode": "medication_list[0].medication_code",
    "medicationList[0].medicationName": "medication_list[0].medication_name",
    "medicationList[0].dosage": "medication_list[0].dosage",
    "medicationList[0].doseText": "dose_text",
    "pickupInfo.pickupDeadline": "pickup_info.pickup_deadline",
    "conditionInfo.conditionCode": "condition_info.condition_code",
    "conditionInfo.conditionDisplay": "condition_info.condition_display",
    "conditionInfo.conditionOnset": "condition_info.condition_onset",
    "consentInfo.consentEnd": "cons_end",
    "identityInfo.pidHash": "pid_hash",
    "identityInfo.pidType": "pid_type",
    "identityInfo.pidVer": "pid_ver",
    "identityInfo.pidIssuer": "pid_issuer",
    "identityInfo.pidValidTo": "pid_valid_to",
    "identityInfo.walletId": "wallet_id",
}


MODA_FIELD_LOWER_ALIASES = {
    "condcode": "cond_code",
    "conditioncode": "cond_code",
    "cond_display": "cond_display",
    "conditiondisplay": "cond_display",
    "condonset": "cond_onset",
    "conditiononset": "cond_onset",
    "medcode": "med_code",
    "medicationcode": "med_code",
    "medname": "med_name",
    "medicationname": "med_name",
    "qtyvalue": "qty_value",
    "dosage": "qty_value",
    "qtyunit": "qty_unit",
    "dosetext": "dose_text",
    "consentscope": "cons_scope",
    "consentpurpose": "cons_purpose",
    "consentpath": "cons_path",
    "consentend": "cons_end",
    "algycode": "algy_code",
    "algyname": "algy_name",
    "algyseverity": "algy_severity",
    "pidhash": "pid_hash",
    "pidtype": "pid_type",
    "pidver": "pid_ver",
    "pidissuer": "pid_issuer",
    "pidvalidto": "pid_valid_to",
    "walletid": "wallet_id",
}


MODA_SAMPLE_FIELD_VALUES = {
    "vc_cons": {
        "cons_scope": "MEDSSI01",
        "cons_purpose": "MEDDATARESEARCH",
        "cons_end": "2025-05-07",
        "cons_path": "IRB_2025_001",
    },
    "vc_cond": {
        "cond_code": "K2970",
        "cond_display": "CHRONICGASTRITIS",
        "cond_onset": "2025-02-12",
    },
    "vc_algy": {
        "algy_code": "ALG001",
        "algy_name": "PENICILLIN",
        "algy_severity": "2",
    },
    "vc_rx": {
        "med_code": "A02BC05",
        "med_name": "OMEPRAZOLE",
        "dose_text": "BID10ML",
        "qty_value": "30",
        "qty_unit": "TABLET",
    },
    "vc_pid": {
        "pid_hash": "12345678",
        "pid_type": "01",
        "pid_ver": "01",
        "pid_issuer": "886",
        "pid_valid_to": (date.today() + timedelta(days=3650)).isoformat(),
        "wallet_id": "10000001",
    },
}

MODA_DATE_FIELDS = {"cons_end", "cond_onset", "pid_valid_to", "pickup_deadline"}
MODA_INTEGER_FIELDS = {"qty_value", "algy_severity"}


def _parse_date_string(value: str) -> Optional[date]:
    for pattern in ("%Y-%m-%d", "%Y%m%d"):
        try:
            return datetime.strptime(value, pattern).date()
        except ValueError:
            continue
    return None


def _normalize_moda_field_value(field_name: str, value: str) -> str:
    text = "" if value is None else str(value).strip()
    if not text:
        return ""

    if field_name in MODA_DATE_FIELDS:
        parsed = _parse_date_string(text)
        if parsed:
            return parsed.isoformat()
        return text

    if field_name in MODA_INTEGER_FIELDS:
        digits = re.sub(r"[^0-9]", "", text)
        if digits:
            return digits
        return text

    return text


CAMEL_TO_SNAKE = re.compile(r"(?<!^)(?=[A-Z])")


def _canonical_alias_key(name: str) -> str:
    if not name:
        return ""
    raw = name.strip()
    if not raw:
        return ""
    if raw in MODA_FIELD_DIRECT_ALIASES:
        return MODA_FIELD_DIRECT_ALIASES[raw]
    normalized = raw.replace("-", "_").strip()
    if normalized in MODA_FIELD_DIRECT_ALIASES:
        return MODA_FIELD_DIRECT_ALIASES[normalized]
    lower_key = normalized.lower()
    if lower_key in MODA_FIELD_LOWER_ALIASES:
        return MODA_FIELD_LOWER_ALIASES[lower_key]
    camel_snake = CAMEL_TO_SNAKE.sub("_", normalized).lower()
    if camel_snake in MODA_FIELD_LOWER_ALIASES:
        return MODA_FIELD_LOWER_ALIASES[camel_snake]
    return normalized


MODA_SCOPE_ALIAS = {
    "RESEARCH_INFO": DisclosureScope.RESEARCH_ANALYTICS.value,
    "RESEARCH": DisclosureScope.RESEARCH_ANALYTICS.value,
    "MEDICAL_INFO": DisclosureScope.MEDICAL_RECORD.value,
    "MEDICATION": DisclosureScope.MEDICATION_PICKUP.value,
    "MEDICAL_CARD": DisclosureScope.MEDICAL_RECORD.value,
    "MEDICALRECORD": DisclosureScope.MEDICAL_RECORD.value,
    "MEDICAL": DisclosureScope.MEDICAL_RECORD.value,
    "MEDICATION_CARD": DisclosureScope.MEDICATION_PICKUP.value,
    "PRESCRIPTION": DisclosureScope.MEDICATION_PICKUP.value,
}


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
            description="跨院病歷摘要：診斷碼、紀錄日期、發卡院所",
        ),
        DisclosurePolicy(
            scope=DisclosureScope.MEDICATION_PICKUP,
            fields=[
                "medication_dispense[0].medicationCodeableConcept.coding[0].code",
                "medication_dispense[0].days_supply",
                "medication_dispense[0].pickup_window_end",
            ],
            description="領藥資訊：藥品代碼、給藥天數、取藥期限",
        ),
        DisclosurePolicy(
            scope=DisclosureScope.RESEARCH_ANALYTICS,
            fields=[
                "condition.code.coding[0].code",
                "encounter_summary_hash",
            ],
            description="匿名化研究卡：以摘要雜湊與診斷碼提供研究合作",
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


def _resolve_policies(
    policies: Optional[List[DisclosurePolicy]],
) -> List[DisclosurePolicy]:
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
        "allergies": [
            {
                "resourceType": "AllergyIntolerance",
                "id": "algy-sample",
                "code": {
                    "coding": [
                        {
                            "system": "http://hl7.org/fhir/sid/icd-10",
                            "code": "Z88.1",
                            "display": "Penicillin allergy",
                        }
                    ],
                    "text": "Penicillin allergy",
                },
                "criticality": "high",
            }
        ],
        "consent": {
            "scope": "research_info",
            "purpose": "AI 胃炎趨勢研究",
            "issuer": "MOHW-IRB-2025-001",
            "path": "medssi://consent/irb-2025-001",
            "expires_on": (today + timedelta(days=180)).isoformat(),
        },
        "patient_digest": {
            "hashed_id": "hash::8f4c0d1d6c1a4b67a4f9d1234567890b",
            "display_name": "張小華",
            "birth_date": "1950-07-18",
            "document_type": "NHI_CARD",
            "document_version": "v1.0",
            "issuer": "衛福部中央健康保險署",
            "valid_to": (today + timedelta(days=365 * 2)).isoformat(),
            "wallet_id": "wallet-demo-001",
        },
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
        merge(
            {
                "condition": {
                    "code": {
                        "coding": [
                            {
                                "system": "http://hl7.org/fhir/sid/icd-10",
                                "code": alias_map["cond_code"],
                            }
                        ]
                    }
                }
            }
        )
    if alias_map.get("cond_display"):
        merge(
            {
                "condition": {
                    "code": {
                        "coding": [
                            {
                                "display": alias_map["cond_display"],
                            }
                        ],
                        "text": alias_map["cond_display"],
                    }
                }
            }
        )
    if alias_map.get("cond_onset"):
        merge({"condition": {"recordedDate": alias_map["cond_onset"]}})

    if alias_map.get("med_code"):
        merge(
            {
                "medication_dispense": [
                    {
                        "medicationCodeableConcept": {
                            "coding": [
                                {
                                    "system": "http://www.whocc.no/atc",
                                    "code": alias_map["med_code"],
                                }
                            ]
                        }
                    }
                ]
            }
        )
    if alias_map.get("med_name"):
        merge(
            {
                "medication_dispense": [
                    {
                        "medicationCodeableConcept": {
                            "coding": [
                                {
                                    "display": alias_map["med_name"],
                                }
                            ],
                            "text": alias_map["med_name"],
                        }
                    }
                ]
            }
        )

    qty_value = alias_map.get("qty_value")
    qty_unit = alias_map.get("qty_unit")
    quantity_text: Optional[str] = None
    if qty_value:
        try:
            days_supply = int(qty_value)
        except ValueError:
            days_supply = None
        merge(
            {
                "medication_dispense": [
                    {
                        "days_supply": days_supply if days_supply is not None else qty_value,
                    }
                ]
            }
        )
        quantity_text = qty_value
    if qty_unit:
        quantity_text = f"{qty_value or ''} {qty_unit}".strip()
    if quantity_text:
        merge(
            {
                "medication_dispense": [
                    {
                        "quantity_text": quantity_text,
                    }
                ]
            }
        )

    if alias_map.get("dose_text"):
        merge(
            {
                "medication_dispense": [
                    {
                        "dose_text": alias_map["dose_text"],
                    }
                ]
            }
        )

    if alias_map.get("pickup_deadline"):
        merge(
            {
                "medication_dispense": [
                    {
                        "pickup_window_end": alias_map["pickup_deadline"],
                    }
                ]
            }
        )

    if any(key in alias_map for key in ("algy_code", "algy_name", "algy_severity")):
        merge(
            {
                "allergies": [
                    {
                        "resourceType": "AllergyIntolerance",
                        "id": "algy-from-alias",
                        "code": {
                            "coding": [
                                {
                                    "system": "http://hl7.org/fhir/sid/icd-10",
                                    "code": alias_map.get("algy_code", "Z88.1"),
                                    "display": alias_map.get("algy_name", "Penicillin allergy"),
                                }
                            ],
                            "text": alias_map.get("algy_name", "Penicillin allergy"),
                        },
                        "criticality": alias_map.get("algy_severity", "high"),
                    }
                ]
            }
        )

    if any(
        key in alias_map for key in ("cons_scope", "cons_purpose", "cons_path", "cons_end")
    ):
        merge(
            {
                "consent": {
                    "scope": alias_map.get("cons_scope"),
                    "purpose": alias_map.get("cons_purpose"),
                    "path": alias_map.get("cons_path"),
                    "expires_on": alias_map.get("cons_end"),
                }
            }
        )

    if any(
        key in alias_map
        for key in (
            "pid_hash",
            "pid_type",
            "pid_ver",
            "pid_issuer",
            "pid_valid_to",
            "wallet_id",
        )
    ):
        merge(
            {
                "patient_digest": {
                    "hashed_id": alias_map.get("pid_hash"),
                    "document_type": alias_map.get("pid_type"),
                    "document_version": alias_map.get("pid_ver"),
                    "issuer": alias_map.get("pid_issuer"),
                    "valid_to": alias_map.get("pid_valid_to"),
                    "wallet_id": alias_map.get("wallet_id"),
                }
            }
        )

    return overrides or None


def _expand_aliases(alias_map: Dict[str, str]) -> Dict[str, str]:
    expanded = dict(alias_map)

    def copy_if_missing(source: str, target: str) -> None:
        if source in alias_map and target not in expanded:
            expanded[target] = alias_map[source]

    copy_if_missing("med_code", "medication_list[0].medication_code")
    copy_if_missing("med_name", "medication_list[0].medication_name")
    copy_if_missing("qty_value", "medication_list[0].dosage")
    copy_if_missing("pickup_deadline", "pickup_info.pickup_deadline")
    copy_if_missing("dose_text", "medication_list[0].dose_text")
    copy_if_missing("cons_scope", "consent.scope")
    copy_if_missing("cons_purpose", "consent.purpose")
    copy_if_missing("cons_path", "consent.path")
    copy_if_missing("cons_end", "consent.expires_on")
    copy_if_missing("pid_hash", "pid_info.pid_hash")
    copy_if_missing("pid_type", "pid_info.pid_type")
    copy_if_missing("pid_ver", "pid_info.pid_ver")
    copy_if_missing("pid_issuer", "pid_info.pid_issuer")
    copy_if_missing("pid_valid_to", "pid_info.pid_valid_to")
    copy_if_missing("wallet_id", "pid_info.wallet_id")

    return expanded


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
        valid_for_minutes=valid_for_minutes,
        holder_did=holder_did,
        holder_hint=holder_hint,
        payload=payload,
        payload_template=payload_template,
        transaction_id=transaction_id,
        selected_disclosures=selected_disclosures,
        external_fields=external_fields,
    )
    qr_payload = _build_qr_payload(
        offer.qr_token, "credential", transaction_id=offer.transaction_id
    )
    return offer, qr_payload


def _create_offer(
    *,
    issuer_id: str,
    primary_scope: DisclosureScope,
    ial: IdentityAssuranceLevel,
    mode: IssuanceMode,
    disclosure_policies: List[DisclosurePolicy],
    valid_for_minutes: int,
    holder_did: Optional[str] = None,
    holder_hint: Optional[str] = None,
    payload: Optional[CredentialPayload] = None,
    payload_template: Optional[CredentialPayload] = None,
    transaction_id: Optional[str] = None,
    selected_disclosures: Optional[Dict[str, str]] = None,
    external_fields: Optional[Dict[str, str]] = None,
) -> CredentialOffer:
    now = datetime.utcnow()
    credential_id = f"cred-{uuid.uuid4().hex}"
    transaction_id = transaction_id or str(uuid.uuid4())
    nonce = secrets.token_urlsafe(16)
    qr_token = secrets.token_urlsafe(24)

    offer = CredentialOffer(
        credential_id=credential_id,
        transaction_id=transaction_id,
        issuer_id=issuer_id,
        primary_scope=primary_scope,
        ial=ial,
        mode=mode,
        qr_token=qr_token,
        nonce=nonce,
        status=CredentialStatus.OFFERED,
        created_at=now,
        expires_at=now + timedelta(minutes=valid_for_minutes),
        last_action_at=now,
        disclosure_policies=disclosure_policies,
        holder_did=holder_did,
        holder_hint=holder_hint,
        payload=payload,
        payload_template=payload_template,
        selected_disclosures=selected_disclosures or {},
        external_fields=external_fields or {},
    )
    store.persist_credential(offer)
    return offer


def _get_child(current: Any, name: str) -> Any:
    if current is None:
        return None
    if isinstance(current, BaseModel):
        return getattr(current, name, None)
    if isinstance(current, dict):
        return current.get(name)
    return getattr(current, name, None)


def _resolve_payload_value(payload: Optional[CredentialPayload], path: str) -> Optional[str]:
    if payload is None:
        return None

    current: Any = payload
    for segment in path.split('.'):
        if not segment:
            continue
        while '[' in segment:
            attr, rest = segment.split('[', 1)
            if attr:
                current = _get_child(current, attr)
            if current is None:
                return None
            index_str, remainder = rest.split(']', 1)
            try:
                index = int(index_str)
            except ValueError:
                return None
            if not isinstance(current, (list, tuple)):
                return None
            if index >= len(current):
                return None
            current = current[index]
            segment = remainder
            if segment.startswith('.'):
                segment = segment[1:]
        if segment:
            current = _get_child(current, segment)
        if current is None:
            return None

    if isinstance(current, (date, datetime)):
        return current.isoformat()
    if isinstance(current, (str, int, float)):
        return str(current)
    if isinstance(current, BaseModel):
        return current.json()
    if isinstance(current, dict):
        return str(current)
    return None


def _resolve_field_value(credential: CredentialOffer, field: str) -> Optional[str]:
    if field in credential.external_fields:
        value = credential.external_fields[field]
        if value not in (None, ""):
            return str(value)
    fhir_path = MODA_FIELD_TO_FHIR.get(field)
    if fhir_path:
        resolved = _resolve_payload_value(credential.payload, fhir_path)
        if resolved is not None:
            return resolved
    return _resolve_payload_value(credential.payload, field)


def _select_allowed_fields(offer: CredentialOffer, disclosures: Dict[str, str]) -> Dict[str, str]:
    allowed = {
        field
        for policy in offer.disclosure_policies
        for field in policy.fields
    }
    invalid = [field for field in disclosures if field not in allowed]
    if invalid:
        _raise_problem(
            status=400,
            type_="https://medssi.dev/errors/disclosure-invalid",
            title="Field outside of disclosure policy",
            detail=f"Fields {', '.join(invalid)} not allowed for this credential.",
        )
    return disclosures


def _retention_days(scope: DisclosureScope) -> int:
    if scope == DisclosureScope.MEDICATION_PICKUP:
        return 3
    if scope == DisclosureScope.MEDICAL_RECORD:
        return 7
    return 30


def _touch_retention(offer: CredentialOffer) -> None:
    issued_at = datetime.utcnow()
    offer.issued_at = issued_at
    offer.retention_expires_at = issued_at + timedelta(days=_retention_days(offer.primary_scope))
    offer.last_action_at = issued_at


def _issue_from_data_request(
    request: IssuanceWithDataRequest,
) -> Tuple[CredentialOffer, str]:
    policies = _resolve_policies(request.disclosure_policies)
    payload = _coerce_payload(request.payload)
    holder_did = request.holder_did or "did:example:patient-demo"
    return _issue_offer(
        issuer_id=request.issuer_id,
        primary_scope=request.primary_scope,
        ial=request.ial,
        mode=IssuanceMode.WITH_DATA,
        disclosure_policies=policies,
        valid_for_minutes=request.valid_for_minutes,
        holder_did=holder_did,
        holder_hint=request.holder_hint,
        payload=payload,
        transaction_id=request.transaction_id,
    )


def _issue_from_template_request(
    request: IssuanceWithoutDataRequest,
) -> Tuple[CredentialOffer, str]:
    policies = _resolve_policies(request.disclosure_policies)
    payload_template = (
        _coerce_payload(request.payload_template)
        if request.payload_template is not None
        else None
    )
    holder_did = request.holder_did or None
    return _issue_offer(
        issuer_id=request.issuer_id,
        primary_scope=request.primary_scope,
        ial=request.ial,
        mode=IssuanceMode.WITHOUT_DATA,
        disclosure_policies=policies,
        valid_for_minutes=request.valid_for_minutes,
        holder_did=holder_did,
        holder_hint=request.holder_hint,
        payload_template=payload_template,
        transaction_id=request.transaction_id,
    )


def _scope_for_moda_vc(vc_uid: str) -> DisclosureScope:
    slug = _normalize_vc_uid(vc_uid)
    return MODA_VC_SCOPE_MAP.get(slug, DisclosureScope.MEDICAL_RECORD)


def _issue_from_moda_request(request: MODAIssuanceRequest) -> Tuple[CredentialOffer, str]:
    scope = _scope_for_moda_vc(request.vc_uid)
    vc_slug = _normalize_vc_uid(request.vc_uid)
    ial = request.ial or IdentityAssuranceLevel.NHI_CARD_PIN
    holder_did = request.holder_did or "did:example:patient-demo"
    issuer_id = request.issuer_id or DEFAULT_ISSUER_ID
    valid_minutes = request.valid_minutes or 5
    valid_minutes = max(1, min(10, valid_minutes))

    raw_fields: Dict[str, str] = {}
    canonical_fields: Dict[str, str] = {}
    for field in request.fields:
        if not field.ename:
            continue
        raw_value = field.content
        value_text = "" if raw_value is None else str(raw_value)
        raw_fields[field.ename] = value_text
        key = _canonical_alias_key(field.ename)
        if not key:
            continue
        canonical_fields[key] = value_text
    alias_map = _expand_aliases(canonical_fields)

    sample_values = MODA_SAMPLE_FIELD_VALUES.get(vc_slug, {})
    alias_map = {**sample_values, **alias_map}
    raw_fields = {**sample_values, **raw_fields}

    policy_fields = list(
        dict.fromkeys(list(raw_fields.keys()) + list(alias_map.keys()))
    )
    if not policy_fields:
        policy_fields = MODA_VC_FIELD_KEYS.get(vc_slug) or MODA_SCOPE_DEFAULT_FIELDS.get(
            scope, ["cond_code"]
        )

    payload_overrides = _payload_overrides_from_alias(alias_map)
    payload = _coerce_payload(payload_overrides)

    policies = [
        DisclosurePolicy(
            scope=scope,
            fields=policy_fields,
            description="MODA 沙盒欄位設定",
        )
    ]

    return _issue_offer(
        issuer_id=issuer_id,
        primary_scope=scope,
        ial=ial,
        mode=IssuanceMode.WITH_DATA,
        disclosure_policies=policies,
        valid_for_minutes=valid_minutes,
        holder_did=holder_did,
        holder_hint=None,
        payload=payload,
        transaction_id=request.transaction_id,
        selected_disclosures=alias_map,
        external_fields={**sample_values, **raw_fields, **alias_map},
    )


def _normalize_scope_entries(raw_policies: Any) -> Any:
    if not isinstance(raw_policies, list):
        return raw_policies
    for item in raw_policies:
        if not isinstance(item, dict):
            continue
        scope_value = item.get("scope")
        if isinstance(scope_value, str):
            normalized = MODA_SCOPE_ALIAS.get(scope_value.upper(), scope_value.upper())
            item["scope"] = normalized
    return raw_policies


def _issue_with_data_from_payload(payload: Dict[str, Any]) -> Tuple[CredentialOffer, str]:
    try:
        if "disclosurePolicies" in payload:
            payload["disclosurePolicies"] = _normalize_scope_entries(payload["disclosurePolicies"])
        if "vcUid" in payload:
            moda_request = MODAIssuanceRequest.parse_obj(payload)
            return _issue_from_moda_request(moda_request)
        request = IssuanceWithDataRequest.parse_obj(payload)
        return _issue_from_data_request(request)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=json.loads(exc.json())) from exc


def _issue_template_from_payload(payload: Dict[str, Any]) -> Tuple[CredentialOffer, str]:
    try:
        if "disclosurePolicies" in payload:
            payload["disclosurePolicies"] = _normalize_scope_entries(payload["disclosurePolicies"])
        if "vcUid" in payload:
            moda_request = MODAIssuanceRequest.parse_obj(payload)
            return _issue_from_moda_request(moda_request)
        request = IssuanceWithoutDataRequest.parse_obj(payload)
        return _issue_from_template_request(request)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=json.loads(exc.json())) from exc


def _build_issue_response(offer: CredentialOffer, qr_payload: str) -> GovIssueResponse:
    return GovIssueResponse(
        transaction_id=offer.transaction_id,
        qr_code=_make_qr_data_uri(qr_payload),
        qr_payload=qr_payload,
        deep_link=qr_payload,
        credential_id=offer.credential_id,
        expires_at=offer.expires_at,
        ial=offer.ial,
        ial_description=offer.ial_description,
        scope=offer.primary_scope,
    )


def _build_nonce_response(offer: CredentialOffer) -> GovCredentialNonceResponse:
    return GovCredentialNonceResponse(
        transaction_id=offer.transaction_id,
        credential_id=offer.credential_id,
        credential_status=offer.status,
        nonce=offer.nonce,
        ial=offer.ial,
        ial_description=offer.ial_description,
        mode=offer.mode,
        expires_at=offer.expires_at,
        payload_available=offer.payload is not None,
        disclosure_policies=offer.disclosure_policies,
        payload_template=offer.payload_template,
        payload=offer.payload,
        credential=_mock_credential_jwt(offer),
    )


@api_v2.post(
    "/api/qrcode/data",
    response_model=QRCodeResponse,
    dependencies=[Depends(require_issuer_token)],
)
def create_qr_with_data(request: IssuanceWithDataRequest) -> QRCodeResponse:
    offer, qr_payload = _issue_from_data_request(request)
    return QRCodeResponse(credential=offer, qr_payload=qr_payload)


@api_v2.post(
    "/api/qrcode/nodata",
    response_model=QRCodeResponse,
    dependencies=[Depends(require_issuer_token)],
)
def create_qr_without_data(request: IssuanceWithoutDataRequest) -> QRCodeResponse:
    offer, qr_payload = _issue_from_template_request(request)
    return QRCodeResponse(credential=offer, qr_payload=qr_payload)


api_public = APIRouter(prefix="/api", tags=["MODA Sandbox compatibility"])


@api_public.post(
    "/qrcode/data",
    response_model=Dict[str, Any],
    status_code=201,
    dependencies=[Depends(require_issuer_token)],
)
def gov_issue_with_data(
    request: Request, payload: Dict[str, Any] = Body(...)
) -> Dict[str, Any]:
    token = _extract_token_from_request(request)
    normalized = _prepare_moda_remote_payload(payload)
    return _call_remote_api(
        method="POST",
        base_url=GOV_ISSUER_BASE,
        path="/api/qrcode/data",
        token=token,
        payload=normalized,
    )


@api_public.post(
    "/medical/card/issue",
    response_model=Dict[str, Any],
    status_code=201,
    dependencies=[Depends(require_issuer_token)],
)
def gov_issue_medical_card(
    request: Request, payload: Dict[str, Any] = Body(...)
) -> Dict[str, Any]:
    token = _extract_token_from_request(request)
    normalized = _prepare_moda_remote_payload(payload)
    return _call_remote_api(
        method="POST",
        base_url=GOV_ISSUER_BASE,
        path="/api/qrcode/data",
        token=token,
        payload=normalized,
    )


@api_public.post(
    "/qrcode/nodata",
    response_model=Dict[str, Any],
    status_code=201,
    dependencies=[Depends(require_issuer_token)],
)
def gov_issue_without_data(
    request: Request, payload: Dict[str, Any] = Body(...)
) -> Dict[str, Any]:
    token = _extract_token_from_request(request)
    normalized = _prepare_moda_remote_payload(payload)
    return _call_remote_api(
        method="POST",
        base_url=GOV_ISSUER_BASE,
        path="/api/qrcode/nodata",
        token=token,
        payload=normalized,
    )


@api_public.get(
    "/credential/nonce/{transaction_id}",
    response_model=Dict[str, Any],
    dependencies=[Depends(require_wallet_token)],
)
def gov_get_nonce(transaction_id: str, request: Request) -> Dict[str, Any]:
    token = _extract_token_from_request(request)
    return _call_remote_api(
        method="GET",
        base_url=GOV_ISSUER_BASE,
        path=f"/api/credential/nonce/{transaction_id}",
        token=token,
    )


@api_public.get(
    "/credential/nonce",
    response_model=Dict[str, Any],
    dependencies=[Depends(require_wallet_token)],
)
def gov_get_nonce_query(
    request: Request, transactionId: str = Query(..., alias="transactionId")
) -> Dict[str, Any]:
    return gov_get_nonce(transactionId, request)


@api_public.put(
    "/credential/{credential_id}/{action}",
    response_model=Dict[str, Any],
    dependencies=[Depends(require_issuer_token)],
)
def gov_update_credential(
    credential_id: str, action: str, request: Request
) -> Dict[str, Any]:
    token = _extract_token_from_request(request)
    return _call_remote_api(
        method="PUT",
        base_url=GOV_ISSUER_BASE,
        path=f"/api/credential/{credential_id}/{action}",
        token=token,
        payload={},
    )


def _forward_oidvp_qrcode(
    *,
    request: Request,
    ref: Optional[str],
    transaction_id: Optional[str],
    scope: Optional[DisclosureScope] = None,
    payload: Optional[OIDVPSessionRequest] = None,
) -> Dict[str, Any]:
    token = _extract_token_from_request(request)
    tx_id = transaction_id
    resolved_scope = scope
    if payload is not None:
        tx_id = payload.transaction_id or tx_id
        ref = payload.ref or ref
        resolved_scope = payload.scope or resolved_scope
    tx_id = tx_id or str(uuid.uuid4())
    resolved_scope = resolved_scope or DisclosureScope.MEDICAL_RECORD
    resolved_ref = _resolve_verifier_ref(resolved_scope, ref)
    params = {
        "ref": resolved_ref,
        "transactionId": tx_id,
    }
    response = _call_remote_api(
        method="GET",
        base_url=GOV_VERIFIER_BASE,
        path="/api/oidvp/qrcode",
        token=token,
        params=params,
    )
    if isinstance(response, dict):
        response.setdefault("transactionId", tx_id)
        response.setdefault("ref", resolved_ref)
    return response


@api_public.post(
    "/oidvp/qrcode",
    response_model=Dict[str, Any],
    status_code=200,
    dependencies=[Depends(require_verifier_token)],
)
def gov_create_oidvp_qrcode(
    payload: OIDVPSessionRequest, request: Request
) -> Dict[str, Any]:
    return _forward_oidvp_qrcode(
        request=request,
        ref=None,
        transaction_id=None,
        scope=payload.scope,
        payload=payload,
    )


@api_public.get(
    "/oidvp/qrcode",
    response_model=Dict[str, Any],
    dependencies=[Depends(require_verifier_token)],
)
def gov_create_oidvp_qrcode_get(
    request: Request,
    ref: Optional[str] = Query(None),
    transaction_id: Optional[str] = Query(None, alias="transactionId"),
    transaction_id_snake: Optional[str] = Query(None, alias="transaction_id"),
    scope: Optional[DisclosureScope] = Query(None, alias="scope"),
) -> Dict[str, Any]:
    tx_id = transaction_id or transaction_id_snake
    return _forward_oidvp_qrcode(
        request=request, ref=ref, transaction_id=tx_id, scope=scope, payload=None
    )


@api_public.get(
    "/medical/verification/code",
    response_model=Dict[str, Any],
    dependencies=[Depends(require_verifier_token)],
)
def gov_get_medical_verification_code(
    request: Request,
    ref: Optional[str] = Query(None),
    transaction_id: Optional[str] = Query(None, alias="transactionId"),
    verifier_id: str = Query("did:example:verifier", alias="verifier_id"),
    verifier_role: Optional[str] = Query(None, alias="verifier_role"),
    verifier_name: str = Query("驗證端", alias="verifier_name"),
    purpose: Optional[str] = Query(None),
    card_type: Optional[str] = Query(None, alias="card_type"),
    ial: Optional[IdentityAssuranceLevel] = Query(None, alias="ial"),
    allowed_fields: Optional[List[str]] = Query(None, alias="allowed_fields"),
    scope: Optional[DisclosureScope] = Query(None, alias="scope"),
    valid_for_minutes: int = Query(5, alias="valid_for_minutes", ge=1, le=10),
) -> Dict[str, Any]:
    # Government API currently accepts only ref/transactionId; additional
    # parameters are preserved locally when we fall back to the internal
    # sandbox. Here we simply forward the request and rely on the caller to
    # track verifier metadata.
    transaction = transaction_id or str(uuid.uuid4())
    resolved_ref = _resolve_verifier_ref(scope, ref)
    params = {
        "ref": resolved_ref,
        "transactionId": transaction,
    }
    token = _extract_token_from_request(request)
    response = _call_remote_api(
        method="GET",
        base_url=GOV_VERIFIER_BASE,
        path="/api/oidvp/qrcode",
        token=token,
        params=params,
    )
    if isinstance(response, dict):
        response.setdefault("transactionId", transaction)
        response.setdefault("ref", resolved_ref)
    return response


@api_public.post(
    "/oidvp/result",
    response_model=Dict[str, Any],
    dependencies=[Depends(require_verifier_token)],
)
def gov_fetch_oidvp_result(
    payload: OIDVPResultRequest, request: Request
) -> Dict[str, Any]:
    token = _extract_token_from_request(request)
    body = payload.dict(by_alias=True)
    return _call_remote_api(
        method="POST",
        base_url=GOV_VERIFIER_BASE,
        path="/api/oidvp/result",
        token=token,
        payload=body,
    )


@api_public.post(
    "/medical/verification/result",
    response_model=Dict[str, Any],
    dependencies=[Depends(require_verifier_token)],
)
def gov_medical_verification_result(
    payload: OIDVPResultRequest, request: Request
) -> Dict[str, Any]:
    return gov_fetch_oidvp_result(payload, request)

@api_public.get(
    "/medical/verification/session/{session_id}",
    response_model=GovVerificationSessionResponse,
    dependencies=[Depends(require_verifier_token)],
)
def gov_get_verification_session(session_id: str) -> GovVerificationSessionResponse:
    session = store.get_verification_session(session_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail={"code": "404", "message": "查無驗證 Session"},
        )
    return GovVerificationSessionResponse(
        session_id=session.session_id,
        transaction_id=session.transaction_id,
        verifier_id=session.verifier_id,
        verifier_name=session.verifier_name,
        purpose=session.purpose,
        ial=session.required_ial,
        ial_description=session.ial_description,
        scope=session.scope,
        allowed_fields=session.allowed_fields,
        created_at=session.created_at,
        expires_at=session.expires_at,
        ref=session.template_ref,
    )

@api_v2.post(
    "/api/credentials/{credential_id}/revoke",
    response_model=CredentialOffer,
    dependencies=[Depends(require_issuer_token)],
)
def revoke_credential(credential_id: str) -> CredentialOffer:
    credential = store.get_credential(credential_id)
    if not credential:
        _raise_problem(
            status=404,
            type_="https://medssi.dev/errors/credential-not-found",
            title="Credential not found",
            detail=f"Credential {credential_id} does not exist.",
        )

    credential.status = CredentialStatus.REVOKED
    credential.last_action_at = datetime.utcnow()
    credential.retention_expires_at = credential.last_action_at
    store.update_credential(credential)
    return credential


@api_v2.delete(
    "/api/credentials/{credential_id}",
    dependencies=[Depends(require_issuer_token)],
)
def delete_credential(credential_id: str):
    if not store.get_credential(credential_id):
        _raise_problem(
            status=404,
            type_="https://medssi.dev/errors/credential-not-found",
            title="Credential not found",
            detail=f"Credential {credential_id} does not exist.",
        )
    store.delete_credential(credential_id)
    return {"credential_id": credential_id, "status": "DELETED"}


@api_v2.get(
    "/api/credential/nonce",
    response_model=NonceResponse,
    dependencies=[Depends(require_wallet_token)],
)
def get_nonce(transactionId: str = Query(..., alias="transactionId")) -> NonceResponse:  # noqa: N802
    try:
        uuid.UUID(transactionId)
    except ValueError:
        _raise_problem(
            status=400,
            type_="https://medssi.dev/errors/transaction-id",
            title="transactionId invalid",
            detail="transactionId must be a UUIDv4 string.",
        )

    offer = store.get_credential_by_transaction(transactionId)
    if not offer:
        _raise_problem(
            status=404,
            type_="https://medssi.dev/errors/transaction-not-found",
            title="Transaction not found",
            detail="No credential offer found for this transactionId.",
        )
    if not offer.is_active():
        _raise_problem(
            status=410,
            type_="https://medssi.dev/errors/offer-expired",
            title="Credential offer expired",
            detail="The QR Code has expired or the credential was revoked.",
        )

    return NonceResponse(
        transaction_id=offer.transaction_id,
        credential_id=offer.credential_id,
        nonce=offer.nonce,
        ial=offer.ial,
        status=offer.status,
        expires_at=offer.expires_at,
        mode=offer.mode,
        disclosure_policies=offer.disclosure_policies,
        payload_available=offer.payload is not None,
        payload_template=offer.payload_template,
    )


@api_v2.put(
    "/api/credential/{credential_id}/action",
    response_model=CredentialOffer,
    dependencies=[Depends(require_wallet_token)],
)
def handle_credential_action(credential_id: str, payload: CredentialActionRequest) -> CredentialOffer:
    credential = store.get_credential(credential_id)
    if not credential:
        _raise_problem(
            status=404,
            type_="https://medssi.dev/errors/credential-not-found",
            title="Credential not found",
            detail=f"Credential {credential_id} does not exist.",
        )

    now = datetime.utcnow()

    if payload.action == CredentialAction.ACCEPT:
        if credential.status == CredentialStatus.REVOKED:
            _raise_problem(
                status=400,
                type_="https://medssi.dev/errors/credential-revoked",
                title="Credential revoked",
                detail="Revoked credentials cannot be accepted.",
            )
        if not payload.holder_did and not credential.holder_did:
            _raise_problem(
                status=400,
                type_="https://medssi.dev/errors/missing-holder",
                title="Holder DID required",
                detail="Provide holder_did when accepting the credential.",
            )
        if credential.mode is IssuanceMode.WITHOUT_DATA:
            if payload.payload is None:
                _raise_problem(
                    status=400,
                    type_="https://medssi.dev/errors/missing-payload",
                    title="Payload required",
                    detail="Submit the FHIR payload when accepting a placeholder credential.",
                )
            credential.payload = payload.payload
        elif payload.payload is not None:
            credential.payload = payload.payload

        disclosures = payload.disclosures or {}
        credential.selected_disclosures = _select_allowed_fields(credential, disclosures)
        if payload.holder_did:
            credential.holder_did = payload.holder_did
        credential.status = CredentialStatus.ISSUED
        _touch_retention(credential)
    elif payload.action == CredentialAction.UPDATE:
        if credential.status != CredentialStatus.ISSUED:
            _raise_problem(
                status=400,
                type_="https://medssi.dev/errors/credential-not-issued",
                title="Credential not issued",
                detail="Only issued credentials can be updated.",
            )
        if payload.payload:
            credential.payload = payload.payload
        if payload.disclosures:
            credential.selected_disclosures = _select_allowed_fields(credential, payload.disclosures)
        credential.last_action_at = now
    elif payload.action == CredentialAction.DECLINE:
        credential.status = CredentialStatus.DECLINED
        credential.last_action_at = now
    elif payload.action == CredentialAction.REVOKE:
        credential.status = CredentialStatus.REVOKED
        credential.retention_expires_at = now
        credential.last_action_at = now
    else:
        _raise_problem(
            status=400,
            type_="https://medssi.dev/errors/unsupported-action",
            title="Unsupported action",
            detail=f"Action {payload.action} is not supported.",
        )

    store.update_credential(credential)
    return credential


@api_v2.get(
    "/api/wallet/{holder_did}/credentials",
    response_model=List[CredentialOffer],
    dependencies=[Depends(require_wallet_token)],
)
def list_holder_credentials(holder_did: str) -> List[CredentialOffer]:
    return store.list_credentials_for_holder(holder_did)


@api_v2.delete(
    "/api/wallet/{holder_did}/forget",
    response_model=ForgetSummary,
    dependencies=[Depends(require_wallet_token)],
)
def forget_holder(holder_did: str) -> ForgetSummary:
    return store.forget_holder(holder_did)


@api_v2.get(
    "/api/did/vp/code",
    response_model=VerificationCodeResponse,
    dependencies=[Depends(require_verifier_token)],
)
def get_verification_code(
    verifierId: str = Query(..., alias="verifierId"),
    verifierName: str = Query(..., alias="verifierName"),
    purpose: str = Query("Clinical research"),
    ial_min: IdentityAssuranceLevel = Query(
        IdentityAssuranceLevel.NHI_CARD_PIN, alias="ial_min"
    ),
    scope: DisclosureScope = Query(DisclosureScope.MEDICAL_RECORD),
    fields: List[str] = Query(
        ..., description="List of fields requested for selective disclosure"
    ),
    validMinutes: int = Query(5, ge=1, le=5, alias="validMinutes"),
) -> VerificationCodeResponse:
    if len(fields) == 1 and "," in fields[0]:
        fields = [segment.strip() for segment in fields[0].split(",") if segment.strip()]

    if not fields:
        _raise_problem(
            status=400,
            type_="https://medssi.dev/errors/fields-required",
            title="At least one field required",
            detail="Provide at least one selective disclosure field.",
        )

    now = datetime.utcnow()
    session = VerificationSession(
        session_id=f"sess-{uuid.uuid4().hex}",
        verifier_id=verifierId,
        verifier_name=verifierName,
        purpose=purpose,
        required_ial=ial_min,
        scope=scope,
        allowed_fields=list(dict.fromkeys(fields)),
        qr_token=secrets.token_urlsafe(24),
        created_at=now,
        expires_at=now + timedelta(minutes=validMinutes),
        last_polled_at=now,
    )
    store.persist_verification_session(session)
    qr_payload = _build_qr_payload(
        session.qr_token, "vp-session", transaction_id=session.transaction_id
    )
    return VerificationCodeResponse(session=session, qr_payload=qr_payload)


@api_v2.post(
    "/api/did/vp/result",
    response_model=RiskInsightResponse,
    dependencies=[Depends(require_verifier_token)],
)
def submit_presentation(payload: VerificationSubmission) -> RiskInsightResponse:
    session = store.get_verification_session(payload.session_id)
    if not session or not session.is_active():
        _raise_problem(
            status=410,
            type_="https://medssi.dev/errors/session-expired",
            title="Verification session expired",
            detail="Create a new QR code to verify credentials.",
        )

    credential = store.get_credential(payload.credential_id)
    if not credential:
        _raise_problem(
            status=404,
            type_="https://medssi.dev/errors/credential-not-found",
            title="Credential not found",
            detail="Holder credential not located.",
        )
    if credential.status != CredentialStatus.ISSUED:
        _raise_problem(
            status=400,
            type_="https://medssi.dev/errors/credential-not-issued",
            title="Credential not issued",
            detail="Only issued credentials may be presented.",
        )
    if not credential.satisfies_ial(session.required_ial):
        _raise_problem(
            status=403,
            type_="https://medssi.dev/errors/ial-mismatch",
            title="Identity assurance insufficient",
            detail="Credential assurance level below verifier minimum.",
        )
    if credential.holder_did != payload.holder_did:
        _raise_problem(
            status=403,
            type_="https://medssi.dev/errors/holder-mismatch",
            title="Holder DID mismatch",
            detail="Presentation holder does not match credential owner.",
        )

    session_fields = set(session.allowed_fields)
    requested_fields = set(payload.disclosed_fields.keys())
    if not requested_fields.issubset(session_fields):
        _raise_problem(
            status=400,
            type_="https://medssi.dev/errors/fields-not-authorized",
            title="Unauthorized disclosure field",
            detail="Presentation includes fields outside session scope.",
        )

    selected_fields = set(credential.selected_disclosures.keys()) or session_fields
    if not requested_fields.issubset(selected_fields):
        _raise_problem(
            status=400,
            type_="https://medssi.dev/errors/fields-not-consented",
            title="Holder did not consent to field",
            detail="Presentation attempts to disclose fields outside holder consent.",
        )

    resolved_fields: Dict[str, str] = {}
    for field in session.allowed_fields:
        presented_value = payload.disclosed_fields.get(field)
        if presented_value is None:
            continue
        actual_value = _resolve_field_value(credential, field)
        if actual_value is not None and str(presented_value) != str(actual_value):
            _raise_problem(
                status=400,
                type_="https://medssi.dev/errors/value-mismatch",
                title="Disclosed value mismatch",
                detail=f"Field {field} does not match credential contents.",
            )
        resolved_fields[field] = str(presented_value)

    presentation = Presentation(
        presentation_id=f"vp-{uuid.uuid4().hex}",
        session_id=session.session_id,
        credential_id=credential.credential_id,
        holder_did=payload.holder_did,
        verifier_id=session.verifier_id,
        scope=session.scope,
        disclosed_fields=resolved_fields,
        issued_at=datetime.utcnow(),
        nonce=credential.nonce,
    )
    result = VerificationResult(
        session_id=session.session_id,
        verifier_id=session.verifier_id,
        verified=True,
        presentation=presentation,
    )
    store.persist_presentation(presentation)
    store.persist_result(result)

    insight = get_risk_engine().evaluate(presentation)
    return RiskInsightResponse(result=result, insight=insight)


@api_v2.delete(
    "/api/did/vp/session/{session_id}",
    dependencies=[Depends(require_verifier_token)],
)
def purge_session(session_id: str):
    store.purge_session(session_id)
    return {"session_id": session_id, "status": "PURGED"}


@api_v2.post(
    "/api/system/reset",
    response_model=ResetResponse,
    dependencies=[Depends(require_any_sandbox_token)],
)
def reset_sandbox_state() -> ResetResponse:
    store.reset()
    return ResetResponse(message="MedSSI in-memory store reset", timestamp=datetime.utcnow())


app.include_router(api_public)
app.include_router(api_v2)


@app.get("/healthz")
def healthcheck():
    return {"status": "ok", "timestamp": datetime.utcnow().isoformat()}
