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
    title: "國際勒索軟體癱瘓醫療體系",
    brief: "關鍵系統停擺，急診轉院、排程延宕，醫療安全面臨衝擊。",
    link: "https://tw.news.yahoo.com/%E7%8D%A8%E5%AE%B6-%E9%A6%AC%E5%81%95%E9%86%AB%E9%99%A2%E9%81%AD%E5%9C%8B%E9%9A%9B%E9%A7%AD%E5%AE%A2%E6%94%BB%E6%93%8A-%E7%B3%BB%E7%B5%B1-%E5%BA%A6%E7%99%B1%E7%98%93-%E5%8B%92%E7%B4%A2%E9%89%85%E6%AC%BE-105000656.html?guccounter=1&guce_referrer=aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS8&guce_referrer_sig=AQAAABjzxBCcztU7LfhXjYzAXF8wIF78KHdoeSXIYhRSaFWQaRm9z1rS2ond8He-JB23rwla29DQ3WABfWNgjQtBHT3dLv0FFkffE8zApM8t7iudg1D4rIv1xWPN9KJ0Ii2nKcizV1nD8YToDBU5ACtGnE8x6MKCKnzQSt36Hm6XecEa",
  },
];

export default function Page2_Issues() {
  return (
    <BondsShell prev="/" next="/page3">
      <h2 style={{ color: "#96b5e0ff",fontSize: 40, marginBottom: 12, fontWeight: 800 }}>
        醫療資料在流動，但信任卻在流失
      </h2>
      <p style={{ color: "#94a3b8", marginBottom: 28, maxWidth: 760 }}>
        近年醫療資安事件頻傳：病歷、處方、檢驗報告等高度敏感資訊，在繁雜的流轉中屢屢外洩。
        只為領藥，卻可能被迫攤開整份病歷；只想參與研究，卻難以掌握資料去向。
        我們相信，資料應該掌握在病人自己手中——而 MedSSI，正是為了讓這一切改變。
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
    </BondsShell>
  );
}
