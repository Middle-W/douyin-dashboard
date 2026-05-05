import { createClient } from '@supabase/supabase-js';

const url = 'https://nlhhktqhupqnxnjxwqzd.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5saGhrdHFodXBxbnhuanh3cXpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzk5NzI1MiwiZXhwIjoyMDkzNTczMjUyfQ.WmMiO-3RATmCydfs74WhIPvtRZkMWjCi17ZMltIW7n0';

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkTable(name) {
  const { data, error } = await supabase.from(name).select('id').limit(1);
  return !error;
}

async function init() {
  const tables = ['accounts', 'daily_stats', 'uploads'];
  const missing = [];
  for (const t of tables) {
    const exists = await checkTable(t);
    console.log(`Table ${t}: ${exists ? 'EXISTS' : 'MISSING'}`);
    if (!exists) missing.push(t);
  }
  
  if (missing.length > 0) {
    console.log('\n⚠️ 以下表未创建:', missing.join(', '));
    console.log('请手动到 Supabase SQL Editor 执行 sql/init.sql 中的建表语句');
  } else {
    console.log('\n✅ 所有表已就绪！');
  }
}

init().catch(console.error);
