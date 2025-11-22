// src/demo/scenes/Scene04_ResearchRequest.jsx
import { useNavigate } from "../../router.jsx";
import PageShell from "../components/PageShell";
import S4Image from "../assets/doctor.png"; // 引入圖片
import S4Image1 from "../assets/article.png"; // 引入圖片
import S4Image2 from "../assets/qr-code.png"; // 引入圖片

export default function Scene04_ResearchRequest() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="阿翔的青少年憂鬱情況研究"
      subtitle="研究單位僅請求『匿名診斷與檢驗摘要』"
      left={
        <>
          <p>
            阿翔醫師欲參與青少年憂鬱研究，然而青少年身心病歷資訊難以取得，故研究端以
            RESEARCH_ANALYTICS 產生需求 QR。
          </p>
          <ul className="demo-bullets">
            <li>FHIR Path：Condition.code、Observation(A1c).value</li>
            <li>只要匿名摘要，不要原始病歷</li>
            <li>全程可稽核、可到期</li>
          </ul>
          <p>
            為示範最小揭露，需求 QR 旁新增欄位白名單／黑名單，強調僅收集匿名診斷與量表統計，
            不含姓名、病歷號或醫師筆記。
          </p>
          <div className="navs">
            <button className="cta" onClick={() => navigate("scene05")}>病人端授權</button>
          </div>
        </>
      }
      right={
        <div className="research-flow">
          <div className="flow-step">
            <img
              src={S4Image}
              alt="Scene 4"
              style={{ width: "40%", maxWidth: "700px", borderRadius: "8px" }}
            />
          </div>

          <div className="flow-arrow">➜</div>

          <div className="flow-step">
            <img
              src={S4Image1}
              alt="Scene 4"
              style={{ width: "40%", maxWidth: "700px", borderRadius: "8px" }}
            />
          </div>

          <div className="flow-arrow">➜</div>

          <div className="flow-step">
            <img
              src={S4Image2}
              alt="Scene 4"
              style={{ width: "40%", maxWidth: "700px", borderRadius: "8px" }}
            />
          </div>

          <div className="disclosure-card">
            <div className="disclosure-label">選擇性揭露（研究匿名分析）</div>
            <div className="pill pill-green">揭露欄位</div>
            <ul className="disclosure-list">
              <li>診斷代碼 F32（Condition.code）</li>
              <li>PHQ-9 總分（Observation.PHQ9.value）</li>
              <li>授權到期日（Consent.period.end）</li>
            </ul>
            <div className="pill pill-gray">不揭露</div>
            <ul className="disclosure-list muted">
              <li>姓名、身分證、病歷號</li>
              <li>醫師 SOAP 紀錄、處方細節</li>
              <li>完整量表題目、逐題答案</li>
            </ul>
          </div>
        </div>
      }
    />
  );
}
