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
          <p>
            新增「選擇性揭露」提示，讓藥師與病患都知道只會看到
            MedicationDispense 的最小欄位，病歷摘要與精神科紀錄都不會外洩。
          </p>
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
            <img
              src={S3Image1}
              alt="Scene 3"
              style={{ width: "40%", maxWidth: "700px", borderRadius: "8px" }}
            />
          </div>

          <div className="flow-step">
            <img
              src={S3Image}
              alt="Scene 3-1"
              style={{ width: "40%", maxWidth: "700px", borderRadius: "8px" }}
            />
          </div>

          <div className="disclosure-card">
            <div className="disclosure-label">選擇性揭露（藥局取藥）</div>
            <div className="pill pill-green">揭露欄位</div>
            <ul className="disclosure-list">
              <li>藥品名稱／規格（MedicationDispense.medicationCodeableConcept）</li>
              <li>用法與天數（MedicationDispense.dosageInstruction.text）</li>
              <li>過敏史名稱與系統比對結果（AllergyIntolerance.code）</li>
            </ul>
            <div className="pill pill-gray">不揭露</div>
            <ul className="disclosure-list muted">
              <li>完整病歷、精神科筆記</li>
              <li>過往處方與就醫紀錄</li>
              <li>身份證字號、聯絡資訊</li>
            </ul>
          </div>
        </div>
      }
    />
  );
}
