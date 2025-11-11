export function normalizeCid(input) {
  return String(input ?? '')
    .trim()
    .replace(/^"+|"+$/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/^.*\/api\/credential\//, '')
    .replace(/\/+$/, '');
}

export function parseCidFromJti(jti) {
  const raw = String(jti ?? '').trim();
  if (!raw) {
    return '';
  }

  const stripped = raw.replace(/^"+|"+$/g, '').replace(/^'+|'+$/g, '');

  try {
    const url = new URL(stripped);
    const segments = url.pathname.split('/').filter(Boolean);
    const lastSegment = segments.length ? segments[segments.length - 1] : '';
    return normalizeCid(lastSegment || stripped);
  } catch (error) {
    const segments = stripped.split('/').filter(Boolean);
    return normalizeCid(segments.length ? segments[segments.length - 1] : stripped);
  }
}
