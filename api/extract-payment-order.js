module.exports = async (req, res) => {
  const origin = req.headers.origin || '*';

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const upstreamBase = String(process.env.PAYMENT_OCR_UPSTREAM_URL || '').trim().replace(/\/+$/, '');
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
