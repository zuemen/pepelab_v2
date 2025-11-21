import React, { useMemo, useState } from 'react';
import { Routes, Route, Navigate, Link, useLocation } from './router.jsx';
import { IssuerPage } from './pages/IssuerPage.jsx';
import { VerifierPage } from './pages/VerifierPage.jsx';
import { StatisticsPage } from './pages/StatisticsPage.jsx';
import { createClient } from './api/client.js';

const DEFAULT_BASE_URL = import.meta.env.VITE_MEDSSI_API || 'http://localhost:8000';

export default function App() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [issuerToken, setIssuerToken] = useState('koreic2ZEFZ2J4oo2RaZu58yGVXiqDQy');
  const [walletToken, setWalletToken] = useState('wallet-sandbox-token');
  const [verifierToken, setVerifierToken] = useState('J3LdHEiVxmHBYJ6iStnmATLblzRkz2AC');
  const [resetMessage, setResetMessage] = useState(null);

  const client = useMemo(() => createClient(baseUrl), [baseUrl]);

  async function resetSandbox() {
    const response = await client.resetSandbox(issuerToken);
    if (!response.ok) {
      setResetMessage(`重設失敗：(${response.status}) ${response.detail}`);
      return;
    }
    setResetMessage(`已於 ${new Date(response.data.timestamp).toLocaleString()} 重設沙盒資料。`);
  }

  const location = useLocation();
  const currentPath = location.pathname === '/' ? '/issuer' : location.pathname;

  const navItems = [
    { to: '/issuer', label: '發卡頁' },
    { to: '/verifier', label: '驗證頁' },
    { to: '/stats', label: '統計頁' },
  ];

  function isActivePath(target) {
    const normalized = target.startsWith('/') ? target : `/${target}`;
    return (
      currentPath === normalized ||
      (currentPath.startsWith(normalized) && currentPath.charAt(normalized.length) === '/')
    );
  }

  return (
    <div className="sandbox-shell">
      <header className="sandbox-hero">
        <div className="sandbox-hero__inner">
          <div className="sandbox-hero__intro">
            <h1>SHE* – FHIR 病歷授權與領藥驗證</h1>
            <p>
              整合 MyData IAL2、FHIR Verifiable Credential 與選擇性揭露，示範醫院發卡、病患授權、
              藥局 / 研究單位驗證的端到端流程，並支援可遺忘權與 AI Insight。
            </p>
            <ul className="sandbox-hero__list">
              <li>快速切換發卡 / 驗證情境，掌握卡片領取與撤銷狀態。</li>
              <li>支援官方 nonce 查詢，完整記錄 CID 與撤銷端點。</li>
              <li>連動沙盒 API，模擬實際醫療資料授權流程。</li>
            </ul>
          </div>
          <div className="sandbox-hero__config">
            <div className="sandbox-config-card">
              <h2>沙盒連線設定</h2>
              <label htmlFor="base-url">API Base URL</label>
              <input
                id="base-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
              <div className="sandbox-config-grid">
                <div>
                  <label htmlFor="issuer-token-input">發行端 Access Token</label>
                  <input
                    id="issuer-token-input"
                    value={issuerToken}
                    onChange={(event) => setIssuerToken(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="wallet-token-input">錢包 Access Token</label>
                  <input
                    id="wallet-token-input"
                    value={walletToken}
                    onChange={(event) => setWalletToken(event.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="verifier-token-input">驗證端 Access Token</label>
                  <input
                    id="verifier-token-input"
                    value={verifierToken}
                    onChange={(event) => setVerifierToken(event.target.value)}
                  />
                </div>
              </div>
              <div className="sandbox-config-actions">
                <button type="button" className="secondary" onClick={resetSandbox}>
                  重設沙盒資料（清除憑證與 Session）
                </button>
                {resetMessage ? <p className="sandbox-reset-message">{resetMessage}</p> : null}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="sandbox-main">
        <nav className="sandbox-nav" aria-label="沙盒功能頁籤">
          {navItems.map((item) => (
            <Link key={item.to} to={item.to} className={isActivePath(item.to) ? 'active' : ''}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="sandbox-pages">
          <Routes>
            <Route index element={<Navigate to="issuer" replace />} />
            <Route
              path="issuer"
              element={(
                <IssuerPage
                  client={client}
                  issuerToken={issuerToken}
                  walletToken={walletToken}
                  baseUrl={baseUrl}
                />
              )}
            />
            <Route
              path="verifier"
              element={<VerifierPage client={client} verifierToken={verifierToken} />}
            />
            <Route path="stats/*" element={<StatisticsPage />} />
            <Route path="*" element={<Navigate to="issuer" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}
