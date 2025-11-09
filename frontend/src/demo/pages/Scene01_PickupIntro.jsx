// src/demo/scenes/Scene01_PickupIntro.jsx
import { useNavigate } from "../../router.jsx";
import PageShell from "../components/PageShell";
import { useDemo } from "../context";

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
     <div className="mock">
    <div className="card warn">
      <div className="title">紙本病歷疊</div>
      <div className="description">
        每次領藥時都要將整本病歷翻出來，讓藥師瞭解過去的診斷和用藥情況，過度揭露病歷信息。
      </div>
    </div>

    <div className="card warn">
      <div className="title">藥局來回電話</div>
      <div className="description">
        每次領藥時，藥局都要與醫生核對藥品、過敏史和同意書，來回電話增加了不必要的重複。
      </div>
    </div>

    <div className="tag bad">MedSSI透過數位皮夾應用改善過度揭露</div>
  </div>
  }
  
  />
  );

}
