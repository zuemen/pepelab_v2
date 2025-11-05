import PageShell from "../components/PageShell.jsx";
import { useDemo } from "../context.jsx";
import { useNavigate } from "react-router-dom";

export default function Scene05_Issuer() {
  const { scope, baseUrl, issuerToken, mode } = useDemo();
  const navigate = useNavigate(); // ✅ 加上這行

  return (
    <PageShell
      title="Scene 05｜發卡端（預覽）"
      left={
        <>
          <ul className="bullets">
            <li>Scope：{scope}</li>
            <li>Base URL：{baseUrl}</li>
            <li>Issuer Token：{issuerToken.slice(0, 4)}•••</li>
            <li>模式：{mode}</li>
          </ul>

          {/* ✅ 正確關閉按鈕標籤 */}
          <div className="navs">
            <button className="ghost" onClick={() => navigate("/scene04")}>
              ← 上一頁：合規與標準
            </button>
            <button className="cta" onClick={() => navigate("/scene06")}>
              下一步：病人錢包 →
            </button>
          </div>
        </>
      }
      right={
        <div className="mock">
          <div className="card">這裡放 QR 預覽（之後串 API）</div>
        </div>
      }
    />
  );
}
