// src/demo/scenes/Scene02_IssuerVC.jsx
import { useNavigate } from "../../router.jsx";
import PageShell from "../components/PageShell";
import { useDemo } from "../context";
import qrImage from "../assets/診斷卡.png"; // 引入圖片

export default function Scene02_IssuerVC() {
  const navigate = useNavigate();
  const { baseUrl } = useDemo();

  return (
    <PageShell
      title="醫院發卡：產生『領藥憑證 VC』"
      subtitle="最小必要欄位 + 醫院私鑰簽章 + 5 分鐘 QR"
      left={
        <>
          <p>醫院系統依本次處方自動產生 VC，僅含「處方代碼、劑量/天數、過敏史」。</p>
          <ul className="demo-bullets">
            <li>IAL2 完成身分確認</li>
            <li>醫院私鑰簽章（電子簽章法 §9）</li>
            <li>QR 有效 5 分鐘，逾時自動失效</li>
          </ul>
          <div className="navs">
            <button className="ghost" onClick={() => navigate("scene01")}>
              ← 上一幕
            </button>
            <button className="cta" onClick={() => navigate("scene03")}>
              小朱用錢包掃描
            </button>
          </div>
        </>
      }
     right={
  <div className="issuer-phone">
    <div className="phone-bezel">
      <div className="phone-screen">
        {/* 上方標題列 */}
        <div className="phone-status">
          <span className="app-name">Issuer · MedSSI</span>
          <span className="ttl">TTL：5:00</span>
        </div>

        {/* 本次處方 VC 卡片 */}
        <div className="vc-card">
          <div className="vc-pill">本次處方 VC</div>
          <h3 className="vc-title">領藥憑證（Medication Pickup）</h3>

          <div className="vc-field">
            <span className="label">Scope</span>
            <span className="value">MEDICATION_PICKUP</span>
          </div>
          <div className="vc-field">
            <span className="label">處方代碼</span>
            <span className="value">RX-2025-1101-001</span>
          </div>
          <div className="vc-field">
            <span className="label">劑量 / 天數</span>
            <span className="value">Omeprazole 20mg · 28 天</span>
          </div>
          <div className="vc-field">
            <span className="label">過敏史摘要</span>
            <span className="value">無 Penicillin 過敏</span>
          </div>
 

        {/* 下方 QR 區塊 */}
        <div className="qr-section">
          <div className="qr-label">掃描此 QR 以驗證本次處方 VC</div>
          <div className="qr-box">
            <img
              src={qrImage}
              alt="領藥憑證 QR"
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "12px" }}
            />
          </div>
          <div className="qr-meta">有效時間：5 分鐘 · 逾時自動失效</div>
        </div>
      </div>
    </div>
 
  </div>
   </div>
}

    />
  );
}
