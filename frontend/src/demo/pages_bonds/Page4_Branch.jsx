// src/demo/pages/pages_bonds/Page4_Scenario.jsx
import { useNavigate } from "../../router.jsx";
import BondsShell from "../components/BondsShell.jsx";
import { useDemo } from "../context";
export default function Page4_Scenario() {
  const navigate = useNavigate();
  const { scope, mode } = useDemo();

  return (
    <BondsShell prev="page3" next="scene01">
      {/* 一定要有 page4 這個 wrapper，CSS 用它當作用域 */}
      <div className="page4">
        <h2 className="hero-title" style={{ color: "#7397e4ff",
                fontSize: 40,
                fontWeight: 800,marginBottom: 8 }}>選擇你的情境</h2>
        <p className="lead" style={{ marginBottom: 20 }}>
          走進真實流程：兩個分支示範 MedSSI 如何把「最小必要」落實到每一次分享。
        </p>

    <div className="branch-grid">
  <div className="branch-card">
    <span className="badge">Medication Pickup</span>
    <h3>領藥驗證</h3>
    <p>
      5 分鐘驗證 QR、處方真偽、過敏對照、同意到期。只看「當次處方」。
    </p>
    <div className="actions">
      <button className="cta" onClick={() => navigate("scene01")}>
        前往領藥情境
      </button>
    </div>
  </div>

  <div className="branch-card">
    <span className="badge">Research Authorization</span>
    <h3>研究授權</h3>
    <p>
      匿名診斷與檢驗摘要、可撤銷、可稽核、用畢即刪。不複製完整病歷。
    </p>
    <div className="actions">
      <button className="cta" onClick={() => navigate("scene04")}>
        前往研究情境
      </button>
    </div>
  </div>

  {/* 新增保險申請情境卡片 */}
  <div className="branch-card">
    <span className="badge">Insurance Application</span>
    <h3>保險申請</h3>
    <p>
      用戶可通過 MedSSI 驗證身份，快速提供必要資料，處理保險理賠申請，並確保隱私保護。
    </p>
    <div className="actions">
      <button className="cta" onClick={() => navigate("scene08")}>
        前往保險申請情境
      </button>
    </div>
  </div>
</div>


        {/* 技術流程入口（可選） */}
        <div className="btn-row" style={{ marginTop: 28 }}>
          <button className="blue" onClick={() => navigate(".")}>
            回首頁
          </button>
           <button
            className="gray"
            onClick={() => (window.location.href = "http://localhost:5173/")}
          >
            查看技術流程
          </button>
        </div>
      </div>
    </BondsShell>
  );
}
