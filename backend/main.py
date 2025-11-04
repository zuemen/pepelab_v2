
from __future__ import annotations

import os
import secrets
import uuid
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

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
    QRCodeResponse,
    RiskInsightResponse,
    VerificationCodeResponse,
    VerificationResult,
    VerificationSession,
)
from .store import store
from .medical_api import create_medical_api
from .gov_proxy import router as gov_proxy_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="MedSSI Sandbox APIs", version="0.6.2")

# 整合醫療場景API
create_medical_api(app)
app.include_router(gov_proxy_router)

# 前端開發服務在 3000 埠，允許跨網域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Access Token Validation
# ---------------------------------------------------------------------------
ISSUER_ACCESS_TOKEN = os.getenv("MEDSSI_ISSUER_TOKEN", "issuer-sandbox-token")
VERIFIER_ACCESS_TOKEN = os.getenv("MEDSSI_VERIFIER_TOKEN", "verifier-sandbox-token")


def _validate_token(authorization: Optional[str], expected: str, audience: str) -> None:
    if not authorization:
        raise HTTPException(status_code=401, detail=f"Missing {audience} access token")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Access token must use Bearer scheme")
    if token != expected:
        raise HTTPException(status_code=403, detail=f"{audience.capitalize()} access token rejected")


def require_issuer_token(authorization: Optional[str] = Header(None)) -> None:
    _validate_token(authorization, ISSUER_ACCESS_TOKEN, "issuer")


def require_verifier_token(authorization: Optional[str] = Header(None)) -> None:
    _validate_token(authorization, VERIFIER_ACCESS_TOKEN, "verifier")


# ---------------------------------------------------------------------------
# Issuance APIs
# ---------------------------------------------------------------------------
class IssuanceWithDataRequest(BaseModel):
    issuer_id: str
    holder_did: str
    ial: IdentityAssuranceLevel
    payload: CredentialPayload
    disclosure_policies: List[DisclosurePolicy] = Field(
        default_factory=lambda: _default_disclosure_policies(),
        description="Selective disclosure rules grouped by scope",
    )
    valid_for_minutes: int = Field(5, ge=1, le=5)
    holder_hint: Optional[str] = Field(None, description="Optional hint shown to the wallet (e.g. patient name)")


class IssuanceWithoutDataRequest(BaseModel):
    issuer_id: str
    ial: IdentityAssuranceLevel
    disclosure_policies: List[DisclosurePolicy]
    valid_for_minutes: int = Field(5, ge=1, le=5)
    holder_hint: Optional[str] = None
    holder_did: Optional[str] = None
    payload_template: Optional[CredentialPayload] = Field(
        None, description="Optional template so the wallet knows what data will be requested",
    )


def _build_qr_payload(token: str, kind: str) -> str:
    return f"medssi://{kind}?token={token}"


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
    ]


def _ensure_valid_policies(policies: List[DisclosurePolicy]) -> None:
    if not policies:
        raise HTTPException(status_code=400, detail="Disclosure policies cannot be empty")

    seen_scopes = set()
    for policy in policies:
        if policy.scope in seen_scopes:
            raise HTTPException(status_code=400, detail=f"Duplicate disclosure policy for scope {policy.scope}")
        seen_scopes.add(policy.scope)
        if not policy.fields:
            raise HTTPException(status_code=400, detail=f"Disclosure fields for scope {policy.scope} cannot be empty")


def _create_offer(
    *,
    issuer_id: str,
    ial: IdentityAssuranceLevel,
    mode: IssuanceMode,
    disclosure_policies: List[DisclosurePolicy],
    valid_for_minutes: int,
    holder_did: Optional[str] = None,
    holder_hint: Optional[str] = None,
    payload: Optional[CredentialPayload] = None,
) -> CredentialOffer:
    now = datetime.utcnow()
    credential_id = f"cred-{uuid.uuid4().hex}"
    transaction_id = str(uuid.uuid4())
    nonce = secrets.token_urlsafe(16)
    qr_token = secrets.token_urlsafe(24)

    offer = CredentialOffer(
        credential_id=credential_id,
        transaction_id=transaction_id,
        issuer_id=issuer_id,
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
    )
    store.persist_credential_offer(offer)
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
            else:
                attr = ''
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

# ---------------------------------------------------------------------------
# API Routes - Implementation
# ---------------------------------------------------------------------------

@app.post("/api/qrcode/data", dependencies=[Depends(require_issuer_token)], response_model=QRCodeResponse)
def issue_credential_with_data(request: IssuanceWithDataRequest):
    """發行含資料的憑證，回傳 Credential Offer 及 QR Code 連結。"""
    # 檢查披露政策列表是否合法（不可為空等）
    _ensure_valid_policies(request.disclosure_policies)
    offer = _create_offer(
        issuer_id=request.issuer_id,
        ial=request.ial,
        mode=IssuanceMode.WITH_DATA,
        disclosure_policies=request.disclosure_policies,
        valid_for_minutes=request.valid_for_minutes,
        holder_did=request.holder_did,
        holder_hint=request.holder_hint,
        payload=request.payload,
    )
    # 產生可供掃描的 medssi 連結（QR Code 內容）
    qr_url = _build_qr_payload(offer.qr_token, "credential")
    return {"credential": offer, "url": qr_url}


@app.post("/api/qrcode/nodata", dependencies=[Depends(require_issuer_token)], response_model=QRCodeResponse)
def issue_credential_without_data(request: IssuanceWithoutDataRequest):
    """發行無資料的憑證，回傳 Credential Offer 及 QR Code 連結。"""
    _ensure_valid_policies(request.disclosure_policies)
    offer = _create_offer(
        issuer_id=request.issuer_id,
        ial=request.ial,
        mode=IssuanceMode.WITHOUT_DATA,
        disclosure_policies=request.disclosure_policies,
        valid_for_minutes=request.valid_for_minutes,
        holder_did=request.holder_did,
        holder_hint=request.holder_hint,
        payload=request.payload_template,
    )
    qr_url = _build_qr_payload(offer.qr_token, "credential")
    return {"credential": offer, "url": qr_url}


@app.get("/api/credential/nonce", response_model=NonceResponse)
def get_offer_by_transaction(transactionId: str = Query(...)):
    """以交易 ID 查詢 Credential Offer，取得 nonce 及披露政策。"""
    offer = store.get_credential_offer_by_transaction(transactionId)
    if not offer:
        # 找不到對應的憑證申請
        raise HTTPException(status_code=404, detail="Credential offer not found")
    return NonceResponse(nonce=offer.nonce, disclosure_policies=offer.disclosure_policies)


@app.get("/api/credential/nonce/{nonce_id}", response_model=NonceResponse)
def get_offer_by_nonce(nonce_id: str):
    """以 nonce 查詢 Credential Offer 狀態。"""
    # 遍歷內存中所有憑證申請，尋找匹配的 nonce
    offer = next((c for c in store._credential_offers.values() if getattr(c, 'nonce', None) == nonce_id), None)
    if not offer:
        raise HTTPException(status_code=404, detail="Credential offer not found")
    return NonceResponse(nonce=offer.nonce, disclosure_policies=offer.disclosure_policies)


@app.post("/api/credentials/{credential_id}/revoke", dependencies=[Depends(require_issuer_token)], response_model=CredentialOffer)
def revoke_credential(credential_id: str):
    """撤銷指定憑證。"""
    try:
        store.revoke_credential_offer(credential_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Credential not found")
    # 回傳更新後的 CredentialOffer
    credential = store.get_credential_offer(credential_id)
    return credential


@app.delete("/api/credentials/{credential_id}", dependencies=[Depends(require_issuer_token)])
def delete_credential(credential_id: str):
    """刪除指定憑證。"""
    cred = store.get_credential_offer(credential_id)
    if not cred:
        raise HTTPException(status_code=404, detail="Credential not found")
    store.delete_credential_offer(credential_id)
    return {"credential_id": credential_id, "deleted": True}
