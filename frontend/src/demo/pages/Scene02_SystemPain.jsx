import PageShell from "../components/PageShell";

export default function Scene02_SystemPain() {
  return (
    <PageShell
      title="問題不是個案，是結構"
      left={
        <div className="grid3">
          <div className="pill">
            <h3>資料流通</h3>
            <p>跨院病歷/領藥資料割裂、非即時</p>
          </div>
          <div className="pill">
            <h3>合規稽核</h3>
            <p>一次性授權、最小必要、可撤銷/可遺忘</p>
          </div>
          <div className="pill">
            <h3>使用者體驗</h3>
            <p>長者友善、家屬陪伴、可示範</p>
          </div>
        </div>
      }
      right={
        <div className="flow-chaos">
          <span className="node">院A</span>
          <span className="node">院B</span>
          <span className="node">藥局</span>
          <span className="node">研究</span>
          <div className="arrows">↔︎ ↗︎ ↘︎ ↩︎</div>
          <div className="tag bad">複製傳遞 / 過度揭露</div>
        </div>
      }
    />
  );
}
