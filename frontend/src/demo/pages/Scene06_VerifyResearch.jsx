// src/demo/scenes/Scene06_VerifyResearch.jsx
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";

export default function Scene06_VerifyResearch() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="研究驗章與聚合：數據成為洞見"
      subtitle="通過驗章 → 匿名入庫 → 統計更新"
      left={
        <>
          <p>研究單位驗章成功，匯入匿名摘要，統計模型更新。</p>
          <ul className="demo-bullets">
            <li>樣本 +1：A1c 平均 6.7%</li>
            <li>不可逆去識別，無法還原個人</li>
            <li>個資法 §19 目的限定、用畢即刪</li>
          </ul>
          <div className="navs">
            <button className="ghost" onClick={() => navigate("/scene05")}>← 上一幕</button>
            <button className="cta" onClick={() => navigate("/scene07")}>前往稽核與信任</button>
          </div>
        </>
      }
      right={
        <div className="mock">
          <div className="card">樣本數：1,248 → 1,249</div>
          <div className="card">A1c 平均：6.72% → 6.70%</div>
          <div className="tag good">匿名入庫</div>
        </div>
      }
    />
  );
}
