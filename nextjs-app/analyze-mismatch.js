const { createClient } = require('@supabase/supabase-js');
const xlsx = require('xlsx');
const s = createClient('https://fpfghclqrmqevvxylnyg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZmdoY2xxcm1xZXZ2eHlsbnlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTAwNzE4MiwiZXhwIjoyMDk0NTgzMTgyfQ.TnSPIuZ_rHn1G8tvFpkP139RIl5qhazsRVCUvYJzLdE');

async function main() {
  const wb = xlsx.readFile('C:\\Users\\W\\Desktop\\总公司账号汇总表.xlsx');
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });
  
  const excelNames = new Set();
  for (let i = 1; i < rows.length; i++) {
    const name = String(rows[i][0] || '').trim();
    if (name) excelNames.add(name);
  }
  
  const { data: dbAccounts } = await s.from('accounts').select('name');
  const dbNames = new Set((dbAccounts || []).map(a => a.name));
  
  const pending = JSON.parse(require('fs').readFileSync('C:\\Users\\W\\Desktop\\pending-0518.json'));
  const unmatchedSet = new Set(pending.unmatched || []);
  
  console.log('Excel账号总数:', excelNames.size);
  console.log('数据库账号总数:', dbNames.size);
  console.log('未匹配总数:', unmatchedSet.size);
  console.log('');
  
  // 分析未匹配的账号
  let inExcel = 0, notInExcel = 0;
  for (const name of unmatchedSet) {
    if (excelNames.has(name)) {
      inExcel++;
      console.log('在Excel但数据库没匹配:', name);
    } else {
      notInExcel++;
    }
  }
  
  console.log('');
  console.log('未匹配账号中:');
  console.log('  在Excel里:', inExcel);
  console.log('  不在Excel里:', notInExcel);
  console.log('  (说明: 不在Excel=抖川有但Excel没录入=数据库没这个账号)');
}

main();
