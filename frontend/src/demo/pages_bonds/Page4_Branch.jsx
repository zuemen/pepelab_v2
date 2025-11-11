// src/demo/pages/pages_bonds/Page4_Scenario.jsx
import { useNavigate } from "../../router.jsx";
import BondsShell from "../components/BondsShell.jsx";
import { useDemo } from "../context";

const TECH_SANDBOX_PATH = "/issuer";

export default function Page4_Scenario() {
  const navigate = useNavigate();
  const { mode } = useDemo();

  const eyebrowLabel = mode === "live" ? "Live 模式" : "Demo 演示";

  const goToSandbox = () => {
    navigate(TECH_SANDBOX_PATH, { replace: false });
  };

  return (
    <BondsShell bg="radial-gradient(circle at top, rgba(41, 82, 132, 0.85), #0b1624 62%)" prev="page3" next="scene01">
      <div className="page4">
        <header className="page4__header">
          <span className="page4__eyebrow">
            <span className={`page4__eyebrow-dot ${mode === "live" ? "live" : "demo"}`} aria-hidden="true" />
            {eyebrowLabel}
          </span>
          <h2 className="page4__title">選擇你的情境</h2>
          <p className="page4__lead">
            走進真實流程：每條支線都帶你看到 MedSSI 如何把「最小必要」落實在領藥、研究與保險授權，
            並同時兼顧病患的自主權與稽核需求。
          </p>
        </header>

        <section className="branch-grid" aria-label="MedSSI 情境列表">
          <article className="branch-card">
            <header className="branch-card__header">
              <span className="badge">Medication Pickup</span>
              <h3>領藥驗證</h3>
            </header>
            <p>
              5 分鐘驗證 QR、處方真偽、過敏對照、同意到期。藥師只看到這次領藥需要的最小資訊。
            </p>
            <footer className="actions">
              <button className="cta" onClick={() => navigate("scene01")}>
                前往領藥情境
              </button>
            </footer>
          </article>

          <article className="branch-card">
            <header className="branch-card__header">
              <span className="badge">Research Authorization</span>
              <h3>研究授權</h3>
            </header>
            <p>
              匿名診斷與檢驗摘要、可撤銷、可稽核、用畢即刪，展現資料減量與研究倫理的最佳實踐。
            </p>
            <footer className="actions">
              <button className="cta" onClick={() => navigate("scene04")}>
                前往研究情境
              </button>
            </footer>
          </article>

          <article className="branch-card">
            <header className="branch-card__header">
              <span className="badge">Insurance Application</span>
              <h3>保險申請</h3>
            </header>
            <p>
              由本人授權的精簡資料，快速完成保險理賠或承保審查，並保留撤回與稽核的透明度。
            </p>
            <footer className="actions">
              <button className="cta" onClick={() => navigate("scene08")}>
                前往保險申請情境
              </button>
            </footer>
          </article>
        </section>

        <footer className="page4__footer">
          <div className="page4__footer-actions">
            <button className="blue" onClick={() => navigate(".")}>
              回到開場
            </button>
            <button className="gray" onClick={goToSandbox}>
              查看技術流程
            </button>
          </div>
          <p className="page4__hint">
            小提示：技術流程會切換到 Sandbox，直接操作發卡、驗證與統計頁面。
          </p>
        </footer>
      </div>
    </BondsShell>
  );
}
