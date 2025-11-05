import SceneShell from "../components/PageShell.jsx";
import { useDemo } from "../context.jsx";

export default function Scene05_Issuer() {
  const { scope, baseUrl, issuerToken, mode } = useDemo(); // 現在不會是 null

  return (
    <SceneShell
      title="Scene 05｜發卡端（預覽）"
      left={
        <ul className="bullets">
          <li>Scope：{scope}</li>
          <li>Base URL：{baseUrl}</li>
          <li>Issuer Token：{issuerToken.slice(0,4)}•••</li>
          <li>模式：{mode}</li>
        </ul>
      }
      right={<div className="mock"><div className="card">這裡放 QR 預覽（之後串 API）</div></div>}
    />
  );
}
