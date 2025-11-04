import PageShell from "../components/PageShell";

export default function Scene03_MethodMap() {
  return (
    <PageShell
      title="從搬資料改為授權＋驗證"
      left={
        <ul className="demo-bullets">
          <li>Issuer → Wallet → Verifier → AI Insight</li>
          <li>三分流：Medical Record / Medication Pickup / Research Analytics</li>
          <li>FHIR Bundle、FHIR path 選擇性揭露、5 分鐘 QR、IAL2/IAL3、/forget</li>
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
        </div>
      }
    />
  );
}
