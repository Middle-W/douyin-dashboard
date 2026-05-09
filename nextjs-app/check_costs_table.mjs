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
  const costs = await query('daily_costs', '*', '&limit=20&order=date.desc');
  if (!Array.isArray(costs)) {
    console.log('Error:', JSON.stringify(costs, null, 2));
    return;
  }
  console.log('Total records:', costs.length);
  if (costs.length > 0) {
    console.log('Sample rows:');
    for (const c of costs.slice(0, 5)) {
      console.log(`  ${c.date} | ${c.account_name} | cost=${c.cost}`);
    }
    const dates = [...new Set(costs.map(c => c.date))].sort();
    console.log('Dates found:', dates);
  }
}

check().catch(console.error);
