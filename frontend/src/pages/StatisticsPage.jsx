import React, { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from '../router.jsx';
import { ISSUE_LOG_STORAGE_KEY } from '../constants/storage.js';
import { describeCredentialStatus, isCollectedStatus, isRevokedStatus } from '../utils/status.js';

const CARD_TYPES = [
  {
    scope: 'MEDICAL_RECORD',
    route: 'medical-record',
    navLabel: '病況卡',
    label: '病況卡（vc_cond）',
    description: '提供就醫診斷與病況摘要，預設 7 天後封存。',
  },
  {
    scope: 'MEDICATION_PICKUP',
    route: 'medication-pickup',
    navLabel: '處方領藥卡',
    label: '處方領藥卡（vc_rx）',
    description: '供藥局核銷處方領藥資訊，預設 3 天後刪除。',
  },
  {
    scope: 'CONSENT_CARD',
    route: 'consent-card',
    navLabel: '數據同意卡',
    label: '數據同意卡（vc_cons）',
    description: '記錄資料授權的範圍、用途與期限，預設 180 天。',
  },
  {
    scope: 'ALLERGY_CARD',
    route: 'allergy-card',
    navLabel: '過敏資訊卡',
    label: '過敏資訊卡（vc_algy）',
    description: '揭露過敏原與嚴重度，預設保留 3 年。',
  },
  {
    scope: 'IDENTITY_CARD',
    route: 'identity-card',
    navLabel: '匿名身分卡',
    label: '匿名身分卡（vc_pid）',
    description: '用於鏈結病患匿名 ID 與錢包識別。',
  },
];

function describeLookupSourceLabel(source) {
  switch (source) {
    case 'response':
      return '政府 API 回應';
    case 'nonce':
      return 'nonce 查詢';
    case 'manual':
      return '手動登錄';
    case 'wallet':
      return '錢包同步';
    case 'transaction':
      return '待官方查詢';
    default:
      return null;
  }
}

function formatDateTime(value) {
  if (!value) {
    return '—';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
}

function loadIssueLog() {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(ISSUE_LOG_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed;
  } catch (error) {
    console.warn('Unable to read issuance log for statistics', error);
    return [];
  }
}

const DEFAULT_SUMMARY = { total: 0, collected: 0, revoked: 0, active: 0, pending: 0, withCid: 0 };

function computeGroupedTotals(issueLog) {
  const totals = {
    overall: { total: 0, collected: 0, revoked: 0, withCid: 0 },
    scopes: {},
    entries: {},
  };

  for (const entry of issueLog) {
    const scope = entry.scope || 'UNKNOWN';
    if (!totals.scopes[scope]) {
      totals.scopes[scope] = { total: 0, collected: 0, revoked: 0, withCid: 0 };
      totals.entries[scope] = [];
    }
    totals.scopes[scope].total += 1;
    totals.overall.total += 1;

    const collected = entry.collected || isCollectedStatus(entry.status);
    if (collected) {
      totals.scopes[scope].collected += 1;
      totals.overall.collected += 1;
    }

    if (isRevokedStatus(entry.status)) {
      totals.scopes[scope].revoked += 1;
      totals.overall.revoked += 1;
    }

    if (entry.cid) {
      totals.scopes[scope].withCid += 1;
      totals.overall.withCid += 1;
    }

    totals.entries[scope].push(entry);
  }

  return totals;
}

function deriveScopeSummaries(grouped) {
  return CARD_TYPES.map((card) => {
    const summary = grouped.scopes[card.scope] || { total: 0, collected: 0, revoked: 0, withCid: 0 };
    const entries = grouped.entries[card.scope] || [];
    const extendedSummary = {
      ...summary,
      active: summary.total - summary.revoked,
      pending: summary.total - summary.collected,
      withCid: summary.withCid || 0,
    };
    return {
      ...card,
      summary: extendedSummary,
      entries,
    };
  });
}

function deriveOverallSummary(grouped) {
  const base = grouped.overall || DEFAULT_SUMMARY;
  return {
    total: base.total,
    collected: base.collected,
    revoked: base.revoked,
    active: base.total - base.revoked,
    pending: base.total - base.collected,
    withCid: base.withCid || 0,
  };
}

function StatsNavigation({ navItems }) {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const activeKey = segments.length <= 1 ? 'overview' : segments[1];

  return (
    <nav className="stats-subnav" aria-label="統計子頁">
      {navItems.map((item) => (
        <Link key={item.key} to={item.to} className={activeKey === item.key ? 'active' : ''}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

function StatsOverview({ overallSummary, scopeSummaries }) {
  return (
    <article>
      <h3>總覽</h3>
      <p>
        將發卡紀錄依卡別彙整，協助快速掌握總發卡數量、領取進度與撤銷狀態。若於發卡頁更新紀錄，本頁將自動同步。
      </p>
      <div className="stat-summary-grid" role="list" aria-label="總覽指標">
        <div className="stat-tile" role="listitem">
          <span className="stat-label">總發卡數</span>
          <strong className="stat-value">{overallSummary.total}</strong>
        </div>
        <div className="stat-tile" role="listitem">
          <span className="stat-label">已領取</span>
          <strong className="stat-value">{overallSummary.collected}</strong>
        </div>
        <div className="stat-tile" role="listitem">
          <span className="stat-label">待領取</span>
          <strong className="stat-value">{overallSummary.pending}</strong>
        </div>
        <div className="stat-tile" role="listitem">
          <span className="stat-label">有效中</span>
          <strong className="stat-value">{overallSummary.active}</strong>
        </div>
        <div className="stat-tile" role="listitem">
          <span className="stat-label">已撤銷</span>
          <strong className="stat-value">{overallSummary.revoked}</strong>
        </div>
        <div className="stat-tile" role="listitem">
          <span className="stat-label">已取得 CID</span>
          <strong className="stat-value">{overallSummary.withCid}</strong>
        </div>
      </div>

      <div className="stat-card-grid">
        {scopeSummaries.map((card) => (
          <div key={card.scope} className="stat-card">
            <h4>{card.label}</h4>
            <p className="hint">{card.description}</p>
            <dl>
              <div>
                <dt>總發卡</dt>
                <dd>{card.summary.total}</dd>
              </div>
              <div>
                <dt>已領取</dt>
                <dd>{card.summary.collected}</dd>
              </div>
              <div>
                <dt>待領取</dt>
                <dd>{card.summary.pending}</dd>
              </div>
              <div>
                <dt>已撤銷</dt>
                <dd>{card.summary.revoked}</dd>
              </div>
              <div>
                <dt>已取得 CID</dt>
                <dd>{card.summary.withCid}</dd>
              </div>
            </dl>
            <Link className="stat-card-link" to={card.route}>
              查看{card.navLabel}紀錄 →
            </Link>
          </div>
        ))}
      </div>
    </article>
  );
}

function deriveCidMetadata(entry) {
  const cid = entry.cid ? String(entry.cid) : '';
  const prefix =
    typeof entry.cidSandboxPrefix === 'string' ? entry.cidSandboxPrefix : '';
  const fallbackPath = cid ? `${prefix || ''}/api/credential/${cid}/revocation` : '';
  const displayPath =
    entry.cidRevocationDisplayPath && typeof entry.cidRevocationDisplayPath === 'string'
      ? entry.cidRevocationDisplayPath
      : entry.cidRevocationPath && typeof entry.cidRevocationPath === 'string'
      ? entry.cidRevocationPath
      : fallbackPath;
  const sandboxPath =
    entry.cidRevocationPath &&
    typeof entry.cidRevocationPath === 'string' &&
    entry.cidRevocationPath !== displayPath
      ? entry.cidRevocationPath
      : '';
  const displayUrl =
    entry.cidRevocationDisplayUrl && typeof entry.cidRevocationDisplayUrl === 'string'
      ? entry.cidRevocationDisplayUrl
      : entry.cidRevocationUrl && typeof entry.cidRevocationUrl === 'string'
      ? entry.cidRevocationUrl
      : '';
  const sandboxUrl =
    entry.cidRevocationUrl &&
    typeof entry.cidRevocationUrl === 'string' &&
    entry.cidRevocationUrl !== displayUrl
      ? entry.cidRevocationUrl
      : '';
  const jti = entry.credentialJti
    ? String(entry.credentialJti)
    : entry.jti
    ? String(entry.jti)
    : '';
  return {
    cid,
    displayPath,
    sandboxPath,
    displayUrl,
    sandboxUrl,
    jti,
    lookupHint: entry.cidLookupHint || null,
    lookupPending: Boolean(entry.cidLookupPending),
  };
}

function StatsCardDetail({ card }) {
  const entries = useMemo(() => {
    return [...card.entries].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [card.entries]);

  return (
    <article>
      <h3>{card.label}</h3>
      <p className="hint">{card.description}</p>
      <div className="stat-detail-grid">
        <div>
          <div className="stat-detail-label">總發卡</div>
          <div className="stat-detail-value">{card.summary.total}</div>
        </div>
        <div>
          <div className="stat-detail-label">已領取</div>
          <div className="stat-detail-value">{card.summary.collected}</div>
        </div>
        <div>
          <div className="stat-detail-label">待領取</div>
          <div className="stat-detail-value">{card.summary.pending}</div>
        </div>
        <div>
          <div className="stat-detail-label">有效中</div>
          <div className="stat-detail-value">{card.summary.active}</div>
        </div>
        <div>
          <div className="stat-detail-label">已撤銷</div>
          <div className="stat-detail-value">{card.summary.revoked}</div>
        </div>
        <div>
          <div className="stat-detail-label">已取得 CID</div>
          <div className="stat-detail-value">{card.summary.withCid}</div>
        </div>
      </div>

      {entries.length ? (
        <div className="stat-record-list">
          {entries.map((entry, index) => {
            const meta = deriveCidMetadata(entry);
            const statusInfo = describeCredentialStatus(entry.status);
            const badgeClass = statusInfo.tone ? `status-badge ${statusInfo.tone}` : 'status-badge';
            const lookupSourceLabel = describeLookupSourceLabel(entry.cidLookupSource);
            const cidDisplay = meta.cid ? (
              <code className="stat-record-cid">{meta.cid}</code>
            ) : entry.cidLookupPending ? (
              <span className="stat-record-placeholder pending">等待領取</span>
            ) : entry.cidLookupError ? (
              <span className="stat-record-placeholder error">{entry.cidLookupError}</span>
            ) : (
              <span className="stat-record-placeholder">尚未取得</span>
            );

            return (
              <article
                key={`${entry.cid || entry.transactionId || index}-${index}`}
                className="stat-record-card"
              >
                <header className="stat-record-header">
                  <div>
                    <h4>{entry.holderDid || '未知持卡者'}</h4>
                    <p className="stat-record-subtitle">
                      交易序號：{entry.transactionId || '—'}
                      <span className="separator" aria-hidden="true">
                        ·
                      </span>
                      發卡時間：{formatDateTime(entry.timestamp)}
                    </p>
                  </div>
                  <span className={badgeClass}>{statusInfo.text}</span>
                </header>
                <dl className="stat-record-grid">
                  <div>
                    <dt>CID</dt>
                    <dd>{cidDisplay}</dd>
                  </div>
                  <div>
                    <dt>JTI</dt>
                    <dd>{meta.jti ? <code>{meta.jti}</code> : '—'}</dd>
                  </div>
                  <div>
                    <dt>持卡者 DID</dt>
                    <dd>{entry.holderDid || '—'}</dd>
                  </div>
                  <div>
                    <dt>領取時間</dt>
                    <dd>{formatDateTime(entry.collectedAt)}</dd>
                  </div>
                  <div>
                    <dt>撤銷時間</dt>
                    <dd>{formatDateTime(entry.revokedAt)}</dd>
                  </div>
                  <div>
                    <dt>官方狀態</dt>
                    <dd>
                      <span className={badgeClass}>{statusInfo.text}</span>
                    </dd>
                  </div>
                </dl>
                <div className="stat-record-meta">
                  {lookupSourceLabel ? <span>CID 來源：{lookupSourceLabel}</span> : null}
                  {meta.displayPath ? <span>撤銷 API：PUT {meta.displayPath}</span> : null}
                  {meta.sandboxPath && meta.sandboxPath !== meta.displayPath ? (
                    <span>沙盒 API：PUT {meta.sandboxPath}</span>
                  ) : null}
                  {meta.displayUrl ? <span>撤銷 URL：{meta.displayUrl}</span> : null}
                  {meta.sandboxUrl && meta.sandboxUrl !== meta.displayUrl ? (
                    <span>沙盒 URL：{meta.sandboxUrl}</span>
                  ) : null}
                </div>
                {meta.lookupHint && !entry.cidLookupError ? (
                  <p className={`stat-record-hint${meta.lookupPending ? ' pending' : ''}`}>
                    官方回應：{meta.lookupHint}
                  </p>
                ) : null}
                {entry.cidLookupError ? (
                  <p className="stat-record-hint error">CID 查詢失敗：{entry.cidLookupError}</p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <p className="empty">尚無此卡別的發卡紀錄。</p>
      )}
    </article>
  );
}

export function StatisticsPage() {
  const [issueLog, setIssueLog] = useState(() => loadIssueLog());

  useEffect(() => {
    function refresh() {
      setIssueLog(loadIssueLog());
    }

    function handleStorage(event) {
      if (!event.key || event.key === ISSUE_LOG_STORAGE_KEY) {
        refresh();
      }
    }

    window.addEventListener('storage', handleStorage);
    window.addEventListener('medssi:issue-log-updated', refresh);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('medssi:issue-log-updated', refresh);
    };
  }, []);

  const grouped = useMemo(() => computeGroupedTotals(issueLog), [issueLog]);
  const scopeSummaries = useMemo(() => deriveScopeSummaries(grouped), [grouped]);
  const overallSummary = useMemo(() => deriveOverallSummary(grouped), [grouped]);

  const navItems = useMemo(
    () => [
      { key: 'overview', label: '總覽', to: 'overview' },
      ...scopeSummaries.map((card) => ({ key: card.route, label: card.navLabel, to: card.route })),
    ],
    [scopeSummaries]
  );

  return (
    <section>
      <h2>發卡統計</h2>
      <StatsNavigation navItems={navItems} />
      <Routes>
        <Route index element={<Navigate to="overview" replace />} />
        <Route
          path="overview"
          element={<StatsOverview overallSummary={overallSummary} scopeSummaries={scopeSummaries} />}
        />
        {scopeSummaries.map((card) => (
          <Route key={card.scope} path={card.route} element={<StatsCardDetail card={card} />} />
        ))}
        <Route path="*" element={<Navigate to="overview" replace />} />
      </Routes>
    </section>
  );
}
