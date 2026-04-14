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
        if node_name in ['Rules Layer', 'Business Data Resolver', 'Validation']:
            params = node.get('parameters', {})
            code = params.get('jsCode', '')
            out = []
            for i, line in enumerate(code.split('\n')):
                if 'session' in line.lower() or 'update' in line.lower() or 'history' in line.lower():
                    out.append(f"L{i}: {line.strip()}")
            with open(f"scripts/{node_name.replace(' ', '_')}_state.txt", 'w', encoding='utf-8') as sf:
                sf.write('\n'.join(out))

process()
