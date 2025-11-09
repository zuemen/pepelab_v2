// src/demo/scenes/Scene07_Audit.jsx
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";

export default function Scene07_Audit() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="可追溯的信任：稽核與留痕"
      subtitle="每一次分享都留下可驗證的證據，但不保留病歷副本"
      left={
        <>
          <p>稽核系統顯示兩條鏈路的紀錄：</p>
          <ul className="demo-bullets">
            <li>領藥：驗章通過、IAL2、時間戳</li>
            <li>研究：匿名驗證、ZKP、統計入庫</li>
          </ul>
          <p>信任，不只是技術；是讓病人敢於分享的力量。</p>
          <div className="navs">
            <button className="cta" onClick={() => navigate("/page4")}>回到情境選擇</button>
          </div>
        </>
      }
     
    right={
        <div className="verify-preview">
          <div className="result-card">
            <div className="line"><strong>[領藥] 2025-11-05 10:32 IAL2 ✅</strong></div>
            <div className="line"><strong>[研究] 2025-11-05 10:41 ZKP/匿名 ✅</strong> </div>
         <div className="tag good">不可竄改的驗證紀錄</div>

          </div>
        </div>
      }
    />
  );
}
