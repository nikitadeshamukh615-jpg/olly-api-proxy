// Vercel serverless function — POST /api/chat
// Keeps the AI provider's API key on the server, never sent to the browser.
// Deploy this as its own tiny Vercel project (separate from the main app),
// set GROQ_API_KEY as an Environment Variable in the Vercel dashboard
// (Project Settings -> Environment Variables), then point the app's
// PROXY_SERVER constant at this project's URL.

// ---- very simple in-memory rate limiter ----
// Limits each visitor (by IP) to a max number of requests per minute.
// NOTE: this resets whenever the serverless function cold-starts, so it's a
// basic first line of defense, not a hard guarantee — for strict enforcement
// per logged-in user, do the real check against Supabase (see notes below).
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = hits.get(ip) || { count: 0, resetAt: now + WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + WINDOW_MS;
  }
  entry.count += 1;
  hits.set(ip, entry);
  return entry.count > MAX_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests — thoda ruk kar dobara try karo.' });
  }

  const { message, history } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message is required' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server not configured (missing GROQ_API_KEY)' });

  const messages = [
    ...(Array.isArray(history) ? history.slice(-8) : []),
    { role: 'user', content: message }
  ];

  try {
    const upstream = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 2048
      })
    });
    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.error?.message || 'Upstream error' });
    }
    const reply = data.choices?.[0]?.message?.content || 'No response received';
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
