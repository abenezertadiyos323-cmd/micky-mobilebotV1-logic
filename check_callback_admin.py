import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

for n in w.get('nodes', []):
    if n['name'] == 'Callback Admin Notify?':
        print(f"\n--- {n['name']} ---")
        print(json.dumps(n['parameters'], indent=2)[:1000])

print('\nConnections from Callback Admin Notify?:')
print(json.dumps(w.get('connections', {}).get('Callback Admin Notify?', {}), indent=2))
