import PageShell from "../components/PageShell";
import { useNavigate } from "react-router-dom";

export default function Scene03_MethodMap() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="Scene 03｜我們的方法:從搬資料改為授權＋驗證"
      subtitle="Issuer → Wallet → Verifier → AI Insight"
      left={
        
          <ul className="demo-bullets">
            <li>Issuer → Wallet → Verifier → AI Insight</li>
            <li>三分流：Medical Record／Medication Pickup／Research Analytics</li>
            <li>FHIR Bundle、FHIR path 選擇性揭露、5 分鐘 QR、IAL2／IAL3、/forget 可遺忘權</li>
          </ul>

          
      }
      right={
        <div className="flow-clean">
          <div className="role">Issuer</div>
          <div className="arrow">→</div>
          <div className="role">Wallet</div>
          <div className="arrow">→</div>
          <div className="role">Verifier</div>
          <div className="arrow">→</div>
          <div className="role">AI</div>
          <div className="tag good">只揭露最小必要欄位</div>
        
        <div className="navs">
            <button className="ghost" onClick={() => navigate("/scene02")}>
              ← 上一頁：體系問題
            </button>
            <button className="cta" onClick={() => navigate("/scene04")}>
              下一步：合規與標準 →
            </button>
          </div>
        </div>
      }
    />
  );
}
