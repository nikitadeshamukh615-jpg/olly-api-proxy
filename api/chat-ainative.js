// Vercel serverless function — POST /api/chat-ainative
// Calls AINative Studio's free chat completions API (10M tokens/month,
// no card required) server-side — routed through our proxy in case
// AINative blocks direct browser/CORS requests the same way their video
// endpoint does.
//
// Environment variable needed in Vercel:
//   AINATIVE_API_KEY - same key already used for video generation

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { message, history } = req.body || {};
  if (!message) return res.status(400).json({ error: 'message is required' });

  const apiKey = process.env.AINATIVE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server not configured (missing AINATIVE_API_KEY)' });

  const messages = [
    ...(Array.isArray(history) ? history.slice(-8) : []),
    { role: 'user', content: message }
  ];

  try {
    const upstream = await fetch('https://api.ainative.studio/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        messages
      })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: (data.error && data.error.message) || `AINative error (${upstream.status})` });
    }
    const reply = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!reply) return res.status(500).json({ error: 'AINative se jawab nahi mila' });
    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
