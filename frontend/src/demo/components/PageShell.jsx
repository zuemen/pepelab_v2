// src/demo/components/PageShell.jsx
export default function PageShell({ title, subtitle, left, right }) {
  return (
    <div className="bonds-shell" style={{ animation: "fade-slide-in 0.45s ease both" }}>
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
    </div>
  );
}
