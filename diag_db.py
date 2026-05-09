import os
from supabase import create_client
from collections import Counter

url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or 'https://nlhhktqhupqnxnjxwqzd.supabase.co'
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

supabase = create_client(url, key)

print('=== UPLOADS TABLE (last 5) ===')
res = supabase.table('uploads').select('*').order('created_at', desc=True).limit(5).execute()
for u in res.data:
    print(f"  {u.get('created_at')}: {u.get('filename')} | accounts={u.get('account_count')} | {u.get('date_from')} to {u.get('date_to')}")

print()
print('=== DAILY_STATS DATE DISTRIBUTION ===')
res = supabase.table('daily_stats').select('date').order('date').execute()
all_dates = [r['date'] for r in res.data]
counts = Counter(all_dates)
for d in sorted(counts.keys()):
    print(f'  {d}: {counts[d]} accounts')

print()
print(f'Total daily_stats rows: {len(res.data)}')
print(f'Unique dates: {len(counts)}')
