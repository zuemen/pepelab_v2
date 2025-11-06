import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

const VP_SCOPE_TO_REF = {
  MEDICAL_RECORD: '00000000_vp_consent',
  MEDICATION_PICKUP: '00000000_vp_rx_pickup',
  RESEARCH_ANALYTICS: '00000000_vp_research',
};

const POLL_INTERVAL_MS = 5000;

function generateTransactionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function VerifierPanel({ client, verifierToken }) {
  const [scope, setScope] = useState('MEDICAL_RECORD');
  const [verifierRef, setVerifierRef] = useState(VP_SCOPE_TO_REF.MEDICAL_RECORD);
  const [transactionId, setTransactionId] = useState('');
  const [qrCodeImage, setQrCodeImage] = useState('');
  const [authUri, setAuthUri] = useState('');
  const [sessionError, setSessionError] = useState(null);
  const [result, setResult] = useState(null);
  const [resultError, setResultError] = useState(null);
  const [autoPoll, setAutoPoll] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [rawSession, setRawSession] = useState(null);

  useEffect(() => {
    setVerifierRef(VP_SCOPE_TO_REF[scope]);
  }, [scope]);

  useEffect(() => {
    if (!autoPoll || !transactionId) {
      return undefined;
    }
    const interval = setInterval(() => {
      pollResult(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPoll, transactionId]);

  async function createSession() {
    setSessionError(null);
    setResult(null);
    setResultError(null);
    const tid = generateTransactionId();
    const ref = verifierRef || VP_SCOPE_TO_REF[scope];

    try {
      const response = await client.createVerificationCode(
        { ref, transactionId: tid },
        verifierToken
      );

      if (!response.ok) {
        setSessionError(`(${response.status}) ${response.detail}`);
        setTransactionId('');
        setQrCodeImage('');
        setAuthUri('');
        setRawSession(null);
        return;
      }

      const data = response.data || {};
      setTransactionId(data.transactionId || tid);
      setQrCodeImage(data.qrcodeImage || data.qrCode || data.qrcode_image || '');
      setAuthUri(data.authUri || data.deepLink || data.auth_uri || '');
      setRawSession(data);
      setSessionError(null);
    } catch (error) {
      setSessionError(error.message || '建立驗證 Session 失敗');
      setTransactionId('');
      setQrCodeImage('');
      setAuthUri('');
      setRawSession(null);
    }
  }

  async function pollResult(showWaitingMessage = true) {
    if (!transactionId) {
      setResultError('請先建立驗證 Session');
      return;
    }

    setIsPolling(true);
    try {
      const response = await client.submitPresentation(
        { transactionId },
        verifierToken
      );

      if (!response.ok) {
        if (response.status === 400) {
          if (showWaitingMessage) {
            setResultError('錢包尚未回傳資料，請稍後重試。');
          } else {
            setResultError(null);
          }
        } else {
          setResultError(`(${response.status}) ${response.detail}`);
        }
        return;
      }

      setResult(response.data);
      setResultError(null);
    } catch (error) {
      setResultError(error.message || '查詢驗證結果失敗');
    } finally {
      setIsPolling(false);
    }
  }

  function resetSession() {
    setTransactionId('');
    setQrCodeImage('');
    setAuthUri('');
    setResult(null);
    setResultError(null);
    setSessionError(null);
    setRawSession(null);
    setAutoPoll(false);
  }

  const qrSource = qrCodeImage || authUri;
  const renderAsImage = qrCodeImage && qrCodeImage.startsWith('data:image');

  return (
    <section aria-labelledby="verifier-heading">
      <h2 id="verifier-heading">Step 3 – 驗證端</h2>
      <div className="alert info">
        驗證端呼叫政府沙盒 API 產生授權 QR Code。請先在驗證端後台建立 VP 範本並取得 ref 代碼。
      </div>

      <div className="grid two">
        <div className="card">
          <label htmlFor="verifier-token">驗證端 Access Token</label>
          <input id="verifier-token" type="text" value={verifierToken} readOnly aria-readonly="true" />
          <small className="helper">沙盒預設 J3LdHEiVxmHBYJ6iStnmATLblzRkz2AC。</small>

          <label htmlFor="scope">驗證範圍</label>
          <select id="scope" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="MEDICAL_RECORD">授權驗證（vc_pid + vc_cons）</option>
            <option value="MEDICATION_PICKUP">領藥驗證（vc_rx + vc_algy）</option>
            <option value="RESEARCH_ANALYTICS">研究揭露（vc_cond + vc_cons + vc_algy）</option>
          </select>

          <label htmlFor="verifier-ref">驗證服務代碼 (ref)</label>
          <input
            id="verifier-ref"
            value={verifierRef}
            onChange={(event) => setVerifierRef(event.target.value)}
          />
          <small className="helper">請從驗證端沙盒「建立 VP」詳細資料頁複製 ref 值。</small>

          <button type="button" onClick={createSession} disabled={!verifierToken}>
            產生授權 QR Code
          </button>
          <button type="button" className="secondary" onClick={resetSession}>
            重設 Session
          </button>

          {sessionError ? <div className="alert error">{sessionError}</div> : null}
        </div>

        <div className="card">
          <h3>授權 QR Code</h3>
          {qrSource ? (
            renderAsImage ? (
              <div className="qr-container" aria-label="驗證 QR Code">
                <img src={qrCodeImage} alt="驗證 QR Code" width={192} height={192} />
              </div>
            ) : (
              <div className="qr-container" aria-label="驗證 QR Code">
                <QRCodeCanvas value={qrSource} size={192} includeMargin />
              </div>
            )
          ) : (
            <p>尚未建立 Session。</p>
          )}
          {authUri ? (
            <p>
              Deep Link：<a href={authUri}>{authUri}</a>
            </p>
          ) : null}
          {transactionId ? <p>Transaction ID：{transactionId}</p> : null}
          {rawSession ? <pre>{JSON.stringify(rawSession, null, 2)}</pre> : null}
        </div>
      </div>

      <div className="card">
        <h3>查詢驗證結果</h3>
        <p>請在錢包 App 完成授權後點擊「查詢結果」。若啟用自動輪詢會每 5 秒更新一次。</p>
        <div className="stack">
          <button type="button" onClick={() => pollResult(true)} disabled={!transactionId || isPolling}>
            {isPolling ? '查詢中…' : '查詢結果'}
          </button>
          <label htmlFor="auto-poll" className="inline">
            <input
              id="auto-poll"
              type="checkbox"
              checked={autoPoll}
              onChange={(event) => setAutoPoll(event.target.checked)}
              disabled={!transactionId}
            />
            自動輪詢（每 5 秒）
          </label>
        </div>
        {resultError ? <div className="alert warning">{resultError}</div> : null}
        {result ? (
          <pre>{JSON.stringify(result, null, 2)}</pre>
        ) : null}
      </div>
    </section>
  );
}
