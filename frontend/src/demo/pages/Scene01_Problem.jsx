import PageShell from "../components/PageShell";

export default function Scene01_Problem() {
  return (
    <PageShell
      title="少了本系統的一天"
      subtitle="只為了領藥，我卻得攤開整份病歷"
      left={
        <ul className="demo-bullets">
          <li>跨院資料分散，臨櫃來回電話與紙本核對</li>
          <li>過度揭露：只要領藥，卻被看光一整份病歷</li>
          <li>長者操作不便，家屬也難以示範與確認</li>
        </ul>
    
      }
      right={
        <div className="mock-cards">
          <div className="card warn">證件核對</div>
          <div className="card warn">紙本處方</div>
          <div className="card warn">藥師電話確認</div>
          <div className="tag bad">時間成本↑ / 隱私風險↑</div>
        </div>
      }
    />
  );
}
