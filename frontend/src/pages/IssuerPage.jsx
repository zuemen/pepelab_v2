import React from 'react';
import { IssuerPanel } from '../components/IssuerPanel.jsx';

export function IssuerPage({ client, issuerToken, walletToken, baseUrl, isExpertMode }) {
  return (
    <IssuerPanel
      client={client}
      issuerToken={issuerToken}
      walletToken={walletToken}
      baseUrl={baseUrl}
      isExpertMode={isExpertMode}
    />
  );
}
