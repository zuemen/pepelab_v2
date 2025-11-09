import { useNavigate } from "../../router.jsx";
import BondsShell from "../components/BondsShell.jsx";
import { useDemo } from "../context.jsx";

export default function Page3_Solution() {
  const navigate = useNavigate();
  const { scope, mode } = useDemo();

  return (
    <BondsShell prev="page2" next="page4">
      <div className="page3">
        {/* 白底說明卡 */}
        <div className="white-card">
          <div className="hero-card">
            <h2
              className="hero-title"
              style={{
                color: "#2563eb",
                fontSize: 40,
                marginBottom: 12,
                fontWeight: 800,
              }}
            >
              從「搬資料」改為「授權＋驗證」
            </h2>

            <div className="hero-body">
              <p className="lead">
                想像阿朱到藥局，只需出示一個「健康通行憑證」：藥師即時驗證身份與當次處方，
                而不必翻閱整份病歷。MedSSI 以 FHIR Bundle + Verifiable
                Credential/Presentation，搭配 FHIR Path 的選擇性揭露，讓每一次分享都遵守
                「最小必要」與「一次性授權」。
              </p>

              <ul className="bullets">
                <li>Issuer（醫院）發卡：病歷/處方封裝為 VC，私鑰簽章</li>
                <li>Wallet（病人）自主管理：可選擇性揭露、可撤銷、可遺忘</li>
                <li>Verifier（藥局/研究）驗證：5 分鐘 QR、有時效的驗證 Session</li>
                <li>合規對齊：電子簽章法、醫療法 §72、個資法、IAL2/IAL3</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 藍框流程卡 */}
        <div className="flow-card">
          <div className="flow">
            <div className="role">Hospital</div>
            <div className="arrow">→</div>
            <div className="role">Wallet</div>
            <div className="arrow">→</div>
            <div className="role">Pharmacy / Research</div>
            <div className="arrow">⇢</div>
            <div className="role">AI Insight</div>
          </div>
        </div>

        {/* 操作按鈕 */}
        <div className="btn-row">
          
          <button className="cta" onClick={() => navigate("page4")}>
            進入情境
          </button>
        </div>
      </div>
    </BondsShell>
  );
}
