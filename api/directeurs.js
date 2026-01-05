import { createClient } from '@supabase/supabase-js';

function genPassword() {
  const base = Math.random().toString(36).slice(-10);
  return `${base}A1!`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const auth = req.headers.authorization || '';
  const expected = `Bearer ${process.env.ADMIN_API_TOKEN}`;
  if (auth !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const { email, ecoleId } = req.body || {};
  if (!email || !ecoleId) {
    res.status(400).json({ error: 'Missing email or ecoleId' });
    return;
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const tempPassword = genPassword();
  const { data: userRes, error: userErr } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true
  });
  if (userErr) {
    res.status(400).json({ error: userErr.message });
    return;
  }
  const userId = userRes.user?.id;
  const { error: profErr } = await supabase
    .from('profiles')
    .insert([{ id: userId, role: 'directeur', ecole_id: ecoleId }]);
  if (profErr) {
    res.status(400).json({ error: profErr.message });
    return;
  }
  res.json({ userId, email, tempPassword });
}
