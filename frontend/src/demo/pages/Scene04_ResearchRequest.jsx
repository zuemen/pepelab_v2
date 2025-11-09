// src/demo/scenes/Scene04_ResearchRequest.jsx
import { useNavigate } from "../../router.jsx";
import PageShell from "../components/PageShell";
import vpImage from "../assets/vp.png"; // 引入圖片

export default function Scene04_ResearchRequest() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="阿翔的青少年憂鬱情況研究"
      subtitle="研究單位僅請求『匿名診斷與檢驗摘要』"
      left={
        <>
          <p>阿翔醫師欲參與青少年憂鬱研究，然而青少年身心病歷資訊難以取得，故研究端以 RESEARCH_ANALYTICS 產生需求 QR。</p>
          <ul className="demo-bullets">
            <li>FHIR Path：Condition.code、Observation(A1c).value</li>
            <li>只要匿名摘要，不要原始病歷</li>
            <li>全程可稽核、可到期</li>
          </ul>
          <div className="navs">
            <button className="cta" onClick={() => navigate("scene05")}>
              病人端授權
            </button>
          </div>
        </>
      }
      right={
       <div className="mock">
               <div className="card">
                 <h3>ResearchVP</h3>
                 <img src={vpImage} alt="QR Code" style={{ width: "100%", maxWidth: "600px", borderRadius: "12px" }} />
                 
               </div>
             </div>
      }
    />
  );
}
