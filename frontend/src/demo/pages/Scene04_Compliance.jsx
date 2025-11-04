import PageShell from "../components/PageShell";

export default function Scene04_Compliance() {
  return (
    <PageShell
      title="法規對齊，才值得投入"
      left={
        <div className="grid4">
          <div className="law-card"><h4>電子簽章法</h4><p>VC/VP 電子簽同意具效力</p></div>
          <div className="law-card"><h4>醫療法 §72</h4><p>跨院資料需明示授權與留痕</p></div>
          <div className="law-card"><h4>個資法</h4><p>特種個資最小蒐集／目的限定／可刪除</p></div>
          <div className="law-card"><h4>IAL 對齊</h4><p>MYDATA_LIGHT / NHI_CARD_PIN / MOICA_CERT</p></div>
        </div>
      }
      right={
        <div className="mock-record">
          <div className="line dim">姓名：＊＊＊＊＊</div>
          <div className="line dim">生日：＊＊＊</div>
          <div className="line">診斷碼：K29.7</div>
          <div className="line">日期：2025-11-01</div>
          <div className="line">院所：12345678</div>
          <div className="tag good">僅顯示必要欄位</div>
        </div>
      }
    />
  );
}
