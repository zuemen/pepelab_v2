// src/demo/scenes/Scene06_VerifyResearch.jsx
import { useNavigate } from "../../router.jsx";
import PageShell from "../components/PageShell";

export default function Scene06_VerifyResearch() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="研究驗章與聚合：數據成為洞見"
      subtitle="通過驗章 → 匿名入庫 → 統計更新"
     left={
  <>
    <p>研究單位驗章成功，系統匯入匿名化的心理摘要資料，研究模型已自動更新。</p>
    <ul className="demo-bullets">
      <li>樣本 +1：PHQ-9 平均分數 15.2 → 15.1</li>
      <li>所有資料均經去識別化處理，無法追溯個人身份</li>
      <li>依個資法 §19 規定，僅限本次研究用途，用畢即刪</li>
    </ul>
    <div className="navs">
      <button className="ghost" onClick={() => navigate("scene05")}>
        ← 上一幕
      </button>
      <button className="cta" onClick={() => navigate("scene07")}>
        前往稽核與信任
      </button>
    </div>
  </>


}
right={
        <div className="verify-preview">
          <div className="result-card">
            <div className="line"><strong>樣本數：312 → 313</strong></div>
            <div className="line"><strong>PHQ-9 平均分：15.2 → 15.1</strong> </div>
         <div className="tag good">匿名化・ZKP 驗證</div>

          </div>
        </div>
      }
 />
  );
}