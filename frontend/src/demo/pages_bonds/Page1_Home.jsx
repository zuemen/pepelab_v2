// src/demo/pages/Page1_Home.jsx
import { QRCodeSVG } from "qrcode.react";
import { useNavigate } from "../../router.jsx";
import BondsShell from "../components/BondsShell.jsx";

const ANDROID_DOWNLOAD_URL = "https://play.google.com/store/apps/details?id=tw.gov.digitalwallet";
const IOS_DOWNLOAD_URL = "https://apps.apple.com/tw/app/id6446202653";

export default function Page1_Home() {
  const nav = useNavigate();

  return (
    <BondsShell next="page2" bg="linear-gradient(180deg,#0f172a 0%,#0b2138 100%)">
      <section className="hero-stack">
        <div className="hero-card">
          <h1>MedSSI：醫療資料有我守護</h1>
          <p className="hero-card__subtitle">讓資料回到病人手中，讓信任重回醫療體系。</p>
          <p className="hero-card__body">
            從診間到藥局、從病歷到研究，MedSSI 以 FHIR + VC/VP + 選擇性揭露，建立一條安全透明的醫療資料鏈。
          </p>
          <button className="cta" onClick={() => nav("page2")}>
            開始探索
          </button>
        </div>

        <aside className="download-panel" aria-label="下載數位皮夾 App">
          <header className="download-panel__header">
            <h2>還沒有安裝「數位皮夾 App」嗎？</h2>
            <p>
              掃描官方 QR Code 或點選下載連結，即可前往對應的應用程式商店。
              建議先完成安裝，再進行後續的技術體驗流程。
            </p>
          </header>

          <div className="download-panel__grid">
            <div className="download-panel__item">
              <div className="download-panel__qr" aria-hidden="true">
                <QRCodeSVG value={ANDROID_DOWNLOAD_URL} size={144} includeMargin />
              </div>
              <div className="download-panel__meta">
                <p className="download-panel__platform">Android 裝置</p>
                <p className="download-panel__hint">支援 Android 10（API 29）以上版本</p>
                <a
                  className="download-panel__link"
                  href={ANDROID_DOWNLOAD_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  前往 Google Play 下載
                </a>
              </div>
            </div>

            <div className="download-panel__item">
              <div className="download-panel__qr" aria-hidden="true">
                <QRCodeSVG value={IOS_DOWNLOAD_URL} size={144} includeMargin />
              </div>
              <div className="download-panel__meta">
                <p className="download-panel__platform">iPhone / iPad</p>
                <p className="download-panel__hint">支援 iOS / iPadOS 15 以上版本</p>
                <a className="download-panel__link" href={IOS_DOWNLOAD_URL} target="_blank" rel="noreferrer">
                  前往 App Store 下載
                </a>
              </div>
            </div>
          </div>
        </aside>
      </section>
    </BondsShell>
  );
}
