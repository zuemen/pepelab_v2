from __future__ import annotations

import base64
import io
import json
import os
import re  # ← 新增：缺少的 import
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

# ... (前面的程式碼保持不變，直到 CAMEL_TO_SNAKE 定義)

try:  # pragma: no cover - optional dependency for nicer QR codes
    import qrcode
except Exception:  # pragma: no cover - fallback to text payloads
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
}


MODA_SCOPE_DEFAULT_FIELDS = {
    DisclosureScope.MEDICAL_RECORD: ["cond_code", "cond_display", "cond_onset"],
    DisclosureScope.MEDICATION_PICKUP: [
        "med_code",
        "med_name",
        "qty_value",
        "qty_unit",
        "pickup_deadline",
    ],
    DisclosureScope.RESEARCH_ANALYTICS: [
        "cons_scope",
        "cons_purpose",
        "cons_path",
        "cons_issuer",
    ],
}


MODA_FIELD_TO_FHIR = {
    "cond_code": "condition.code.coding[0].code",
    "cond_display": "condition.code.coding[0].display",
    "cond_onset": "condition.recordedDate",
    "med_code": "medication_dispense[0].medicationCodeableConcept.coding[0].code",
    "med_name": "medication_dispense[0].medicationCodeableConcept.coding[0].display",
    "qty_value": "medication_dispense[0].days_supply",
    "pickup_deadline": "medication_dispense[0].pickup_window_end",
    "medication_list[0].medication_code": "medication_dispense[0].medicationCodeableConcept.coding[0].code",
    "medication_list[0].medication_name": "medication_dispense[0].medicationCodeableConcept.coding[0].display",
    "medication_list[0].dosage": "medication_dispense[0].days_supply",
    "pickup_info.pickup_deadline": "medication_dispense[0].pickup_window_end",
    "condition_info.condition_code": "condition.code.coding[0].code",
    "condition_info.condition_display": "condition.code.coding[0].display",
    "condition_info.condition_onset": "condition.recordedDate",
}


MODA_FIELD_DIRECT_ALIASES = {
    "medicationList[0].medicationCode": "medication_list[0].medication_code",
    "medicationList[0].medicationName": "medication_list[0].medication_name",
    "medicationList[0].dosage": "medication_list[0].dosage",
    "pickupInfo.pickupDeadline": "pickup_info.pickup_deadline",
    "conditionInfo.conditionCode": "condition_info.condition_code",
    "conditionInfo.conditionDisplay": "condition_info.condition_display",
    "conditionInfo.conditionOnset": "condition_info.condition_onset",
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
    "pickupdeadline": "pickup_deadline",
    "consentscope": "cons_scope",
    "consentpurpose": "cons_purpose",
    "consentissuer": "cons_issuer",
    "consentpath": "cons_path",
    "pidhash": "pid_hash",
    "pidname": "pid_name",
    "pidbirth": "pid_birth",
}


CAMEL_TO_SNAKE = re.compile(r"(?<!^)(?=[A-Z])")


def _canonical_alias_key(name: str) -> str:
    """修正版：處理欄位別名的標準化"""
    if not name:
        return ""
    raw = name.strip()
    if not raw:
        return ""
    # 先檢查直接對應
    if raw in MODA_FIELD_DIRECT_ALIASES:
        return MODA_FIELD_DIRECT_ALIASES[raw]
    normalized = raw.replace("-", "_").strip()
    if normalized in MODA_FIELD_DIRECT_ALIASES:
        return MODA_FIELD_DIRECT_ALIASES[normalized]
    # 檢查小寫版本
    lower_key = normalized.lower()
    if lower_key in MODA_FIELD_LOWER_ALIASES:
        return MODA_FIELD_LOWER_ALIASES[lower_key]
    # 轉換 camelCase 為 snake_case
    camel_snake = CAMEL_TO_SNAKE.sub("_", normalized).lower()
    if camel_snake in MODA_FIELD_LOWER_ALIASES:
        return MODA_FIELD_LOWER_ALIASES[camel_snake]
    return normalized


# 修正：OIDVPResultRequest 支援兩種參數格式
class OIDVPResultRequest(BaseModel):
    transaction_id: Optional[str] = Field(None, alias="transactionId")
    
    class Config:
        allow_population_by_field_name = True
    
    @classmethod
    def from_params(cls, transaction_id: Optional[str] = None, transactionId: Optional[str] = None):
        """支援兩種參數名稱"""
        tid = transaction_id or transactionId
        if not tid:
            raise ValueError("transaction_id or transactionId is required")
        return cls(transaction_id=tid)


# 修正：OIDVP Result 端點 - 同時支援 GET 和 POST
@api_public.post(
    "/oidvp/result",
    response_model=OIDVPResultResponse,
    dependencies=[Depends(require_verifier_token)],
)
def gov_fetch_oidvp_result_post(payload: Dict[str, Any] = Body(...)) -> OIDVPResultResponse:
    """POST 方式查詢驗證結果（官方新版）"""
    try:
        # 支援 transactionId 或 transaction_id
        transaction_id = payload.get("transactionId") or payload.get("transaction_id")
        if not transaction_id:
            raise HTTPException(
                status_code=400,
                detail={"code": "400", "message": "缺少 transactionId 參數"},
            )
        return _fetch_oidvp_result_impl(transaction_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail={"code": "500", "message": f"內部錯誤: {str(e)}"},
        )


@api_public.get(
    "/oidvp/result",
    response_model=OIDVPResultResponse,
    dependencies=[Depends(require_verifier_token)],
)
def gov_fetch_oidvp_result_get(
    transaction_id: Optional[str] = Query(None, alias="transaction_id"),
    transactionId: Optional[str] = Query(None, alias="transactionId"),
) -> OIDVPResultResponse:
    """GET 方式查詢驗證結果（相容舊版）"""
    tid = transaction_id or transactionId
    if not tid:
        raise HTTPException(
            status_code=400,
            detail={"code": "400", "message": "缺少 transaction_id 或 transactionId 參數"},
        )
    return _fetch_oidvp_result_impl(tid)


def _fetch_oidvp_result_impl(transaction_id: str) -> OIDVPResultResponse:
    """驗證結果查詢的共用實作"""
    session = store.get_verification_session_by_transaction(transaction_id)
    if not session:
        raise HTTPException(
            status_code=404,
            detail={"code": "404", "message": "查無交易紀錄"},
        )
    result = store.latest_result_for_session(session.session_id)
    if not result:
        raise HTTPException(
            status_code=400,
            detail={"code": "400", "message": "尚未接收到使用者上傳資料"},
        )
    
    # 更新最後查詢時間
    session.last_polled_at = datetime.utcnow()
    store.persist_verification_session(session)
    
    # 組裝回應 - 使用 camelCase 欄位名稱
    claims = [
        {
            "credentialType": "MedSSI.VerifiableCredential",
            "claims": [
                {"ename": field, "cname": field, "value": value}
                for field, value in result.presentation.disclosed_fields.items()
            ],
        }
    ]
    
    description = "驗證成功" if result.verified else "驗證失敗"
    return OIDVPResultResponse(
        verify_result=result.verified,  # 保持 snake_case 給內部使用
        result_description=description,
        transaction_id=transaction_id,
        data=claims,
    )


# 修正：OIDVPResultResponse 使用正確的欄位別名
class OIDVPResultResponse(BaseModel):
    verify_result: bool = Field(..., alias="verifyResult")  # ← 修正：對外使用 camelCase
    result_description: str = Field(..., alias="resultDescription")
    transaction_id: str = Field(..., alias="transactionId")
    data: List[Dict[str, Any]] = Field(default_factory=list, alias="data")

    class Config:
        allow_population_by_field_name = True
        # 確保序列化時使用 alias（camelCase）
        by_alias = True


# 修正：QR Code 端點回應欄位
@api_public.post(
    "/oidvp/qrcode",
    response_model=OIDVPQRCodeResponse,
    status_code=201,
    dependencies=[Depends(require_verifier_token)],
)
def gov_create_oidvp_qrcode(payload: OIDVPSessionRequest) -> OIDVPQRCodeResponse:
    """產生驗證 QR Code（官方格式）"""
    fields = payload.fields or []
    if len(fields) == 1 and "," in fields[0]:
        fields = [segment.strip() for segment in fields[0].split(",") if segment.strip()]
    if not fields:
        fallback_policy = next(
            (
                policy
                for policy in _default_disclosure_policies()
                if policy.scope == payload.scope
            ),
            None,
        )
        fields = list(fallback_policy.fields) if fallback_policy else ["condition.code.coding[0].code"]

    now = datetime.utcnow()
    transaction_id = payload.transaction_id or str(uuid.uuid4())
    session = VerificationSession(
        session_id=f"sess-{uuid.uuid4().hex}",
        transaction_id=transaction_id,
        verifier_id=payload.verifier_id,
        verifier_name=payload.verifier_name,
        purpose=payload.purpose or "憑證驗證",
        required_ial=payload.ial,
        scope=payload.scope,
        allowed_fields=list(dict.fromkeys(fields)),
        qr_token=secrets.token_urlsafe(24),
        created_at=now,
        expires_at=now + timedelta(minutes=payload.valid_minutes),
        last_polled_at=now,
        template_ref=payload.ref,
    )
    store.persist_verification_session(session)
    qr_payload = _build_qr_payload(
        session.qr_token, "vp-session", transaction_id=transaction_id
    )
    return OIDVPQRCodeResponse(
        transaction_id=transaction_id,
        qrcode_image=_make_qr_data_uri(qr_payload),  # ← 修正：使用 qrcodeImage (camelCase)
        auth_uri=qr_payload,  # ← 修正：使用 authUri
        qr_payload=qr_payload,
        scope=session.scope,
        ial=session.required_ial,
        expires_at=session.expires_at,
    )


class OIDVPQRCodeResponse(BaseModel):
    """修正：確保欄位別名正確"""
    transaction_id: str = Field(..., alias="transactionId")
    qrcode_image: str = Field(..., alias="qrcodeImage")  # ← 修正
    auth_uri: str = Field(..., alias="authUri")  # ← 修正
    qr_payload: str = Field(..., alias="qrPayload")  # 可選：額外提供原始 payload
    scope: DisclosureScope = Field(..., alias="scope")
    ial: IdentityAssuranceLevel = Field(..., alias="ial")
    expires_at: datetime = Field(..., alias="expiresAt")

    class Config:
        allow_population_by_field_name = True
        by_alias = True  # ← 重要：序列化時使用別名


# ... (其餘程式碼保持不變)
