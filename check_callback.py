import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

for n in w.get('nodes', []):
    if n['name'] in ['Callback Action Handler', 'Callback Telegram Send', 'Admin Handoff Notify?', 'Admin Handoff Telegram Send', 'Confirmed Handoff IF']:
        print(f"\n--- {n['name']} ---")
        print(json.dumps(n['parameters'], indent=2)[:1000])

print('\nConnections from Callback Action Handler:')
print(json.dumps(w.get('connections', {}).get('Callback Action Handler', {}), indent=2))

print('\nConnections from Callback Action?:')
print(json.dumps(w.get('connections', {}).get('Callback Action?', {}), indent=2))
