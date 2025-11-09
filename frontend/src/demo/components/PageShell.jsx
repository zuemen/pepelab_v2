// src/demo/components/PageShell.jsx
import { motion } from "framer-motion";

export default function PageShell({ title, subtitle, left, right }) {
  return (
    <motion.div
      className="bonds-shell"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      {/* 左右分欄區 */}
      <div className="bonds-layout">
        {/* 左：文字敘事區 */}
        <div className="bonds-left">
          <h1 className="bonds-title" aria-live="polite">
            {title}
          </h1>
          {subtitle && <p className="bonds-subtitle">{subtitle}</p>}
          <div className="bonds-content">{left}</div>
        </div>

        {/* 右：互動或示意畫面 */}
        <div className="bonds-right">
          <div className="bonds-device">{right}</div>
        </div>
      </div>
    </motion.div>
  );
}
