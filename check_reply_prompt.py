import json

with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

for n in w.get('nodes', []):
    if n.get('name') == 'Reply AI':
        print(f"Node Name: {n['name']}")
        # The prompt is in jsonBody
        print(f"JSON Body: {json.dumps(n['parameters'].get('jsonBody', ''), indent=2)}")
