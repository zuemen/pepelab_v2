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

# 修正：確保 CAMEL_TO_SNAKE 正確定義
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
