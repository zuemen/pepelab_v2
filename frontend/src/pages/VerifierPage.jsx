import React from 'react';
import { VerifierPanel } from '../components/VerifierPanel.jsx';

export function VerifierPage({ client, verifierToken, isExpertMode }) {
  return <VerifierPanel client={client} verifierToken={verifierToken} isExpertMode={isExpertMode} />;
}
