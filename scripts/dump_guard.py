import json

def process():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error:", e)
        return

    nodes = data.get('data', {}).get('nodes', [])
    if not nodes and 'nodes' in data:
        nodes = data['nodes']

    for node in nodes:
        node_name = node['name']
        if node_name == 'Understanding JSON Guard - Pure Validator':
            params = node.get('parameters', {})
            code = params.get('jsCode', '')
            with open("scripts/JSON_Guard.js", 'w', encoding='utf-8') as sf:
                sf.write(code)

process()
