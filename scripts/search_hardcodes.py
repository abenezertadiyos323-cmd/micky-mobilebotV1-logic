import json

def check_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
        return
    
    if isinstance(data, dict):
        nodes = data.get('data', {}).get('nodes', [])
        if not nodes:
            nodes = data.get('nodes', [])
    elif isinstance(data, list):
        nodes = data[0].get('nodes', []) if data and isinstance(data[0], dict) else []
    else:
        nodes = []
        
    found = False
    for node in nodes:
        params_str = json.dumps(node.get('parameters', {}))
        if 'TedyTech' in params_str or 'client_config' in params_str or 'store_name' in params_str:
            print(f"[{filepath}] Found in node: {node['name']}")
            found = True
            
    if not found:
        print(f"[{filepath}] No occurrences found.")

check_file('active_workflow_hc55q2zfas7gG1yu.json')
check_file('exported_active_workflows.json')
check_file('workflow.json')
