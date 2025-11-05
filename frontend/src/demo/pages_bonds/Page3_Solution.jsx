// frontend/src/demo/pages_bonds/Page3_Solution.jsx
import BondsShell from "../components/BondsShell.jsx";
import { useNavigate } from "react-router-dom";

export default function Page3_Solution() {
  const nav = useNavigate();
  return (
    <BondsShell prev="/page2" next="/page4">
      <section>
        <h2 style={{ fontSize: 40, marginBottom: 12, fontWeight: 800 }}>
          從「搬資料」改為「授權＋驗證」
        </h2>
        <p style={{ color: "#94a3b8", marginBottom: 20, maxWidth: 760 }}>
          想像阿銀到藥局，只需出示一個「健康通行憑證」：藥師即時驗證身份與當次處方，
          而不必翻閱整份病歷。MedSSI 以 FHIR Bundle + Verifiable Credential/Presentation，
          以及 FHIR Path 的選擇性揭露，讓每一次分享都遵守「最小必要」與「一次性授權」。
        </p>

        <ul className="bullets">
          <li>Issuer（醫院）發卡：病歷/處方封裝為 VC，私鑰簽章</li>
          <li>Wallet（病人）自主管理：可選擇性揭露、可撤銷、可遺忘</li>
          <li>Verifier（藥局/研究）驗證：5 分鐘 QR、有時效的驗證 Session</li>
          <li>合規對齊：電子簽章法、醫療法 §72、個資法、IAL2/IAL3</li>
        </ul>
      </section>

      <section className="flow">
        <div className="role">Hospital</div><div className="arrow">→</div>
        <div className="role">Wallet</div><div className="arrow">→</div>
        <div className="role">Pharmacy / Research</div><div className="arrow">→</div>
        <div className="role">AI Insight</div>
      </section>

      <div style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button className="ghost" onClick={() => nav("/scene")}>看技術流程（Scene）</button>
        <button className="cta" onClick={() => nav("/page4")}>進入情境</button>
      </div>
    </BondsShell>
  );
}
