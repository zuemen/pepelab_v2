export default function DotsNav({ count, index, onChange }) {
  return (
    <div className="demo-dots" role="tablist" aria-label="頁面導覽">
      {Array.from({ length: count }).map((_, i) => (
        <button
          key={i}
          role="tab"
          aria-selected={index === i}
          className={`demo-dot ${index === i ? "active" : ""}`}
          onClick={() => onChange(i)}
          title={`跳到第 ${i + 1} 場`}
        />
      ))}
    </div>
  );
}
