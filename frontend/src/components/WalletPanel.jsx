import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSamplePayload } from '../hooks/useSamplePayload.js';

const ACTION_LABELS = {
  ACCEPT: '接受並寫入錢包',
  DECLINE: '拒絕此憑證',
  REVOKE: '撤銷（持卡者）',
  UPDATE: '更新 Payload',
};

const SAMPLE_HOLDER_PROFILES = [
  {
    did: 'did:example:patient-001',
    label: '張小華（病歷授權）',
  },
  {
    did: 'did:example:patient-002',
    label: '王曉梅（領藥授權）',
  },
];

function resolvePath(source, path) {
  if (!source) return null;
  const segments = path.split('.');
  let current = source;
  for (const segment of segments) {
    if (!segment) continue;
    const match = segment.match(/^(\w+)(\[(\d+)\])?$/);
    if (!match) {
      current = current?.[segment];
      continue;
    }
    const [, key, , index] = match;
    current = current?.[key];
    if (index !== undefined) {
      const idx = Number(index);
      if (!Array.isArray(current) || idx >= current.length) {
        return null;
      }
      current = current[idx];
    }
    if (current === undefined || current === null) {
      return null;
    }
  }
  if (current === undefined || current === null) {
    return null;
  }
  if (typeof current === 'object') {
    return JSON.stringify(current);
  }
  return String(current);
}

function decodeJwt(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length < 2) {
      return null;
    }
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    let binary;
    if (typeof window !== 'undefined' && window.atob) {
      binary = window.atob(padded);
    } else if (typeof Buffer !== 'undefined') {
      binary = Buffer.from(padded, 'base64').toString('binary');
    } else {
      return null;
    }
    const json = decodeURIComponent(
      Array.from(binary)
        .map((char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
        .join('')
    );
    return JSON.parse(json);
  } catch (error) {
    console.error('Failed to decode JWT', error);
    return null;
  }
}

export function WalletPanel({
  client,
  baseUrl,
  walletToken,
  latestTransactionId,
  issuerToken,
}) {
  const [transactionId, setTransactionId] = useState('');
  const [nonceInfo, setNonceInfo] = useState(null);
  const [nonceError, setNonceError] = useState(null);
  const [holderDid, setHolderDid] = useState('did:example:patient-001');
  const [action, setAction] = useState('ACCEPT');
  const [payloadDraft, setPayloadDraft] = useState('');
  const [actionResult, setActionResult] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [credentials, setCredentials] = useState([]);
  const [listError, setListError] = useState(null);
  const [forgetResult, setForgetResult] = useState(null);
  const samplePayloadBuilder = useSamplePayload(holderDid);

  const autoTransactionRef = useRef('');

  const nonceAuthToken = issuerToken || walletToken;

  const isGovernmentFallback =
    (nonceInfo?.externalSource || nonceInfo?.external_source) === 'GOVERNMENT';

  const credentialId = useMemo(() => nonceInfo?.credential_id ?? '', [nonceInfo]);

  async function requestNonce(targetId) {
    setNonceError(null);
    setNonceInfo(null);
    const normalized = (targetId || '').trim();
    if (!normalized) {
      setNonceError('請輸入交易編號');
      return false;
    }
    if (!nonceAuthToken) {
      setNonceError('請先提供發行端 Access Token（Authorization: Bearer <issuer token>）');
      return false;
    }
    const response = await client.getNonce(normalized, nonceAuthToken);
    if (!response.ok) {
      const baseMessage = `(${response.status}) ${response.detail}`;
      if (response.status === 401) {
        setNonceError(
          `${baseMessage} – 請確認於 Authorization header 使用發行端 Access Token (Bearer <issuer token>)。`
        );
      } else {
        setNonceError(baseMessage);
      }
      return false;
    }
    const data = response.data || {};
    const nextInfo = { ...data };
    if (nextInfo.externalSource && !nextInfo.external_source) {
      nextInfo.external_source = nextInfo.externalSource;
    }
    const credentialJwt = data.credential;
    if (credentialJwt) {
      const parsed = decodeJwt(credentialJwt);
      nextInfo.credential_jwt = credentialJwt;
      nextInfo.parsed = parsed;
      if (!nextInfo.credential_id && parsed?.jti) {
        const parsedId = parsed.jti.split('/').pop() || parsed.jti.split(':').pop() || '';
        if (parsedId) {
          nextInfo.credential_id = parsedId;
        }
      }
    }
    if (!nextInfo.credential_id && data.credentialId) {
      nextInfo.credential_id = data.credentialId;
    }
    setNonceInfo(nextInfo);
    return true;
  }

  async function fetchNonce(nextTransactionId) {
    const targetId = nextTransactionId ?? transactionId;
    return requestNonce(targetId);
  }

  useEffect(() => {
    if (!latestTransactionId) {
      return;
    }
    const trimmed = latestTransactionId.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed === autoTransactionRef.current) {
      return;
    }
    autoTransactionRef.current = trimmed;
    setTransactionId(trimmed);
    requestNonce(trimmed);
  }, [latestTransactionId]);

  function parsePayloadDraft() {
    if (!payloadDraft) {
      return null;
    }
    try {
      return JSON.parse(payloadDraft);
    } catch (error) {
      setActionError('Payload 不是合法的 JSON');
      return null;
    }
  }

  async function runAction() {
    if (
      nonceInfo?.mode === 'GOVERNMENT' &&
      !(nonceInfo?.externalSource || nonceInfo?.external_source)
    ) {
      setActionError('政府沙盒憑證請透過官方數位皮夾操作，無法在此頁面進行。');
      return;
    }
    if (!credentialId) {
      setActionError('請先取得 nonce');
      return;
    }
    setLoading(true);
    setActionError(null);
    setActionResult(null);

    let payload = undefined;
    if (action === 'ACCEPT' || action === 'UPDATE') {
      if (nonceInfo?.mode === 'WITHOUT_DATA' || action === 'UPDATE') {
        if (!payloadDraft) {
          setLoading(false);
          setActionError('此憑證需要提供 FHIR Payload');
          return;
        }
        const parsed = parsePayloadDraft();
        if (!parsed) {
          setLoading(false);
          return;
        }
        payload = parsed;
      }
    }

    const disclosures = {};
    const disclosureSource = payload || nonceInfo?.payload_template;
    if (nonceInfo?.disclosure_policies && disclosureSource) {
      nonceInfo.disclosure_policies.forEach((policy) => {
        policy.fields.forEach((field) => {
          const value = resolvePath(disclosureSource, field);
          if (value !== null && value !== undefined) {
            disclosures[field] = value;
          }
        });
      });
    }

    const response = await client.actOnCredential(
      credentialId,
      {
        action,
        holder_did: holderDid,
        payload,
        disclosures,
      },
      walletToken
    );

    setLoading(false);
    if (!response.ok) {
      setActionError(`(${response.status}) ${response.detail}`);
      return;
    }
    setActionResult(response.data);
  }

  async function loadSamplePayload() {
    const sample = samplePayloadBuilder();
    setPayloadDraft(JSON.stringify(sample, null, 2));
  }

  async function listWalletCredentials() {
    setListError(null);
    const response = await client.listHolderCredentials(holderDid, walletToken);
    if (!response.ok) {
      setListError(`(${response.status}) ${response.detail}`);
      setCredentials([]);
      return;
    }
    setCredentials(response.data);
  }

  async function forgetHolderData() {
    setForgetResult(null);
    const response = await client.forgetHolder(holderDid, walletToken);
    if (!response.ok) {
      setForgetResult({ error: `(${response.status}) ${response.detail}` });
      return;
    }
    setForgetResult(response.data);
    setCredentials([]);
    setNonceInfo(null);
    setActionResult(null);
    setPayloadDraft('');
  }

  return (
    <section aria-labelledby="wallet-heading">
      <h2 id="wallet-heading">Step 2 – 病患錢包</h2>
      <p className="badge">API Base URL：{baseUrl}</p>
      <div className="alert info">
        錢包需驗證 Wallet Access Token（預設 wallet-sandbox-token），系統將記錄 selective disclosure。
        取得 nonce 時會自動以發行端 Access Token 呼叫 GET /api/credential/nonce/{transactionId}。
        可透過下方按鈕檢視錢包內的憑證並行使可遺忘權。
      </div>

      <div className="grid two">
        <div className="card">
          <label htmlFor="wallet-token">Wallet Access Token</label>
          <input id="wallet-token" value={walletToken} readOnly aria-readonly="true" />

          <label htmlFor="transaction-id">交易編號 (transaction_id)</label>
          <input
            id="transaction-id"
            value={transactionId}
            onChange={(event) => setTransactionId(event.target.value)}
            placeholder="輸入發卡後回傳的 transaction_id"
          />
          {latestTransactionId && transactionId === latestTransactionId.trim() ? (
            <small className="helper">已自動載入最新交易編號並完成查詢。</small>
          ) : null}
          <button type="button" onClick={() => fetchNonce()}>
            取得 nonce
          </button>
          {nonceError ? <div className="alert error">{nonceError}</div> : null}

          {nonceInfo ? (
            <div className="alert success" role="status">
              {isGovernmentFallback
                ? `已從政府沙盒同步憑證 ${nonceInfo.credential_id || ''}，可在此錢包繼續操作。`
                : `已取得憑證 ${nonceInfo.credential_id}，狀態：${nonceInfo.status ?? '未知'}`}
            </div>
          ) : null}

          <label htmlFor="holder-did-wallet">我的 DID</label>
          <input
            id="holder-did-wallet"
            value={holderDid}
            onChange={(event) => setHolderDid(event.target.value)}
          />
          <div className="quick-select">
            <span className="quick-select-label">快速選擇：</span>
            {SAMPLE_HOLDER_PROFILES.map((profile) => (
              <button
                key={profile.did}
                type="button"
                className={`secondary quick-select-button${
                  holderDid === profile.did ? ' active' : ''
                }`}
                onClick={() => setHolderDid(profile.did)}
              >
                {profile.label}
              </button>
            ))}
          </div>

          <label htmlFor="action-select">操作</label>
          <select
            id="action-select"
            value={action}
            onChange={(event) => setAction(event.target.value)}
          >
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label htmlFor="payload-draft">FHIR Payload (必要時填寫)</label>
          <textarea
            id="payload-draft"
            value={payloadDraft}
            onChange={(event) => setPayloadDraft(event.target.value)}
            placeholder="需要補資料時請貼上 FHIR JSON"
          />
          <button type="button" className="secondary" onClick={loadSamplePayload}>
            載入示例 Payload
          </button>

          <button type="button" onClick={runAction} disabled={loading}>
            {loading ? '送出中…' : ACTION_LABELS[action]}
          </button>

          {actionError ? <div className="alert error">{actionError}</div> : null}
          {actionResult ? (
            <div className="alert success" role="status">
              操作完成，最新狀態：{actionResult.status}
            </div>
          ) : null}
        </div>

        <div className="card">
          <h3>揭露政策與範例</h3>
          {nonceInfo ? (
            <>
              {isGovernmentFallback ? (
                <div className="alert info">
                  已自政府沙盒帶入最新憑證資料。
                  {nonceInfo.credential_jwt ? ' 下方可查看轉傳的 JWT 內容。' : ''}
                </div>
              ) : null}
              <p>模式：{nonceInfo.mode}</p>
              <p>身份保證等級：{nonceInfo.ial}</p>
              <p>到期：{nonceInfo.expires_at ? new Date(nonceInfo.expires_at).toLocaleString() : '未提供'}</p>
              {(nonceInfo.disclosure_policies || []).map((policy) => (
                <div key={policy.scope} className="alert info">
                  <strong>{policy.scope}</strong>
                  <ul>
                    {policy.fields.map((field) => (
                      <li key={field}>{field}</li>
                    ))}
                  </ul>
                </div>
              ))}
              {nonceInfo.payload_template ? (
                <details>
                  <summary>發行端提供的 FHIR Template</summary>
                  <pre>{JSON.stringify(nonceInfo.payload_template, null, 2)}</pre>
                </details>
              ) : null}
              {nonceInfo.credential_jwt ? (
                <details>
                  <summary>政府沙盒回傳的 Credential JWT</summary>
                  <pre>{nonceInfo.credential_jwt}</pre>
                  {nonceInfo.parsed ? (
                    <>
                      <h4>解碼後 Payload</h4>
                      <pre>{JSON.stringify(nonceInfo.parsed, null, 2)}</pre>
                    </>
                  ) : null}
                </details>
              ) : null}
            </>
          ) : (
            <p>請先輸入交易編號取得 nonce。</p>
          )}
        </div>
      </div>

      <div className="card">
        <h3>錢包內的憑證</h3>
        <button type="button" onClick={listWalletCredentials}>
          查看我的憑證列表
        </button>
        {listError ? <div className="alert error">{listError}</div> : null}
        {credentials.length ? (
          <ul>
            {credentials.map((credential) => (
              <li key={credential.credential_id}>
                <strong>{credential.credential_id}</strong> – 狀態：{credential.status} – 主用途：
                {credential.primary_scope}
              </li>
            ))}
          </ul>
        ) : (
          <p>尚無資料或尚未載入。</p>
        )}
        <button type="button" className="secondary" onClick={forgetHolderData}>
          行使可遺忘權（清除錢包資料）
        </button>
        {forgetResult ? <pre>{JSON.stringify(forgetResult, null, 2)}</pre> : null}
      </div>
    </section>
  );
}
