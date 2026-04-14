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
        params_str = json.dumps(node.get('parameters', {}))
        
        idx = params_str.find('$node')
        if idx != -1:
            print(f"[{node_name}] -> {params_str[idx-20:idx+40]}")

process()
