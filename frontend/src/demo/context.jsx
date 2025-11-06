import { createContext, useContext, useState } from "react";

// 你要用到的最小狀態：scope / baseUrl / 三個 token / mode
const DemoCtx = createContext(null);

export function DemoProvider({ children }) {
  const [scope, setScope] = useState("MEDICATION_PICKUP");
  const [baseUrl, setBaseUrl] = useState("http://localhost:8000");
  const [issuerToken, setIssuerToken] = useState("koreic2ZEFZ2J4oo2RaZu58yGVXiqDQy");
  const [walletToken, setWalletToken] = useState("wallet-sandbox-token");
  const [verifierToken, setVerifierToken] = useState("J3LdHEiVxmHBYJ6iStnmATLblzRkz2AC");
  const [mode, setMode] = useState("preview"); // 先不串 API，用來切換預覽/Live

  const value = {
    scope, setScope,
    baseUrl, setBaseUrl,
    issuerToken, setIssuerToken,
    walletToken, setWalletToken,
    verifierToken, setVerifierToken,
    mode, setMode,
  };

  return <DemoCtx.Provider value={value}>{children}</DemoCtx.Provider>;
}

export const useDemo = () => useContext(DemoCtx);
