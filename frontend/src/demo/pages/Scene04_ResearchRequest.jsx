// src/demo/scenes/Scene04_ResearchRequest.jsx
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";

export default function Scene04_ResearchRequest() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="研究申請：小翔的糖尿病研究"
      subtitle="研究單位僅請求『匿名診斷與檢驗摘要』"
      left={
        <>
          <p>小翔參與糖尿病研究，研究端以 RESEARCH_ANALYTICS 產生需求 QR。</p>
          <ul className="demo-bullets">
            <li>FHIR Path：Condition.code、Observation(A1c).value</li>
            <li>只要匿名摘要，不要原始病歷</li>
            <li>全程可稽核、可到期</li>
          </ul>
          <div className="navs">
            <button className="cta" onClick={() => navigate("/scene05")}>病人端授權</button>
          </div>
        </>
      }
      right={
        <div className="qr-preview">
          <div className="qr-box">Research QR（需求範圍）</div>
          <div className="tag good">Scope: RESEARCH_ANALYTICS</div>
          <div className="tag good">Minimal Fields</div>
        </div>
      }
    />
  );
}
