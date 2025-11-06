// frontend/src/demo/pages_bonds/Page2_Issues.jsx
import BondsShell from "../components/BondsShell.jsx";

const cards = [
  {
    title: "醫療院所敏感資料外洩",
    brief: "大型院所遭駭，病歷與診斷紀錄外流，病人隱私暴露於公開網路。",
    link: "https://www.twreporter.org/a/hospitals-sensitive-data-breach",
  },
  {
    title: "診所系統遭釣魚攻擊",
    brief: "醫療資訊系統被植入木馬，處方與掛號個資被竊取販售。",
    link: "https://www.informationsecurity.com.tw/article/article_detail.aspx?aid=11759",
  },
  {
    title: "青少年隱私焦慮",
    brief: "青少年小朱想看身心科，但因擔心隱私洩漏而卻步。",
    link: "#", // 這裡你可以選擇不需要跳轉
  },
];

export default function Page2_SocialIssue() {
  return (
    <BondsShell prev="/" next="/page3">
      <div className="page2">
        <h2 className="hero-title" style={{ color: "#96b5e0ff", fontSize: 40, marginBottom: 12, fontWeight: 800 }}>
          當醫療資料成為負擔
        </h2>
        <p style={{ color: "#bfc9d7ff", fontSize: 18, marginBottom: 28, maxWidth: 760 }}>
          小朱是一名青少年，最近感到情緒低落，想尋求身心科醫師的幫助。然而，因擔心自己的隱私會被洩漏，
          他無法下定決心去就診。該情況並非孤例，許多患者和家屬都面臨相同的隱私擔憂。
          <br />  傳統醫療體系中，病歷一旦進入系統，患者的隱私資料可能會被無意識地暴露於外，這樣的狀況
          讓許多人對於就醫產生了顧慮。小朱的故事只是眾多因隱私問題而遲疑的故事之一。而我們相信，
          MedSSI 系統能夠解決這些隱私問題，讓病歷資料回到病人自己手中。
        </p>
         
        <div className="grid-cards">
          {cards.map((c, i) => (
            <a className="news-card" href={c.link} target="_blank" rel="noreferrer" key={i}>
              <h3>{c.title}</h3>
              <p>{c.brief}</p>
              <span className="more">閱讀更多 →</span>
            </a>
          ))}
        </div>
      </div>
    </BondsShell>
  );
}
