import React, { useEffect, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

const VP_SCOPE_TO_REF = {
  MEDICAL_RECORD: '00000000_vp_consent',
  MEDICATION_PICKUP: '00000000_vp_rx_pickup',
  RESEARCH_ANALYTICS: '00000000_vp_research',
};

const BASIC_VERIFIER_SCENARIOS = [
  {
    key: 'record',
    label: '門診授權',
    description: '驗證診斷摘要與同意卡，適合看診後的授權流程。',
    scope: 'MEDICAL_RECORD',
    ref: VP_SCOPE_TO_REF.MEDICAL_RECORD,
  },
  {
    key: 'pickup',
    label: '領藥取藥',
    description: '使用領藥卡與過敏卡驗證，完成處方領藥／代領。',
    scope: 'MEDICATION_PICKUP',
    ref: VP_SCOPE_TO_REF.MEDICATION_PICKUP,
  },
  {
    key: 'research',
    label: '研究揭露',
    description: '檢驗研究用途的資料揭露，同時呈現診斷與同意資訊。',
    scope: 'RESEARCH_ANALYTICS',
    ref: VP_SCOPE_TO_REF.RESEARCH_ANALYTICS,
  },
];

const POLL_INTERVAL_MS = 5000;

function generateTransactionId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint32Array(4);
    crypto.getRandomValues(buffer);
    const hex = Array.from(buffer, (value) => value.toString(16).padStart(8, '0')).join('');
    return `tx-${hex.slice(0, 24)}`;
  }
  return `tx-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

export function VerifierPanel({ client, verifierToken, isExpertMode = true }) {
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
  const [basicScenario, setBasicScenario] = useState('record');

  useEffect(() => {
    setVerifierRef(VP_SCOPE_TO_REF[scope]);
  }, [scope]);

  useEffect(() => {
    if (!isExpertMode) {
      const matched = BASIC_VERIFIER_SCENARIOS.find((item) => item.key === basicScenario);
      if (matched) {
        setScope(matched.scope);
        setVerifierRef(matched.ref);
      }
    }
  }, [basicScenario, isExpertMode]);

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

  function applyBasicVerifierScenario(key) {
    const matched = BASIC_VERIFIER_SCENARIOS.find((item) => item.key === key);
    if (!matched) {
      return;
    }

    if (!isExpertMode) {
      setScope(matched.scope);
      setVerifierRef(matched.ref);
    }
    setBasicScenario(key);
  }

  async function createSession() {
    setSessionError(null);
    setResult(null);
    setResultError(null);
    const tid = generateTransactionId();
    const effectiveScope = scope || 'MEDICAL_RECORD';
    const ref = verifierRef || VP_SCOPE_TO_REF[effectiveScope];

    try {
      const response = await client.createVerificationCode(
        { ref, transactionId: tid, scope: effectiveScope },
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
            setResultError('皮夾尚未回傳資料，請稍後重試。');
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

  if (!isExpertMode) {
    const activeScenario =
      BASIC_VERIFIER_SCENARIOS.find((scenario) => scenario.key === basicScenario) ||
      BASIC_VERIFIER_SCENARIOS[0];

    return (
      <section aria-labelledby="verifier-heading">
        <h2 id="verifier-heading">Step 3 – 驗證端（基本模式）</h2>
        <div className="alert info">
          預設好驗證範圍與 ref，點擊即可產生授權 QR Code。其他診斷欄位與 JSON 細節保留在專家模式。
        </div>

        <div className="basic-grid">
          <div className="card basic-card">
            <div className="basic-card__header">
              <h3>選擇驗證情境</h3>
              <span className="pill-icon" aria-hidden="true">🛡️</span>
            </div>
            <p className="hint">系統會自動套用範例的驗證範圍與服務代碼。</p>
            <div className="scenario-pills" role="group" aria-label="驗證情境">
              {BASIC_VERIFIER_SCENARIOS.map((scenario) => (
                <button
                  key={scenario.key}
                  type="button"
                  className={`scenario-pill${basicScenario === scenario.key ? ' active' : ''}`}
                  onClick={() => applyBasicVerifierScenario(scenario.key)}
                >
                  <span className="scenario-pill__label">{scenario.label}</span>
                  <span className="scenario-pill__desc">{scenario.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="card basic-card">
            <div className="basic-card__header">
              <h3>建立授權 QR</h3>
              <span className="pill-icon" aria-hidden="true">🔐</span>
            </div>
            <p className="hint">
              使用 {activeScenario.label} 預設 ref：<strong>{activeScenario.ref}</strong>
            </p>
            <div className="token-chip" aria-label="預設 Access Token">
              Access Token：<code>{verifierToken}</code>
            </div>
            <div className="stack">
              <button
                type="button"
                className="secondary"
                onClick={() => applyBasicVerifierScenario(basicScenario)}
              >
                重新套用情境預設
              </button>
              <button type="button" onClick={createSession} disabled={!verifierToken}>
                產生授權 QR Code
              </button>
              <button type="button" className="secondary" onClick={resetSession}>
                重設 Session
              </button>
            </div>
            {sessionError ? <div className="alert error">{sessionError}</div> : null}
            {transactionId ? <p className="hint">Transaction ID：{transactionId}</p> : null}
          </div>

          <div className="card basic-card">
            <div className="basic-card__header">
              <h3>掃碼與結果</h3>
              <span className="pill-icon" aria-hidden="true">📲</span>
            </div>
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
              <div className="placeholder">尚未建立 Session，請先產生授權 QR Code。</div>
            )}
            {authUri ? (
              <p>
                Deep Link：<a href={authUri}>{authUri}</a>
              </p>
            ) : null}
            <div className="stack" style={{ marginTop: '0.5rem' }}>
              <button type="button" onClick={() => pollResult(true)} disabled={!transactionId || isPolling}>
                {isPolling ? '查詢中…' : '查詢驗證結果'}
              </button>
              <label htmlFor="auto-poll-basic" className="inline">
                <input
                  id="auto-poll-basic"
                  type="checkbox"
                  checked={autoPoll}
                  onChange={(event) => setAutoPoll(event.target.checked)}
                  disabled={!transactionId}
                />
                自動輪詢（5 秒）
              </label>
            </div>
            {resultError ? <div className="alert warning">{resultError}</div> : null}
            {result ? (
              <div className="alert success">
                <p>已取得驗證結果，Transaction ID：{transactionId || '未知'}。</p>
                <p className="helper">完整 VP/VC JSON 與欄位細節請切換至專家模式查看。</p>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="verifier-heading">
      <h2 id="verifier-heading">Step 3 – 驗證端</h2>
      <div className="alert info">
        驗證端呼叫政府沙盒 API 產生授權 QR Code。請先在驗證端後台建立 VP 範本並取得 ref 代碼。
      </div>
      {!isExpertMode ? (
        <div className="alert muted">
          基本模式僅呈現建立與查詢 Session 的必要欄位。已預設選擇性揭露欄位，只需建立 Session、掃碼授權、查詢結果，
          若需檢視政府回應原始 JSON 或調校細節，請切換到專家模式。
        </div>
      ) : null}

      <div className="grid two">
        <div className="card">
          <label htmlFor="verifier-token">驗證端 Access Token</label>
          <input id="verifier-token" type="text" value={verifierToken} readOnly aria-readonly="true" />
          <small className="helper">請填入驗證端沙盒核發的 access token。</small>

          <label htmlFor="scope">驗證範圍</label>
          <select id="scope" value={scope} onChange={(event) => setScope(event.target.value)}>
            <option value="MEDICAL_RECORD">授權驗證（vc_cond + vc_cons）</option>
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
          {isExpertMode && rawSession ? <pre>{JSON.stringify(rawSession, null, 2)}</pre> : null}
        </div>
      </div>

      <div className="card">
        <h3>查詢驗證結果</h3>
        <p>請在皮夾 App 完成授權後點擊「查詢結果」。若啟用自動輪詢會每 5 秒更新一次。</p>
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
        {isExpertMode && result ? <pre>{JSON.stringify(result, null, 2)}</pre> : null}
      </div>
    </section>
  );
}
