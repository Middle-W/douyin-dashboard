import { readFileSync } from 'fs';

const env = readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const m = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  return m ? m[1].trim() : '';
};

const URL = getEnv('NEXT_PUBLIC_SUPABASE_URL') + '/rest/v1/';
const KEY = getEnv('SUPABASE_SERVICE_ROLE_KEY');

async function check() {
  // Try to insert a duplicate to see if constraint exists
  const testPayload = { account_name: 'TEST_CONSTRAINT', date: '2099-01-01', cost: 1 };
  
  // First insert
  const res1 = await fetch(`${URL}daily_costs`, {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(testPayload)
  });
  console.log('First insert status:', res1.status);

  // Second insert (should fail if unique constraint exists)
  const res2 = await fetch(`${URL}daily_costs`, {
    method: 'POST',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(testPayload)
  });
  const text2 = await res2.text();
  console.log('Second insert status:', res2.status, 'response:', text2);

  // Cleanup
  await fetch(`${URL}daily_costs?account_name=eq.TEST_CONSTRAINT`, {
    method: 'DELETE',
    headers: { 'apikey': KEY, 'Authorization': `Bearer ${KEY}` }
  });
}

check().catch(console.error);
