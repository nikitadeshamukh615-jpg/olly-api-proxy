// Vercel serverless function — POST /api/delete-account
// Permanently deletes a user's Supabase auth account. This requires the
// service_role key (regular users can't delete their own auth.users row),
// so it has to run on the server — same env vars as verify-payment.js.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { user_id } = req.body || {};
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server not configured (missing Supabase service credentials)' });
  }

  try {
    const delRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user_id}`, {
      method: 'DELETE',
      headers: {
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`
      }
    });
    if (!delRes.ok && delRes.status !== 404) {
      const errText = await delRes.text();
      return res.status(500).json({ error: 'Could not delete account: ' + errText });
    }
    return res.status(200).json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Server error' });
  }
};
