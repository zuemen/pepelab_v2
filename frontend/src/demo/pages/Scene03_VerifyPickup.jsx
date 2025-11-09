// src/demo/scenes/Scene03_VerifyPickup.jsx
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useDemo } from "../context";

export default function Scene03_VerifyPickup() {
  const navigate = useNavigate();
  const { mode } = useDemo();

  return (
    <PageShell
      title="藥師驗章：只看『當次處方』"
      subtitle="免翻病歷、不留副本、完成領藥"
      left={
        <>
          <p>藥師掃描後，只看到這次領藥所需資訊：</p>
          <ul className="demo-bullets">
            <li>處方代碼、劑量/天數</li>
            <li>過敏史（無衝突）</li>
            <li>同意到期日：2025-12-31</li>
          </ul>
          <p>不需打電話、不需複製病歷，藥品立即核發。</p>
          <div className="navs">
            <button className="ghost" onClick={() => navigate("/scene02")}>← 上一幕</button>
            <button className="cta" onClick={() => navigate("/scene04")}>切到研究情境（小翔）</button>
          </div>
        </>
      }
   right={
  <div className="verify-preview">
    <div className="result-card">
      <div className="line"><strong>藥品：</strong> Omeprazole 20mg</div>
      <div className="line"><strong>天數：</strong> 28</div>
      <div className="line ok"><strong>過敏對照：</strong> 無衝突</div>
      <div className="line"><strong>同意到期：</strong> 2025-12-31</div>
    </div>
    <div className="insight">
      <strong>AI Insight：</strong>D-3 續領提醒
    </div>
    <div className={`hint ${mode === "live" ? "" : "muted"}`}>
      Live 模式才會真的驗章
    </div>
  </div>
}
/>
  );
}
