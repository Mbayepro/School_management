import { createClient } from '@supabase/supabase-js';

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
  const { nom, telephone } = req.body || {};
  if (!nom || typeof nom !== 'string') {
    res.status(400).json({ error: 'Invalid nom' });
    return;
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await supabase
    .from('ecoles')
    .insert([{ nom, telephone, active: true }])
    .select()
    .single();
  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }
  res.json({ ecole: data });
}
