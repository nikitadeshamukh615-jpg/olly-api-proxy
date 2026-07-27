// Vercel serverless function — POST /api/generate-video-hf
// Calls Hugging Face's free serverless Inference API server-side, since
// calling it directly from the browser hits a CORS block (same issue we
// saw with AINative). Returns the video as a base64 data URL since we
// have no file storage to put it in.
//
// Environment variable needed in Vercel:
//   HF_API_KEY - same free Hugging Face token used in the app

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt is required' });

  const apiKey = process.env.HF_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server not configured (missing HF_API_KEY)' });

  const model = 'ali-vilab/text-to-video-ms-1.7b';
  const url = `https://api-inference.huggingface.co/models/${model}`;

  try {
    let upstream;
    for (let attempt = 0; attempt < 4; attempt++) {
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: prompt })
      });
      if (upstream.status === 503) {
        // Model cold-starting on HF's shared free pool — wait and retry.
        await new Promise((r) => setTimeout(r, 8000));
        continue;
      }
      break;
    }

    if (upstream.status === 429) {
      return res.status(429).json({ error: 'HF free tier rate-limited abhi — thodi der baad try karo.' });
    }
    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => '');
      return res.status(upstream.status).json({ error: `HF error (${upstream.status}): ${errText.slice(0, 200)}` });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    if (arrayBuffer.byteLength < 1000) {
      return res.status(500).json({ error: 'HF ne khaali/invalid response diya.' });
    }
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:video/mp4;base64,${base64}`;
    return res.status(200).json({ video_url: dataUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
