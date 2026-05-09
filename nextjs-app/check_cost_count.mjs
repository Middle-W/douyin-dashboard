import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : '';
};

const URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') + '/rest/v1/';
const KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

async function check() {
  // Get count via HEAD request
  const res = await fetch(`${URL}daily_costs?select=*&limit=1`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Prefer': 'count=exact' }
  });
  const count = res.headers.get('content-range');
  console.log('Content-Range:', count);

  // Also get latest records
  const data = await fetch(`${URL}daily_costs?select=date,account_name,cost&order=date.desc&limit=10`, {
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  }).then(r => r.json());
  console.log('Latest 10 records:');
  for (const c of data) {
    console.log(`  ${c.date} | ${c.account_name} | ${c.cost}`);
  }
}

check().catch(console.error);
