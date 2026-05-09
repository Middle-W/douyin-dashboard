import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : '';
};

const URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') + '/rest/v1/';
const KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

async function query(table, select, params = '') {
  const res = await fetch(`${URL}${table}?select=${select}${params}`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  });
  return res.json();
}

async function check() {
  // Check all names for duplicates
  const accounts = await query('accounts', 'name', '&limit=1000');
  if (Array.isArray(accounts)) {
    const counts = {};
    for (const a of accounts) {
      counts[a.name] = (counts[a.name] || 0) + 1;
    }
    const dupes = Object.entries(counts).filter(([k,v]) => v > 1);
    console.log('Total accounts:', accounts.length);
    console.log('Unique names:', Object.keys(counts).length);
    console.log('Duplicates:', dupes.length > 0 ? dupes.slice(0, 10) : 'none');
  } else {
    console.log('Error:', JSON.stringify(accounts, null, 2));
  }
}

check().catch(console.error);
