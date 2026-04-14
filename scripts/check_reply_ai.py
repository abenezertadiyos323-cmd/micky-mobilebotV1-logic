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

    out = []
    for node in nodes:
        node_name = node['name']
        if node_name == 'Validation':
            params = node.get('parameters', {})
            out.append("--- Validation Code ---")
            code = params.get('jsCode', '')
            out.append(code)
            
        if node_name == 'Telegram Send':
            out.append("--- Telegram Send Parameters ---")
            out.append(str(node.get('parameters', {})))
            
    with open('scripts/reply_ai_output.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

process()
