// src/demo/scenes/Scene03_VerifyPickup.jsx
import { useNavigate } from "../../router.jsx";
import PageShell from "../components/PageShell";
import { useDemo } from "../context";
import S3Image from "../assets/scan.png"; // 引入圖片
import S3Image1 from "../assets/pharmacy.png"; // 引入圖片
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
            <button className="ghost" onClick={() => navigate("scene02")}>
              ← 上一幕
            </button>
            <button className="cta" onClick={() => navigate("scene04")}>
              切到研究情境（小翔）
            </button>
          </div>
        </>
      }
   right={
  <div className="mock">
      <div className="flow-step">
         <h3>Verify Pickup</h3>
         <img src={S3Image1} alt="Scene 3" style={{ width: "40%", maxWidth: "700px", borderRadius: "8px" }} />
 </div>
           
           <div className="flow-step">
          <img src={S3Image} alt="Scene 3-1" style={{ width: "40%", maxWidth: "700px", borderRadius: "8px" }} />
       </div>
         

    </div>
}
/>
  );
}
