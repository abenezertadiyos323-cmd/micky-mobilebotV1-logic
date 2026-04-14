import json

with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

for n in w.get('nodes', []):
    if 'Product Search' in n.get('name', ''):
        print(f"Node Name: {n['name']}")
        print(f"Parameters: {json.dumps(n['parameters'], indent=2)}")
