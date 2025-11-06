import { useDemo } from "../context.jsx";

export default function PageShell({ title, subtitle, left, right }) {
  // 從全域 context 取得 scope 和 mode
  const { scope, mode } = useDemo();

  return (
    <>
      <div className="page-top">
        <span>Scope: {scope}</span>
        <span style={{ marginLeft: "12px" }}>Mode: {mode}</span>
      </div>

      <div className="demo-shell">
        <div className="demo-left">
          <h1 className="demo-title" aria-live="polite">
            {title}
          </h1>
          {subtitle && <p className="demo-subtitle">{subtitle}</p>}
          <div className="demo-left-content">{left}</div>
        </div>

        <div className="demo-right">
          <div className="demo-device">{right}</div>
        </div>
      </div>
    </>
  );
}
