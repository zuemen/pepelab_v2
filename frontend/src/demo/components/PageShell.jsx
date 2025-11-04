export default function PageShell({ title, subtitle, left, right }) {
  return (
    <div className="demo-shell">
      <div className="demo-left">
        <h1 className="demo-title" aria-live="polite">{title}</h1>
        {subtitle && <p className="demo-subtitle">{subtitle}</p>}
        <div className="demo-left-content">{left}</div>
      </div>
      <div className="demo-right">
        <div className="demo-device">
          {right}
        </div>
      </div>
    </div>
  );
}
