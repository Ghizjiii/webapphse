function normalizeOriginRule(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed === '*') return '*';
  return trimmed.replace(/\/+$/, '');
}

function configuredOrigins(rawValue) {
  return String(rawValue || '')
    .split(',')
    .map(normalizeOriginRule)
    .filter(Boolean);
}

function isOriginRuleMatch(requestOrigin, rule) {
  const normalizedRequestOrigin = normalizeOriginRule(requestOrigin);
  const normalizedRule = normalizeOriginRule(rule);

  if (!normalizedRequestOrigin || !normalizedRule) return false;
  if (normalizedRule === '*') return true;
  if (normalizedRule === normalizedRequestOrigin) return true;
  if (!normalizedRule.includes('*')) return false;

  try {
    const requestUrl = new URL(normalizedRequestOrigin);
    const hasScheme = normalizedRule.includes('://');
    const protocolPrefix = hasScheme ? `${requestUrl.protocol}//` : '';
    const hostPattern = hasScheme ? normalizedRule.split('://')[1] : normalizedRule;
    const normalizedHostPattern = hostPattern.startsWith('*.') ? hostPattern.slice(2) : hostPattern;

    if (!normalizedHostPattern) return false;
    if (hasScheme && !normalizedRule.startsWith(protocolPrefix)) return false;

    return (
      requestUrl.hostname === normalizedHostPattern ||
      requestUrl.hostname.endsWith(`.${normalizedHostPattern}`)
    );
  } catch {
    return false;
  }
}

function fallbackAllowedOrigin(origins) {
  const firstExact = origins.find((value) => value && !value.includes('*'));
  return firstExact || '*';
}

function resolveAllowedOrigin(requestOrigin, rawValue) {
  const normalizedRequestOrigin = normalizeOriginRule(requestOrigin);
  const origins = configuredOrigins(rawValue);

  if (origins.length === 0) return normalizedRequestOrigin || '*';
  if (normalizedRequestOrigin && origins.some((rule) => isOriginRuleMatch(normalizedRequestOrigin, rule))) {
    return normalizedRequestOrigin;
  }

  return fallbackAllowedOrigin(origins);
}

function extractRequestOrigin(req) {
  const origin = normalizeOriginRule(req.headers.origin || '');
  if (origin) return origin;

  const referer = String(req.headers.referer || '').trim();
  if (!referer) return '';

  try {
    return normalizeOriginRule(new URL(referer).origin);
  } catch {
    return '';
  }
}

function applyCors(res, requestOrigin, allowedOriginEnv) {
  res.setHeader('Access-Control-Allow-Origin', resolveAllowedOrigin(requestOrigin, allowedOriginEnv));
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async (req, res) => {
  const allowedOriginEnv = String(process.env.ALLOWED_ORIGIN || '').trim();
  const requestOrigin = extractRequestOrigin(req);

  applyCors(res, requestOrigin, allowedOriginEnv);

  if (!allowedOriginEnv) {
    return res.status(500).json({ error: 'ALLOWED_ORIGIN is not configured' });
  }

  if (!requestOrigin) {
    return res.status(403).json({ error: 'Origin or Referer is required' });
  }

  const originAllowed = configuredOrigins(allowedOriginEnv)
    .some((rule) => isOriginRuleMatch(requestOrigin, rule));
  if (!originAllowed) {
    return res.status(403).json({ error: 'Origin is not allowed' });
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const upstreamBase = String(process.env.PAYMENT_OCR_UPSTREAM_URL || '').trim().replace(/\/+$/, '');
  const upstreamToken = String(process.env.PAYMENT_OCR_UPSTREAM_TOKEN || '').trim();
  if (!upstreamBase) {
    return res.status(500).json({
      error: 'PAYMENT_OCR_UPSTREAM_URL is not configured',
    });
  }

  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return res.status(400).json({ error: 'Expected multipart/form-data' });
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const upstreamRes = await fetch(`${upstreamBase}/extract-payment-order`, {
      method: 'POST',
      headers: {
        'content-type': contentType,
        ...(upstreamToken ? { 'x-ocr-token': upstreamToken } : {}),
      },
      body,
    });

    const responseText = await upstreamRes.text();
    const upstreamContentType = String(upstreamRes.headers.get('content-type') || 'application/json');

    res.status(upstreamRes.status);
    res.setHeader('Content-Type', upstreamContentType);
    return res.send(responseText);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Proxy request failed';
    return res.status(502).json({ error: message });
  }
};
