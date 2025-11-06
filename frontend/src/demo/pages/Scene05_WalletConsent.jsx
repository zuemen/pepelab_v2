// src/demo/scenes/Scene05_WalletConsent.jsx
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";

export default function Scene05_WalletConsent() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="選擇性揭露：阿朱在錢包確認"
      subtitle="匿名摘要、可撤銷、可到期"
      left={
        <>
          <p>阿朱收到授權請求，清楚看到揭露內容與權限：</p>
          <ul className="demo-bullets">
            <li>診斷碼：E11（糖尿病）</li>
            <li>檢驗摘要：A1c 6.7%</li>
            <li>到期日：2026-01-31，可隨時撤銷</li>
          </ul>
          <div className="navs">
            <button className="ghost" onClick={() => navigate("/scene04")}>← 上一幕</button>
            <button className="cta" onClick={() => navigate("/scene06")}>同意並送出 VP</button>
          </div>
        </>
      }
      right={
        <div className="wallet-preview">
          <div className="field"><strong>E11</strong>（糖尿病）</div>
          <div className="field"><strong>A1c：</strong> 6.7%</div>
          <div className="tag good">匿名化・ZKP</div>
        </div>
      }
    />
  );
}
