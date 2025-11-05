import PageShell from "../components/PageShell";
import { useDemo } from "../context";

export default function Scene07_Verifier() {
  const { scope, mode } = useDemo();
  return (
    <PageShell
      title="驗證端：最小必要驗證 + AI Insight"
      subtitle="產驗證 QR → 提交 VP → 顯示驗章結果與 Insight"
      left={
        <ol className="demo-steps">
          <li>指定 Scope & IAL，產驗證 QR</li>
          <li>提交 VP（最小欄位）</li>
          <li>結果：{scope==="MEDICATION_PICKUP" ? "藥品/天數/過敏對照" : "匿名診斷摘要"}</li>
        </ol>
      }
      right={
        <div className="verify-preview">
          <div className="result-card">
            <div className="line"><strong>藥品：</strong> Omeprazole 20mg</div>
            <div className="line"><strong>天數：</strong> 28</div>
            <div className="line ok"><strong>過敏對照：</strong> 無衝突</div>
            <div className="line"><strong>同意到期：</strong> 2025-12-31</div>
          </div>
          <div className="insight">AI Insight：胃炎趨勢下降，續領提醒 D-3</div>
          <div className={`hint ${mode==="live"?"":"muted"}`}>Live 模式才會真的驗章</div>
        </div>
      }
    />
  );
}
