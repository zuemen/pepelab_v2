// frontend/src/demo/SceneRouter.jsx
import { Routes, Route, Navigate } from "react-router-dom";

import Scene01 from "./pages/Scene01_PickupIntro.jsx";
import Scene02 from "./pages/Scene02_IssuerVC.jsx";
import Scene03 from "./pages/Scene03_VerifyPickup.jsx";
import Scene04 from "./pages/Scene04_ResearchRequest.jsx";
import Scene05 from "./pages/Scene05_WalletConsent.jsx";
import Scene06 from "./pages/Scene06_VerifyResearch.jsx";
import Scene07 from "./pages/Scene07_Audit.jsx";

export default function SceneRouter() {
  return (
    <Routes>
      {/* 父路由 /scene 正好匹配時渲染 Scene01 */}
      <Route index element={<Scene01 />} />

      {/* 其他子頁 */}
      <Route path="scene01" element={<Scene01 />} />
      <Route path="scene02" element={<Scene02 />} />
      <Route path="scene03" element={<Scene03 />} />
      <Route path="scene04" element={<Scene04 />} />
      <Route path="scene05" element={<Scene05 />} />
      <Route path="scene06" element={<Scene06 />} />
      <Route path="scene07" element={<Scene07 />} />

      {/* 保險：任何不匹配導回 scene01 */}
      <Route path="*" element={<Navigate to="scene01" replace />} />
    </Routes>
  );
}
