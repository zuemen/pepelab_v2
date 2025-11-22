// src/demo/scenes/Scene08_Insurance.jsx
import { useNavigate } from "../../router.jsx";
import PageShell from "../components/PageShell";

export default function Scene08_Insurance() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="保險申請：最小必要揭露"
      subtitle="小朱的青少年身心科就診 — 只分享理賠所需資訊"
      left={
        <>
          <p>
            小朱要申請門診理賠，但不想交出完整病歷。透過 MedSSI，他只授權「理賠必需欄位」：
            診斷碼、就診期間、醫師簽章與費用摘要；不揭露量表細節與病程紀錄。
          </p>
          <ul className="demo-bullets">
            <li>揭露項目（最小必要）：診斷碼 F32.1、就診日期、費用總額／收據號、主治醫師簽章</li>
            <li>不揭露：完整病歷、醫囑全文、PHQ-9 問題與逐題分數</li>
            <li>權限控管：一次性授權、可稽核、用畢即刪（目的限定）</li>
          </ul>
          <p>
            新增選擇性揭露卡片，讓理賠人員清楚看到僅能驗證必要欄位，避免超出目的的資料調閱。
          </p>
          <div className="navs">
            <button className="cta" onClick={() => navigate("page4")}>
              送出理賠 VP
            </button>
          </div>
        </>
      }
      right={
        <div className="verify-preview">
          <div className="result-card">
            <div className="line"><strong>保單號：</strong> ****-****-12A9（遮罩）</div>
            <div className="line"><strong>診斷碼：</strong> F32.1（中度鬱症）</div>
            <div className="line"><strong>就診期間：</strong> 2025-11-03</div>
            <div className="line"><strong>費用摘要：</strong> 門診費用 NT$1,280</div>
            <div className="line"><strong>收據號：</strong> RX-2573-88</div>
            <div className="line ok"><strong>醫院簽章：</strong> 驗章通過（e-Seal / IAL2）</div>
          </div>
          <div className="insight">選擇性揭露：僅供理賠核驗，不包含病程與量表細節</div>
          <div className="tag good" style={{ display: "inline-block", marginTop: 8 }}>
            用畢即刪・可稽核
          </div>
          <div className="disclosure-card" style={{ marginTop: 16 }}>
            <div className="disclosure-label">選擇性揭露（理賠必要欄位）</div>
            <div className="pill pill-green">揭露欄位</div>
            <ul className="disclosure-list">
              <li>理賠診斷碼（Condition.code）</li>
              <li>就診日期與院所（Encounter.period）</li>
              <li>費用總額與收據號（Claim.total + receipt number）</li>
            </ul>
            <div className="pill pill-gray">不揭露</div>
            <ul className="disclosure-list muted">
              <li>完整 SOAP 記錄、影像檢查</li>
              <li>心理測驗逐題內容</li>
              <li>家屬聯絡資料</li>
            </ul>
          </div>
        </div>
      }
    />
  );
}
