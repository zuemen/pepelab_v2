import { useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell.jsx";

export default function Scene01_Problem() {
  const navigate = useNavigate();

  return (
    <PageShell
      title="Scene 01｜沒有我們的世界"
      subtitle="跨院資料分散、紙本流程冗長"
      left={
        <>
          <ul className="bullets">
            <li>跨院資料分散，臨櫃核對冗長</li>
            <li>過度揭露：只為領藥卻攤開整份病歷</li>
            <li>長者操作與家屬溝通成本高</li>
          </ul>
          <button className="cta" onClick={() => navigate("/scene02")}>
            下一步：如果只揭露「最小必要」？
          </button>
        </>
      }
      right={
        <div className="mock">
          <div className="card warn">藥局來回電話</div>
          <div className="card warn">病歷紙本核對</div>
          <div className="card warn">陪同者操作困難</div>
        </div>
      }
    />
  );
}
