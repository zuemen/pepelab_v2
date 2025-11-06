import { useDemo } from "../context";

export default function TopBar({ title, onResetClick }) {
  const {
    baseUrl, setBaseUrl,
    issuerToken, setIssuerToken,
    walletToken, setWalletToken,
    verifierToken, setVerifierToken,
    mode, setMode,
    scope, setScope,
    persist
  } = useDemo();

  return (
    <header className="demo-topbar">
      <div className="left">
        <strong>MedSSI Demo</strong>
        <span className="sep">•</span>
        <span aria-live="polite">{title}</span>
      </div>
      <div className="center">
        <div className="tabs" role="tablist" aria-label="流程分流">
          {["MEDICAL_RECORD","MEDICATION_PICKUP","RESEARCH_ANALYTICS"].map(s => (
            <button
              key={s}
              role="tab"
              aria-selected={scope === s}
              className={scope === s ? "tab active" : "tab"}
              onClick={() => setScope(s)}
              title={s}
            >
              {s.replace("_"," ").replace("_"," ")}
            </button>
          ))}
        </div>
      </div>
      <div className="right">
        <input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} title="API Base URL"/>
        <input value={issuerToken}  onChange={e=>setIssuerToken(e.target.value)}  placeholder="Issuer Token"/>
        <input value={walletToken}  onChange={e=>setWalletToken(e.target.value)}  placeholder="Wallet Token"/>
        <input value={verifierToken}onChange={e=>setVerifierToken(e.target.value)}placeholder="Verifier Token"/>
        <button className={mode==="live"?"primary":""} onClick={()=>{ setMode(m=>m==="live"?"preview":"live"); persist(); }}>
          {mode === "live" ? "Live 中" : "Start Demo"}
        </button>
        <button className="secondary" onClick={onResetClick}>Reset</button>
      </div>
    </header>
  );
}
