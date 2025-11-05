// frontend/src/demo/pages_bonds/Page1_Home.jsx
import BondsShell from "../components/BondsShell.jsx";
import { useNavigate } from "react-router-dom";

export default function Page1_Home() {
  const nav = useNavigate();
  return (
    <BondsShell next="/page2" bg="linear-gradient(180deg,#0f172a 0%,#0b2138 100%)">
      <section style={{ textAlign: "center", padding: "2rem 1rem" }}>
         <div className="hero-card">
           <h1 style={{ fontSize: 56, lineHeight: 1.1, marginBottom: 12, fontWeight: 800 }}>
             MedSSI：醫療資料有我守護
           </h1>
           <p style={{ fontSize: 20, color: "#94a3b8", marginBottom: 28 }}>
             讓資料回到病人手中，讓信任重回醫療體系。
           </p>
            <p style={{ fontSize: 16, opacity: 0.85, marginBottom: 36 }}>
          從診間到藥局、從病歷到研究，MedSSI 以 FHIR + VC/VP + 選擇性揭露，
          建立一條安全透明的醫療資料鏈。
        </p>
       
        <button className="cta" onClick={() => nav("/page2")}>開始探索</button>
      </div>
      </section>
      
    </BondsShell>
    
  );
}
