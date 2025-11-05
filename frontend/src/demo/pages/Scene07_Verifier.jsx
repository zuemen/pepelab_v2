import PageShell from "../components/PageShell";
import { useDemo } from "../context.jsx";
import { useNavigate } from "react-router-dom";

export default function Scene07_Verifier() {
  const { scope, mode } = useDemo();
  const navigate = useNavigate();

  return (
    <PageShell
      title="Scene 07｜驗證端：最小必要驗證 + AI Insight"
      subtitle="產驗證 QR → 提交 VP → 顯示驗章結果與 Insight"
      left={
        <>
          <ol className="demo-steps">
            <li>指定 Scope & IAL，產驗證 QR</li>
            <li>提交 VP（最小欄位）</li>
            <li>
              結果：
              {scope === "MEDICATION_PICKUP"
                ? "藥品／天數／過敏對照"
                : "匿名診斷摘要"}
            </li>
          </ol>

          <div className="navs">
            <button className="ghost" onClick={() => navigate("/scene06")}>
              ← 上一頁：病人錢包（預覽）
            </button>
            
          </div>
        </>
      }
      right={
        <div className="verify-preview">
          <div className="result-card">
            <div className="line">
              <strong>藥品：</strong> Omeprazole 20mg
            </div>
            <div className="line">
              <strong>天數：</strong> 28
            </div>
            <div className="line ok">
              <strong>過敏對照：</strong> 無衝突
            </div>
            <div className="line">
              <strong>同意到期：</strong> 2025-12-31
            </div>
          </div>

          <div className="insight">
            AI Insight：胃炎趨勢下降，續領提醒 D-3
          </div>

          <div className={`hint ${mode === "live" ? "" : "muted"}`}>
            {mode === "live"
              ? "Live 模式：正在模擬真實驗章流程"
              : "目前為 Preview 模式（不執行驗章）"}
          </div>
          <button className="cta" onClick={() => navigate("/scene01")}>
              返回首頁
            </button>
        </div>
      }
    />
  );
}
