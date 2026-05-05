# -*- coding: utf-8 -*-
import openpyxl, requests, json, os
from collections import defaultdict

URL = 'https://nlhhktqhupqnxnjxwqzd.supabase.co'
KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5saGhrdHFodXBxbnhuanh3cXpkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Nzk5NzI1MiwiZXhwIjoyMDkzNTczMjUyfQ.WmMiO-3RATmCydfs74WhIPvtRZkMWjCi17ZMltIW7n0'

headers = {
    'Authorization': f'Bearer {KEY}',
    'apikey': KEY,
    'Content-Type': 'application/json',
    'Prefer': 'resolution=merge-duplicates'
}

def upsert_accounts(accounts):
    """Insert/update accounts"""
    payload = [{'name': name, 'operator': data.get('operator',''), 'account_type': data.get('type','混剪'), 'buyer': data.get('buyer',''), 'status': data.get('status','')} for name, data in accounts.items()]
    res = requests.post(f'{URL}/rest/v1/accounts', headers={**headers, 'Prefer': 'resolution=merge-duplicates,return=minimal'}, json=payload)
    print('Accounts upsert:', res.status_code)
    if res.status_code not in [200, 201]:
        print(res.text[:200])

def insert_daily_stats(stats):
    """Insert daily stats"""
    # Batch in chunks of 1000
    chunk_size = 1000
    for i in range(0, len(stats), chunk_size):
        chunk = stats[i:i+chunk_size]
        res = requests.post(f'{URL}/rest/v1/daily_stats', headers={**headers, 'Prefer': 'resolution=merge-duplicates,return=minimal'}, json=chunk)
        print(f'Daily stats batch {i//chunk_size + 1}:', res.status_code)
        if res.status_code not in [200, 201]:
            print(res.text[:200])

def main():
    print('Reading Excel files...')
    
    # 1. Read orders Excel
    wb = openpyxl.load_workbook('../jingxuan_orders_2026050602293354.xlsx')
    ws = wb.active
    
    accounts = defaultdict(lambda: {'operator': '', 'type': '小店', 'daily': defaultdict(int), 'totalIncome': 0, 'totalAmount': 0})
    
    for row in ws.iter_rows(min_row=2, values_only=True):
        account_raw = row[11]
        pay_time = row[3]
        operator = row[15] or ''
        account_type = row[16] or ''
        try:
            income = float(row[10] or 0)
        except:
            income = 0
        try:
            amount = float(row[7] or 0)
        except:
            amount = 0
        
        if not account_raw or not pay_time:
            continue
        
        account = str(account_raw).split('(')[0].strip()
        date = str(pay_time)[:10]
        
        accounts[account]['operator'] = operator or accounts[account]['operator']
        accounts[account]['type'] = account_type or accounts[account]['type']
        accounts[account]['daily'][date] += 1
        accounts[account]['totalIncome'] += income
        accounts[account]['totalAmount'] += amount
    
    # 2. Read meta Excel
    try:
        wb_meta = openpyxl.load_workbook('../抖音账号基础信息.xlsx')
        for row in wb_meta.active.iter_rows(min_row=2, values_only=True):
            name, typ, status, buyer = row
            if name and name in accounts:
                accounts[name]['buyer'] = buyer or ''
                accounts[name]['status'] = status or ''
                accounts[name]['type'] = typ or '混剪'
    except Exception as e:
        print('Meta read error:', e)
    
    print(f'Found {len(accounts)} accounts')
    
    # 3. Prepare data
    account_payload = {}
    stats_payload = []
    
    for acc, data in accounts.items():
        account_payload[acc] = {
            'operator': data['operator'],
            'type': data['type'],
            'buyer': data.get('buyer', ''),
            'status': data.get('status', '')
        }
        for date, orders in data['daily'].items():
            stats_payload.append({
                'account_name': acc,
                'date': date,
                'orders': orders,
                'income': round(data['totalIncome'], 2),
                'amount': round(data['totalAmount'], 2)
            })
    
    print(f'Inserting {len(account_payload)} accounts, {len(stats_payload)} daily records...')
    
    # 4. Insert to Supabase
    upsert_accounts(account_payload)
    insert_daily_stats(stats_payload)
    
    print('Done!')

if __name__ == '__main__':
    main()
