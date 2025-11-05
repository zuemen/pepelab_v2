// frontend/src/demo/pages_bonds/Page4_Branch.jsx
import BondsShell from "../components/BondsShell.jsx";
import { useNavigate } from "react-router-dom";

export default function Page4_Branch() {
  const nav = useNavigate();
  return (
    <BondsShell prev="/page3" next="/scene">
      <h2 style={{ fontSize: 40, marginBottom: 12, fontWeight: 800 }}>選擇你的情境</h2>
      <p style={{ color: "#94a3b8", marginBottom: 28 }}>
        走進真實流程：兩個分支示範 MedSSI 如何把「最小必要」落實到每一次分享。
      </p>

      <div className="branch-grid">
        <div className="branch-card">
          <h3>領藥驗證（Medication Pickup）</h3>
          <p>5 分鐘驗證 QR、處方真偽、過敏對照、同意到期。只看「當次處方」。</p>
          <button className="cta" onClick={() => nav("/scene/scene07")}>前往領藥情境</button>
        </div>

        <div className="branch-card">
          <h3>研究授權（Research Authorization）</h3>
          <p>匿名診斷與檢驗摘要、可撤銷、可稽核、用畢即刪。不複製完整病歷。</p>
          <button className="cta" onClick={() => nav("/scene/scene06")}>前往研究情境</button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <button className="ghost" onClick={() => nav("/scene")}>看全技術流程（Scene01–07）</button>
      </div>
    </BondsShell>
  );
}
