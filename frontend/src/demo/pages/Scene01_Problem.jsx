import PageShell from "../components/PageShell.jsx";

export default function Scene01_Problem() {
  const goNext = () => { location.hash = "#p1"; }; // 跳到第 2 頁（index 從 0 開始）

  return (
    <PageShell
      title="Scene 01｜沒有我們系統的一天"
      subtitle="只為了領藥，我卻得攤開整份病歷"
      left={
        <>
          <ul className="bullets">
            <li>跨院資料分散，臨櫃來回電話與紙本核對</li>
            <li>過度揭露：只要領藥，卻被看光一整份病歷</li>
            <li>長者操作不便，家屬也難以示範與確認</li>
          </ul>
          <button className="cta" onClick={goNext}>
            下一步：如果只揭露「最小必要」？
          </button>
        </>
      }
      right={
        <div className="mock">
          <div className="card warn">證件核對</div>
          <div className="card warn">紙本處方</div>
          <div className="card warn">藥師電話確認</div>
          <span className="tag bad">時間成本↑ / 隱私風險↑</span>
        </div>
      }
    />
  );
}
