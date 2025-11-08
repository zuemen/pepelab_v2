// frontend/src/demo/DemoApp.jsx
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { DemoProvider } from "./context.jsx";  // ✅ 加這行
import "./demo.css";
// bonds-style 頁面
import Page1_Home from "./pages_bonds/Page1_Home.jsx";
import Page2_Issues from "./pages_bonds/Page2_Issues.jsx";
import Page3_Solution from "./pages_bonds/Page3_Solution.jsx";
import Page4_Branch from "./pages_bonds/Page4_Branch.jsx";
import Scene01_Problem from "./pages/Scene01_PickupIntro.jsx";
import Scene02_SystemPain from "./pages/Scene02_IssuerVC.jsx";
import Scene03_MethodMap from "./pages/Scene03_VerifyPickup.jsx";
import Scene04_Compliance from "./pages/Scene04_ResearchRequest.jsx";      
import Scene05_Issuer from "./pages/Scene05_WalletConsent.jsx";
import Scene06_Wallet from "./pages/Scene06_VerifyResearch.jsx";
import Scene07_Verifier from "./pages/Scene07_Audit.jsx";  
import Scene08_Insurance from "./pages/Scene08_Insurance.jsx";
// 技術版 scene router
import SceneRouter from "./SceneRouter.jsx";

// 小動畫 wrapper
const Page = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -16 }}
    transition={{ duration: 0.35 }}
    style={{ minHeight: "100vh" }}
  >
    {children}
  </motion.div>
);

function RoutesWithAnimation() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        {/* bonds 新開場頁 */}
        <Route path="/" element={<Page><Page1_Home /></Page>} />
        <Route path="/page2" element={<Page><Page2_Issues /></Page>} />
        <Route path="/page3" element={<Page><Page3_Solution /></Page>} />
        <Route path="/page4" element={<Page><Page4_Branch /></Page>} />
        <Route path="/scene01" element={<Scene01_Problem />} />
        <Route path="/scene02" element={<Scene02_SystemPain />} />
        <Route path="/scene03" element={<Scene03_MethodMap />} />
        <Route path="/scene04" element={<Scene04_Compliance />} />
        <Route path="/scene05" element={<Scene05_Issuer />} />
        <Route path="/scene06" element={<Scene06_Wallet />} />
        <Route path="/scene07" element={<Scene07_Verifier />} />
        <Route path="/scene08" element={<Scene08_Insurance />} />
        {/* 技術展示頁（Scene01~07） */}
        <Route path="/scene/*" element={<Page><SceneRouter /></Page>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  );
}

// ✅ 改這裡：把整個 Router 包在 DemoProvider 外層
export default function DemoApp() {
  return (
    <DemoProvider>  
      <BrowserRouter basename="/demo">
        <RoutesWithAnimation />
      </BrowserRouter>
    </DemoProvider>
  );
}
