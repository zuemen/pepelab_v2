// src/demo/scenes/Scene01_PickupIntro.jsx
import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import { useDemo } from "../context";

export default function Scene01_PickupIntro() {
  const navigate = useNavigate();
  const { scope, mode } = useDemo();

  return (
    <PageShell
      title="臨櫃前的焦慮：為何只為領藥，卻要翻整本病歷？"
      subtitle="慢箋病患阿朱的領藥困境"
      left={
        <div className="demo-left-content">
          <p>阿朱提著藥袋到藥局。藥師說：「阿伯，這次處方我需要再打電話確認。」</p>
          <p>病歷太多、資料重複、揭露過度。阿朱嘆氣：「為什麼只為領藥，要看我整份病歷？」</p>
          <ul className="demo-bullets">
            <li>問題：過度揭露、重複核對、來回電話</li>
            <li>風險：資訊外洩、流程冗長、體驗不佳</li>
            <li>想像：一次性授權 + 最小必要 → 免翻整本病歷</li>
          </ul>
          <div className="navs">
            <button className="cta" onClick={() => navigate("/scene02")}>啟動 MedSSI 領藥流程</button>
          </div>
        </div>
      }
      right={
        <div className="mock">
          <div className="card warn">紙本病歷疊</div>
          <div className="card warn">藥局來回電話</div>
          <div className="tag bad">過度揭露</div>
        </div>
      }
    />
  );
}
