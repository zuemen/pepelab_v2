import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { DemoProvider } from "./context.jsx";
import Scene01 from "./pages/Scene01_Problem.jsx";
import Scene02 from "./pages/Scene02_SystemPain.jsx";
import Scene03 from "./pages/Scene03_MethodMap.jsx";
import Scene04 from "./pages/Scene04_Compliance.jsx";
import Scene05 from "./pages/Scene05_Issuer.jsx";
import Scene06 from "./pages/Scene06_Wallet.jsx";
import Scene07 from "./pages/Scene07_Verifier.jsx";
import { AnimatePresence, motion } from "framer-motion";

<AnimatePresence mode="wait">
  <Routes location={location} key={location.pathname}>
    <Route path="/scene01" element={<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.4}}><Scene01/></motion.div>} />
    <Route path="/scene02" element={<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.4}}><Scene02/></motion.div>} />
    <Route path="/scene03" element={<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.4}}><Scene03/></motion.div>} />
    <Route path="/scene04" element={<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.4}}><Scene04/></motion.div>} />
    <Route path="/scene05" element={<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.4}}><Scene05/></motion.div>} />
    <Route path="/scene06" element={<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.4}}><Scene06/></motion.div>} />
    <Route path="/scene07" element={<motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-20}} transition={{duration:0.4}}><Scene07/></motion.div>} /> 
  </Routes>
</AnimatePresence>

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
