import json
with open('/tmp/douyin-pending-errors/costs-2026-05-18-2026-05-18T16-15-39-473Z.json') as f:
    d = json.load(f)
    print('Type:', d['type'])
    print('Date:', d['date'])
    print('Error:', d['error'])
    print('Unmatched count:', len(d['unmatched']))
    print('Sample unmatched:', d['unmatched'][:20])
