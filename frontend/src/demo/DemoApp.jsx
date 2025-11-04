import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { DemoProvider } from "./context.jsx";
import Scene01 from "./pages/Scene01_Problem.jsx";
import Scene02 from "./pages/Scene02_SystemPain.jsx";
import Scene03 from "./pages/Scene03_MethodMap.jsx";
import Scene04 from "./pages/Scene04_Compliance.jsx";
import Scene05 from "./pages/Scene05_Issuer.jsx";
import Scene06 from "./pages/Scene06_Wallet.jsx";
import Scene07 from "./pages/Scene07_Verifier.jsx";

export default function DemoApp() {
  return (
    <DemoProvider>
      <BrowserRouter basename="/demo">
        <Routes>
          <Route path="/" element={<Scene01 />} />
          <Route path="/scene01" element={<Scene01 />} />
          <Route path="/scene02" element={<Scene02 />} />
          <Route path="/scene03" element={<Scene03 />} />
          <Route path="/scene04" element={<Scene04 />} />
          <Route path="/scene05" element={<Scene05 />} />
          <Route path="/scene06" element={<Scene06 />} />
          <Route path="/scene07" element={<Scene07 />} />
        </Routes>
      </BrowserRouter>
    </DemoProvider>
  );
}
