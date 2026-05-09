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
  const costs = await query('daily_costs', 'date,account_name,cost', '&limit=1000&order=date.desc');
  if (!Array.isArray(costs)) {
    console.log('Error:', JSON.stringify(costs, null, 2));
    return;
  }

  console.log('Total cost records:', costs.length);

  const dateSet = new Set();
  const dateCounts = {};
  for (const c of costs) {
    dateSet.add(c.date);
    dateCounts[c.date] = (dateCounts[c.date] || 0) + 1;
  }

  const sortedDates = Array.from(dateSet).sort();
  console.log('Date range:', sortedDates[0], 'to', sortedDates[sortedDates.length - 1]);
  console.log('Dates:');
  for (const d of sortedDates) {
    console.log(`  ${d}: ${dateCounts[d]} records`);
  }
}

check().catch(console.error);
