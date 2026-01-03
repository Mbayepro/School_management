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
  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ error: 'Missing email' });
    return;
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const admin = supabase.auth.admin;
  let userId;
  try {
    const { data: list } = await admin.listUsers({ page: 1, perPage: 1000 });
    const found = list?.users?.find((u) => u.email === email);
    if (found) {
      userId = found.id;
    } else {
      const tempPassword = genPassword();
      const { data: createRes, error: createErr } = await admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
      });
      if (createErr) {
        return res.status(400).json({ error: createErr.message });
      }
      userId = createRes.user?.id;
    }
    let ecoleId;
    const { data: ecole, error: ecoleErr } = await supabase
      .from('ecoles')
      .select('*')
      .eq('nom', 'Administration')
      .limit(1)
      .maybeSingle();
    if (ecoleErr) {
      return res.status(400).json({ error: ecoleErr.message });
    }
    if (ecole) {
      ecoleId = ecole.id;
    } else {
      const { data: createdEcole, error: createEcoleErr } = await supabase
        .from('ecoles')
        .insert([{ nom: 'Administration', telephone: null, active: true }])
        .select()
        .single();
      if (createEcoleErr) {
        return res.status(400).json({ error: createEcoleErr.message });
      }
      ecoleId = createdEcole.id;
    }
    const { data: profRes, error: profErr } = await supabase
      .from('profiles')
      .upsert([{ id: userId, role: 'super_admin', ecole_id: ecoleId }], { onConflict: 'id' })
      .select()
      .single();
    if (profErr) {
      return res.status(400).json({ error: profErr.message });
    }
    return res.json({ ok: true, userId, ecoleId, email });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Internal error' });
  }
}
