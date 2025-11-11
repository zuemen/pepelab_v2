export function normalizeCredentialStatus(status) {
  if (status === null || status === undefined) {
    return '';
  }

  if (typeof status === 'string') {
    return status.trim().toUpperCase();
  }

  return String(status).trim().toUpperCase();
}

export function describeCredentialStatus(status) {
  const normalized = normalizeCredentialStatus(status);

  if (!normalized) {
    return {
      normalized: '',
      text: '官方尚未提供',
      tone: 'muted',
      collected: false,
      revoked: false,
    };
  }

  const includes = (keyword) => normalized.includes(keyword);

  if (includes('REVOK')) {
    return {
      normalized,
      text: `已撤銷（${normalized}）`,
      tone: 'error',
      collected: false,
      revoked: true,
    };
  }

  if (includes('ACCEPT') || includes('COLLECT') || includes('ACTIVE')) {
    return {
      normalized,
      text: `已領取（${normalized}）`,
      tone: 'success',
      collected: true,
      revoked: false,
    };
  }

  if (includes('PEND') || includes('WAIT')) {
    return {
      normalized,
      text: `待領取（${normalized}）`,
      tone: 'pending',
      collected: false,
      revoked: false,
    };
  }

  if (includes('ISSUED') || includes('READY')) {
    return {
      normalized,
      text: `已發行（${normalized}）`,
      tone: 'info',
      collected: false,
      revoked: false,
    };
  }

  return {
    normalized,
    text: normalized,
    tone: 'info',
    collected: false,
    revoked: false,
  };
}

export function isCollectedStatus(status) {
  return describeCredentialStatus(status).collected;
}

export function isRevokedStatus(status) {
  return describeCredentialStatus(status).revoked;
}
