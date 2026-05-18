const { createClient } = require('@supabase/supabase-js');
const s = createClient('https://fpfghclqrmqevvxylnyg.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwZmdoY2xxcm1xZXZ2eHlsbnlnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTAwNzE4MiwiZXhwIjoyMDk0NTgzMTgyfQ.TnSPIuZ_rHn1G8tvFpkP139RIl5qhazsRVCUvYJzLdE');

async function main() {
  const keywords = ['千里','启星','博达','小君','珠珠','暖猫','80妙妙','好心情','花椒'];
  
  for (const kw of keywords) {
    const { data } = await s.from('accounts').select('name').ilike('name', '%' + kw + '%');
    console.log(kw + ':', data?.map(a=>a.name).join(', ') || 'NOT FOUND');
  }
}
main();
