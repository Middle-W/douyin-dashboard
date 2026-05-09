import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : '';
};

const URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') + '/rest/v1/';
const KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

async function del(startDate, endDate) {
  const res = await fetch(`${URL}daily_costs?date=gte.${startDate}&date=lte.${endDate}`, {
    method: 'DELETE',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  });
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('Response:', text || '(empty)');
}

const start = process.argv[2] || '2026-04-30';
const end = process.argv[3] || '2026-05-05';
console.log(`Deleting daily_costs from ${start} to ${end}...`);
del(start, end);
