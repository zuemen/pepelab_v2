// src/demo/pages/Page1_Home.jsx
import { useNavigate } from "../../router.jsx";
import BondsShell from "../components/BondsShell.jsx";
import qrAndroid from "../assets/qr-android.svg";
import qrIos from "../assets/qr-ios.svg";

const ANDROID_DOWNLOAD_URL = "https://play.google.com/store/apps/details?id=tw.gov.digitalwallet";
const IOS_DOWNLOAD_URL = "https://apps.apple.com/tw/app/id6446202653";

export default function Page1_Home() {
  const nav = useNavigate();

  return (
    <BondsShell next="page2" bg="linear-gradient(180deg,#0f172a 0%,#0b2138 100%)">
      <section className="hero-split">
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

        <aside className="download-card" aria-label="下載數位皮夾 App">
          <h2 className="download-card__title">尚未安裝「數位皮夾 App」？掃描下載立即開始</h2>
          <div className="download-card__grid">
            <a
              className="download-card__item"
              href={ANDROID_DOWNLOAD_URL}
              target="_blank"
              rel="noreferrer"
            >
              <img src={qrAndroid} alt="Android 版數位皮夾 QR Code" loading="lazy" />
              <span className="download-card__store">Google Play 下載</span>
              <span className="download-card__hint">支援 Android 10 以上</span>
            </a>

            <a className="download-card__item" href={IOS_DOWNLOAD_URL} target="_blank" rel="noreferrer">
              <img src={qrIos} alt="iOS 版數位皮夾 QR Code" loading="lazy" />
              <span className="download-card__store">App Store 下載</span>
              <span className="download-card__hint">支援 iOS 15 以上</span>
            </a>
          </div>
        </aside>
      </section>
    </BondsShell>
  );
}
