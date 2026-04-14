import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf.get('nodes', [])
guard_node = next((n for n in nodes if 'Understanding JSON Guard' in n.get('name', '')), None)

if guard_node:
    print('=== NODE FOUND ===')
    print('Name:', guard_node.get('name'))
    print('Type:', guard_node.get('type'))
    print('\n=== FULL NODE JSON ===')
    print(json.dumps(guard_node, indent=2))
else:
    print('No node matching "Understanding JSON Guard" found.')
