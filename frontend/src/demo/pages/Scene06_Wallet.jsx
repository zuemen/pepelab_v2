import PageShell from "../components/PageShell";
import { useDemo } from "../context";
import { useNavigate } from "react-router-dom";

export default function Scene06_Wallet() {
  const { mode } = useDemo();
  const navigate = useNavigate();
  return (
    <PageShell
      title="錢包：只存我同意的"
      subtitle="掃 VC → 取 nonce → 選擇性揭露 → ACCEPT；可一鍵 /forget"
      left={
        <><ol className="demo-steps">
          <li>輸入 transaction_id 取得 nonce</li>
          <li>查看可揭露欄位清單</li>
          <li>ACCEPT 儲存 VC</li>
          <li>（必要時）/forget 清除</li>
        </ol><div className="navs">
            <button className="ghost" onClick={() => navigate("/scene05")}>
              ← 上一頁：發卡端（預覽）
            </button>
            <button className="cta" onClick={() => navigate("/scene07")}>
                下一步：驗證端 →
            </button>
          </div></>
          
      }
      right={
        <div className="wallet-preview">
          <div className="field-list">
            <div className="field">Condition.code</div>
            <div className="field">MedicationDispense.code</div>
            <div className="field">MedicationDispense.daysSupply</div>
          </div>
          <div className={`btn-row ${mode==="live"?"":"disabled"}`}>Live 才能操作</div>
        </div>
      }
    />
  );
}
