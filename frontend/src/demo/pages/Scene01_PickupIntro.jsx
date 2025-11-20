// src/demo/scenes/Scene01_PickupIntro.jsx
import { useNavigate } from "../../router.jsx";
import PageShell from "../components/PageShell";
import { useDemo } from "../context";
import S1Image from "../assets/scene1.png"; // 引入圖片
export default function Scene01_PickupIntro() {
  const navigate = useNavigate();
  const { scope, mode } = useDemo();

  return (
   <PageShell
  title="臨櫃前的焦慮：為何只為領藥，卻要翻整本病歷？"
  subtitle="慢箋病患小朱的領藥困境"
  left={
    <div className="demo-left-content">
      <p>
        小朱提著藥袋到藥局，準備領取上次診所開的藥。但當藥師翻看處方單時，卻發現需要再打電話確認。他聽到藥師說：「小朱，這次處方我需要再打電話確認，因為資料顯示不完整。」小朱心想：「我只需要這些藥，為什麼要查整份病歷？」
      </p>
      <p>
        小朱的病歷太多，資料重複且沒有整合，過度的資料揭露讓他感到困擾。他嘆氣：「為什麼每次領藥都要看我整份病歷，這樣的過程讓我感到焦慮和不便。」
      </p>
      <ul className="demo-bullets">
        <li>問題：過度揭露、重複核對、來回電話</li>
        <li>風險：資訊外洩、流程冗長、體驗不佳</li>
        <li>想像：一次性授權 + 最小必要 → 免翻整本病歷</li>
      </ul>
        <div className="navs">
          <button className="cta" onClick={() => navigate("scene02")}>
            啟動 MedSSI 領藥流程
          </button>
        </div>
    </div>
  }
  right={
  <div className="scene01-right">
    {/* 上半：手機畫面（方案 B） */}
    <div className="phone-mock">
      <div className="phone-header">處方資訊（藥局端畫面）</div>
      <div className="phone-line">姓名：小朱</div>
      <div className="phone-line">完整病歷：＜全部可見＞</div>
      <div className="phone-line">診斷摘要：高血壓、焦慮症</div>
      <div className="phone-line">本次只需：抗憂鬱劑</div>

      <div className="warn-box">
        ⚠️ 顯示內容超出領藥所需  
        <br />
        → 暴露完整病歷與精神科紀錄
      </div>
    </div>

    {/* 下半：流程圖（方案 A） */}
    <div className="mock-flow">
      <div className="flow-step">
        <div className="icon">📄</div>
        <span>紙本病歷翻閱</span>
      </div>

      <div className="flow-arrow">➜</div>

      <div className="flow-step">
        <div className="icon">📞</div>
        <span>藥局來回電話</span>
      </div>

      <div className="flow-arrow">➜</div>

      <div className="flow-step highlight">
        <div className="icon">⚠️</div>
        <span>過度揭露風險</span>
      </div>
    </div>
  </div>
}

  />
  );

}
