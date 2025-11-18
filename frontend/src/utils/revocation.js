import { normalizeCid } from './cid.js';

export function normalizeSandboxPrefix(prefix) {
  if (!prefix || typeof prefix !== 'string') {
    return '';
  }

  const trimmed = prefix.trim();
  if (!trimmed) {
    return '';
  }

  const withoutTrailing = trimmed.replace(/\/+$/, '');
  const withoutLeading = withoutTrailing.replace(/^\/+/, '');
  return withoutLeading ? `/${withoutLeading}` : '';
}

export function stripSandboxSuffix(baseUrl, sandboxPrefix) {
  if (!baseUrl || !sandboxPrefix) {
    return baseUrl || '';
  }

  const normalizedBase = String(baseUrl);
  const normalizedPrefix = String(sandboxPrefix)
    .trim()
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');

  if (!normalizedPrefix) {
    return normalizedBase;
  }

  if (normalizedBase.endsWith(normalizedPrefix)) {
    return normalizedBase.slice(0, normalizedBase.length - normalizedPrefix.length) || '';
  }

  return normalizedBase;
}

export function computeRevocationDetails({
  cid,
  sandboxPrefix,
  baseUrl,
  storedPath,
  storedUrl,
  storedDisplayPath,
  storedDisplayUrl,
}) {
  const normalizedCid = normalizeCid(cid);
  const normalizedPrefix = normalizeSandboxPrefix(sandboxPrefix);

  const defaultPath = normalizedCid
    ? `${normalizedPrefix || ''}/api/credential/${normalizedCid}/revocation`
    : '';

  const normalizedPath = defaultPath.replace(/\/{2,}/g, '/');

  const computedUrl =
    normalizedPath && baseUrl
      ? `${baseUrl}${normalizedPath.startsWith('/') ? '' : '/'}${normalizedPath}`
      : '';

  const displayPath = normalizedCid ? `/api/credential/${normalizedCid}/revocation` : '';
  const displayBase = stripSandboxSuffix(baseUrl, normalizedPrefix);
  const displayUrl =
    displayPath && displayBase
      ? `${displayBase}${displayPath.startsWith('/') ? '' : '/'}${displayPath}`
      : '';

  return {
    path: normalizedPath || storedPath || '',
    url: computedUrl || storedUrl || '',
    displayPath: displayPath || storedDisplayPath || normalizedPath || storedPath || '',
    displayUrl: displayUrl || storedDisplayUrl || computedUrl || storedUrl || '',
  };
}

