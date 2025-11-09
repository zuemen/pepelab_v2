// src/demo/scenes/Scene05_WalletConsent.jsx
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";

export default function Scene05_WalletConsent() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="選擇性揭露：小朱在錢包確認"
      subtitle="匿名摘要、可撤銷、可到期"
      left={
        <>
          <p>小朱收到授權請求，清楚看到揭露內容與權限：</p>
          <ul className="demo-bullets">
            <li>診斷碼：F32（對應 ICD-10 的憂鬱症代碼）</li>
            <li>檢驗摘要：心理量表 PHQ-9</li>
            <li>到期日：2026-01-31，可隨時撤銷</li>
          </ul>
          <div className="navs">
            <button className="ghost" onClick={() => navigate("/scene04")}>← 上一幕</button>
            <button className="cta" onClick={() => navigate("/scene06")}>同意並送出 VP</button>
          </div>
        </>
      }
        right={
        <div className="verify-preview">
          <div className="result-card">
            <div className="line"><strong>F32</strong>（憂鬱症發作）</div>
            <div className="line"><strong>PHQ-9：</strong> 17 分（中度）</div>
         <div className="tag good">匿名化・ZKP 驗證</div>

          </div>
        </div>
      }
    />
  );
}
