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

function StatsSummaryBanner({ overallSummary }) {
  const items = [
    { key: 'total', label: '總發卡', value: overallSummary.total, accent: 'primary', icon: '🪪' },
    { key: 'collected', label: '已領取', value: overallSummary.collected, accent: 'success', icon: '✅' },
    { key: 'pending', label: '待領取', value: overallSummary.pending, accent: 'warning', icon: '⏳' },
    { key: 'revoked', label: '已撤銷', value: overallSummary.revoked, accent: 'danger', icon: '🚫' },
    { key: 'cid', label: '已取得 CID', value: overallSummary.withCid, accent: 'info', icon: '🔐' },
  ];

  return (
    <div className="stats-summary-banner" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.key} className={`stats-summary-item ${item.accent}`}>
          <span className="stats-summary-icon" aria-hidden="true">
            {item.icon}
          </span>
          <div className="stats-summary-copy">
            <span className="summary-label">{item.label}</span>
            <strong className="summary-value">{item.value}</strong>
          </div>
        </div>
      ))}
    </div>
  );
}

function StatsNavigation({ navItems, defaultKey }) {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const activeKey = segments[1] || defaultKey;

  return (
    <nav className="stats-subnav" aria-label="統計子頁">
      {navItems.map((item) => (
        <Link
          key={item.key}
          to={item.to}
          className={activeKey === item.key ? 'active' : ''}
          aria-current={activeKey === item.key ? 'page' : undefined}
        >
          <span className="stats-subnav-label">{item.label}</span>
          {typeof item.count === 'number' ? <span className="stats-subnav-count">{item.count}</span> : null}
        </Link>
      ))}
    </nav>
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

function StatsRecordCard({ entry, index }) {
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
  const collected = entry.collected || statusInfo.collected;
  const collectedBadgeClass = collected
    ? 'status-badge success'
    : entry.cidLookupPending
    ? 'status-badge pending'
    : 'status-badge muted';
  const collectedText = collected ? '已領取' : entry.cidLookupPending ? '等待領取' : '尚未領取';

  return (
    <article key={`${entry.cid || entry.transactionId || index}-${index}`} className="stat-record-card">
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
          <dt>領取狀態</dt>
          <dd>
            <span className={collectedBadgeClass}>{collectedText}</span>
          </dd>
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
}

function StatsRecordList({ entries, emptyMessage }) {
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });
  }, [entries]);

  if (!sortedEntries.length) {
    return <p className="empty">{emptyMessage}</p>;
  }

  return (
    <div className="stat-record-list">
      {sortedEntries.map((entry, index) => (
        <StatsRecordCard key={`${entry.cid || entry.transactionId || index}-${index}`} entry={entry} index={index} />
      ))}
    </div>
  );
}

function StatsCardDetail({ card }) {
  return (
    <article className="stats-card-detail">
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

      <StatsRecordList entries={card.entries} emptyMessage="尚無此卡別的發卡紀錄。" />
    </article>
  );
}

function StatsAllRecords({ issueLog, overallSummary }) {
  return (
    <article className="stats-card-detail">
      <h3>發卡紀錄總覽</h3>
      <p className="hint">
        依時間排序列出所有發卡紀錄，可快速檢視持卡者、官方狀態與撤銷端點。若在發卡頁重新查詢官方
        nonce，統計頁會即時同步更新。
      </p>
      <div className="stat-detail-grid">
        <div>
          <div className="stat-detail-label">總發卡</div>
          <div className="stat-detail-value">{overallSummary.total}</div>
        </div>
        <div>
          <div className="stat-detail-label">已領取</div>
          <div className="stat-detail-value">{overallSummary.collected}</div>
        </div>
        <div>
          <div className="stat-detail-label">待領取</div>
          <div className="stat-detail-value">{overallSummary.pending}</div>
        </div>
        <div>
          <div className="stat-detail-label">有效中</div>
          <div className="stat-detail-value">{overallSummary.active}</div>
        </div>
        <div>
          <div className="stat-detail-label">已撤銷</div>
          <div className="stat-detail-value">{overallSummary.revoked}</div>
        </div>
        <div>
          <div className="stat-detail-label">已取得 CID</div>
          <div className="stat-detail-value">{overallSummary.withCid}</div>
        </div>
      </div>

      <StatsRecordList entries={issueLog} emptyMessage="尚未紀錄任何電子卡。" />
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
      ...scopeSummaries.map((card) => ({
        key: card.route,
        label: card.navLabel,
        to: `/stats/${card.route}`,
        count: card.summary.total,
      })),
      {
        key: 'records',
        label: '全部紀錄',
        to: '/stats/records',
        count: overallSummary.total,
      },
    ],
    [scopeSummaries, overallSummary.total]
  );

  const defaultRoute = scopeSummaries.length ? scopeSummaries[0].route : 'records';

  return (
    <section>
      <h2>發卡統計</h2>
      <StatsSummaryBanner overallSummary={overallSummary} />
      <StatsNavigation navItems={navItems} defaultKey={defaultRoute} />
      <Routes>
        <Route index element={<Navigate to={defaultRoute} replace />} />
        <Route
          path="records"
          element={<StatsAllRecords issueLog={issueLog} overallSummary={overallSummary} />}
        />
        {scopeSummaries.map((card) => (
          <Route key={card.scope} path={card.route} element={<StatsCardDetail card={card} />} />
        ))}
        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </section>
  );
}
