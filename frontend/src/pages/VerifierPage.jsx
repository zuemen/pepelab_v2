import React from 'react';
import { VerifierPanel } from '../components/VerifierPanel.jsx';

export function VerifierPage({ client, verifierToken }) {
  return <VerifierPanel client={client} verifierToken={verifierToken} />;
}
