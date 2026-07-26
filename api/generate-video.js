// Vercel serverless function — POST /api/generate-video
// Calls AINative Studio's T2V endpoint server-side. This is required
// because AINative's API blocks direct browser (CORS) requests — their
// own docs only show curl/server examples, not browser fetch — so the
// call has to be relayed through our backend instead of calling
// api.ainative.studio directly from the app.
//
// Environment variable needed in Vercel:
//   AINATIVE_API_KEY - same key used in the app

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt, duration } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const apiKey = process.env.AINATIVE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server not configured (missing AINATIVE_API_KEY)' });

  try {
    const upstream = await fetch('https://api.ainative.studio/api/v1/multimodal/video/t2v', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prompt, duration: duration || 5 })
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: data.message || data.error || `AINative error (${upstream.status})` });
    }
    if (!data.video_url) return res.status(500).json({ error: 'Video ban gaya lekin URL nahi mila.' });
    return res.status(200).json({ video_url: data.video_url });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
