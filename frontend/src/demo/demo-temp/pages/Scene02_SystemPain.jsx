import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";

export default function Scene02_SystemPain() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="Scene 02｜台灣醫療體系的結構性問題"
      subtitle="我們要的是『最小必要揭露 + 一次性授權 + 稽核留痕』，不是把資料複製到處跑"
      left={
        <>
          <div className="grid3">
            <div className="pill">
              <h3>資料流通</h3>
              <p>跨院病歷／領藥資料割裂、非即時</p>
            </div>
            <div className="pill">
              <h3>合規稽核</h3>
              <p>一次性授權、最小必要、可撤銷／可遺忘</p>
            </div>
            <div className="pill">
              <h3>使用者體驗</h3>
              <p>長者友善、家屬陪伴、可示範</p>
            </div>
          </div>

          {/* 路由導覽按鈕 */}
          <div className="navs">
            <button className="ghost" onClick={() => navigate("/scene01")}>
              ← 上一頁：沒有我們的世界
            </button>
            <button className="cta" onClick={() => navigate("/scene03")}>
              下一步：我們的方法 →
            </button>
          </div>
        </>
      }
      right={
        <div className="flow-chaos">
          <span className="node">院A</span>
          <span className="node">院B</span>
          <span className="node">藥局</span>
          <span className="node">研究</span>
          <div className="arrows">↔︎ ↗︎ ↘︎ ↩︎</div>
          <div className="tag bad">複製傳遞／過度揭露／難以稽核</div>
        </div>
      }
    />
  );
}
