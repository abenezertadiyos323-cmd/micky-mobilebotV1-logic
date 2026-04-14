import json

def process():
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    nodes = data.get('data', {}).get('nodes', [])
    if not nodes and 'nodes' in data:
        nodes = data['nodes']

    for node in nodes:
        node_name = node['name']
        
        if node_name in ['Understanding JSON Guard - Pure Validator', 'Validation', 'Session Save']:
            if node_name == 'Session Save':
                print(f"--- {node_name} ---")
                print(node.get('parameters', {}).get('jsonBody', ''))
            elif 'code' in node.get('type', '').lower():
                code = node.get('parameters', {}).get('jsCode', '')
                print(f"--- {node_name} ---")
                # Print lines containing $item or $node
                for idx, line in enumerate(code.split('\n')):
                    if '$node' in line or '$item' in line:
                        print(f"L{idx}: {line.strip()}")

process()
