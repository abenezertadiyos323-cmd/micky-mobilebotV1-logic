import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

for n in w.get('nodes', []):
    if n.get('name') == 'Business Data Resolver':
        code = n.get('parameters', {}).get('jsCode') or n.get('parameters', {}).get('code')
        with open('local_workflow_bdr.js', 'w', encoding='utf-8') as f2:
            f2.write(code)
        print(f"BDR in workflow.json: {len(code)} bytes")
