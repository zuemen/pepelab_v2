import { useEffect, useRef, useState } from "react";
import DotsNav from "./DotsNav";

export default function Pager({ pages }) {
  const containerRef = useRef(null);
  const [index, setIndex] = useState(0);

  // URL hash 同步（#p0, #p1, ...）
  useEffect(() => {
    const syncFromHash = () => {
      const h = window.location.hash.replace("#p", "");
      if (!isNaN(+h)) setIndex(Math.max(0, Math.min(+h, pages.length - 1)));
    };
    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [pages.length]);

  useEffect(() => {
    const el = containerRef.current?.children[index];
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#p${index}`);
  }, [index]);

  // 鍵盤左右鍵/翻頁鍵
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") setIndex(i => Math.min(i + 1, pages.length - 1));
      if (e.key === "ArrowLeft"  || e.key === "PageUp")   setIndex(i => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pages.length]);

  return (
    <div className="demo-pager">
      <div className="demo-pages" ref={containerRef}>
        {pages.map((Page, i) => (
          <section className="demo-page" key={i} aria-label={`第 ${i+1} 場`}>
            <Page />
          </section>
        ))}
      </div>
      <DotsNav count={pages.length} index={index} onChange={setIndex} />
    </div>
  );
}
