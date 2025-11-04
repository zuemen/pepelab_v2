import "./demo.css";
import Pager from "./components/Pager.jsx";
import { DemoProvider } from "./context.jsx";

import Scene01 from "./pages/Scene01_Problem.jsx";
import Scene02 from "./pages/Scene02_SystemPain.jsx";
import Scene03 from "./pages/Scene03_MethodMap.jsx";
import Scene04 from "./pages/Scene04_Compliance.jsx";
import Scene05 from "./pages/Scene05_Issuer.jsx";
import Scene06 from "./pages/Scene06_Wallet.jsx";
import Scene07 from "./pages/Scene07_Verifier.jsx";

export default function DemoApp() {
  const pages = [Scene01, Scene02, Scene03, Scene04, Scene05, Scene06, Scene07];

  return (
    <DemoProvider>
      <div className="demo-root">
        <header className="topbar">
          <strong>MedSSI Demo</strong>
          <span className="sep">•</span>
          <span aria-live="polite">分頁敘事（滑動或按 ← → 切換）</span>
        </header>
        <Pager pages={pages} />
      </div>
    </DemoProvider>
  );
}
