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
        
      <div className="mock">
        <div className="card">
          <h3>Issuer QR</h3>
          <img src={qrImage} alt="QR Code" style={{ width: "100%", maxWidth: "600px", borderRadius: "12px" }} />
          <p>QR Code 是由醫院產生，並且有 5 分鐘有效期，當病人領藥時，會自動過期。</p>
        </div>
      </div>
      }
    />
  );
}
