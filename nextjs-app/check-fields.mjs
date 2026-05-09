import { createClient } from '@supabase/supabase-js';

const URL = 'https://nlhhktqhupqnxnjxwqzd.supabase.co';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5saGhrdHFodXBxbnhuanh3cXpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzk5NzI1MiwiZXhwIjoyMDkzNTczMjUyfQ.WmMiO-3RATmCydfs74WhIPvtRZkMWjCi17ZMltIW7n0';

const supabase = createClient(URL, KEY);

async function main() {
  // Check if account_fields table exists
  const { data, error } = await supabase.from('account_fields').select('*').order('sort_order');
  console.log('Error:', error?.message || 'none');
  console.log('Fields count:', data?.length);
  console.log('Fields:', JSON.stringify(data, null, 2));

  // Check accounts table structure
  const { data: sample } = await supabase.from('accounts').select('*').limit(1);
  console.log('\nAccounts sample keys:', sample?.[0] ? Object.keys(sample[0]) : 'none');
}

main().catch(console.error);
