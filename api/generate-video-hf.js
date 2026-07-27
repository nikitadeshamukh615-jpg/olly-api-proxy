// Vercel serverless function — POST /api/generate-video-hf
// Calls Hugging Face's free serverless Inference API server-side, since
// calling it directly from the browser hits a CORS block (same issue we
// saw with AINative). Returns the video as a base64 data URL since we
// have no file storage to put it in.
//
// Environment variable needed in Vercel:
//   HF_API_KEY - same free Hugging Face token used in the app

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    const prompt = body && body.prompt;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    const apiKey = process.env.HF_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server not configured (missing HF_API_KEY)' });

    const model = 'Wan-AI/Wan2.2-T2V-A14B';
    const url = 'https://router.huggingface.co/fal-ai/fal-ai/wan/v2.2-a14b/text-to-video';

    let upstream;
    for (let attempt = 0; attempt < 2; attempt++) {
      console.log(`[generate-video-hf] attempt ${attempt}, calling HF router (fal-ai)...`);
      upstream = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt })
      });
      console.log(`[generate-video-hf] HF responded with status ${upstream.status}`);
      if (upstream.status === 503) {
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
      console.log(`[generate-video-hf] HF error body: ${errText.slice(0, 300)}`);
      return res.status(upstream.status).json({ error: `HF error (${upstream.status}): ${errText.slice(0, 200)}` });
    }

    // fal-ai's response format returns a JSON object with a video URL
    // rather than raw video bytes (unlike the old classic endpoint).
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await upstream.json();
      const videoUrl = data.video?.url || data.url || data.output?.url;
      console.log(`[generate-video-hf] JSON response, video URL: ${videoUrl}`);
      if (!videoUrl) return res.status(500).json({ error: 'HF ne video URL nahi diya: ' + JSON.stringify(data).slice(0, 200) });
      return res.status(200).json({ video_url: videoUrl });
    }

    const arrayBuffer = await upstream.arrayBuffer();
    console.log(`[generate-video-hf] received ${arrayBuffer.byteLength} bytes`);
    if (arrayBuffer.byteLength < 1000) {
      return res.status(500).json({ error: 'HF ne khaali/invalid response diya.' });
    }
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = `data:video/mp4;base64,${base64}`;
    return res.status(200).json({ video_url: dataUrl });
  } catch (err) {
    console.error('[generate-video-hf] CRASH:', err && err.stack ? err.stack : err);
    return res.status(500).json({ error: 'Server crash: ' + (err && err.message ? err.message : String(err)) });
  }
};
