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
  const accounts = await query('accounts', 'name,code', '&limit=1000');
  if (!Array.isArray(accounts)) {
    console.log('Error:', JSON.stringify(accounts, null, 2));
    return;
  }

  const empty = accounts.filter(a => !a.code || a.code === '');
  const counts = {};
  for (const a of accounts) {
    if (a.code) {
      counts[a.code] = (counts[a.code] || 0) + 1;
    }
  }
  const dupes = Object.entries(counts).filter(([k, v]) => v > 1);

  console.log('Total accounts:', accounts.length);
  console.log('Empty code:', empty.length);
  console.log('Duplicate codes:', dupes.length > 0 ? dupes : 'none');
  if (dupes.length > 0) {
    for (const [code, count] of dupes) {
      console.log(`  ${code}: ${count} accounts`);
      const names = accounts.filter(a => a.code === code).map(a => a.name);
      console.log('    Names:', names.join(', '));
    }
  }
}

check().catch(console.error);
