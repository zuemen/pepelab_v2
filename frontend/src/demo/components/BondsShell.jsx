// frontend/src/demo/components/BondsShell.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function BondsShell({ bg = "#0f172a", children, prev, next }) {
  const nav = useNavigate();

  // 鍵盤左右鍵切頁
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" && next) nav(next);
      if (e.key === "ArrowLeft" && prev) nav(prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, prev, next]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: bg,
        color: "#e2e8f0",
        display: "grid",
        gridTemplateRows: "1fr auto",
      }}
    >
      <main style={{ display: "grid", placeItems: "center", padding: "4rem 1.5rem" }}>
        <div style={{ maxWidth: 980, width: "100%" }}>{children}</div>
      </main>

      <footer
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 16,
          padding: "1.25rem",
          borderTop: "1px solid rgba(255,255,255,.08)",
        }}
      >
        {prev ? (
          <button className="ghost" onClick={() => nav(prev)} aria-label="上一頁">
            PREV
          </button>
        ) : (
          <span style={{ opacity: 0.3 }}>PREV</span>
        )}
        {next ? (
          <button className="cta" onClick={() => nav(next)} aria-label="下一頁">
            NEXT
          </button>
        ) : (
          <span style={{ opacity: 0.3 }}>NEXT</span>
        )}
      </footer>
    </div>
  );
}
