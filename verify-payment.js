// Vercel serverless function — POST /api/verify-payment
// Verifies a Razorpay payment signature on the SERVER (never trust the
// browser alone for this — anyone could otherwise call your "activate
// premium" code from the browser console without paying). On success,
// writes the user's premium status into Supabase using the service_role
// key, which is the only thing allowed to write to that table (see
// supabase-usage-limit.sql — regular users can only read their own row).
//
// Environment variables needed in Vercel (Project Settings -> Environment Variables):
//   RAZORPAY_KEY_SECRET   - from Razorpay Dashboard -> Settings -> API Keys
//   SUPABASE_URL          - same as SUPABASE_URL in the app
//   SUPABASE_SERVICE_ROLE_KEY - Supabase Dashboard -> Settings -> API -> "service_role" key
//                                (NOT the anon key — this one is secret, server-only)

const crypto = require('crypto');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    plan_id, // 'weekly' | 'monthly' | 'yearly'
    user_id  // the logged-in Supabase user's id, sent from the app
  } = req.body || {};

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !plan_id || !user_id) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return res.status(500).json({ error: 'Server not configured (missing RAZORPAY_KEY_SECRET)' });

  // This is the actual verification: Razorpay signs order_id + payment_id
  // with your secret key. We recompute that signature ourselves and check
  // it matches what came back — only Razorpay (who has the real secret)
  // could have produced a matching signature, so this can't be faked.
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: 'Payment verification failed — signature mismatch' });
  }

  const days = plan_id === 'weekly' ? 7 : (plan_id === 'monthly' ? 30 : 365);
  const expiresAt = new Date(Date.now() + days * 86400000).toISOString();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured (missing Supabase service credentials)' });
  }

  try {
    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/premium_status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({ user_id, plan: plan_id, expires_at: expiresAt })
    });
    if (!upsertRes.ok) {
      const errText = await upsertRes.text();
      return res.status(500).json({ error: 'Could not save premium status: ' + errText });
    }
    return res.status(200).json({ verified: true, plan: plan_id, expires_at: expiresAt });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
