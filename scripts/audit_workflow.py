import json
import re
import sys

def run():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except:
        with open('exported_active_workflows.json', 'r', encoding='utf-8') as f:
            data = json.load(f)

    if isinstance(data, dict) and 'data' in data:
        nodes = data['data'].get('nodes', [])
    elif isinstance(data, list) and len(data) > 0 and 'nodes' in data[0]:
        nodes = data[0]['nodes']
    elif isinstance(data, dict) and 'nodes' in data:
        nodes = data['nodes']
    else:
        print('Could not find nodes array.')
        sys.exit(1)

    print(f'Total nodes: {len(nodes)}')

    code_nodes = []
    ai_nodes = []
    http_nodes = []

    fragile_refs = []
    for node in nodes:
        ntype = node.get('type', '')
        pvals = str(node.get('parameters', {}))
        
        # Check for fragile references like $node["..."]
        fragile_matches = re.findall(r'\$node\[.*?\]', pvals)
        if fragile_matches:
            fragile_refs.append({'node': node['name'], 'refs': fragile_matches})
            
        if 'Code' in ntype:
            code_str = node.get('parameters', {}).get('jsCode', '')
            lines = len(code_str.split('\n'))
            # Rough heuristic for business logic
            biz_indicator = 'price' in code_str or 'product' in code_str or 'inventory' in code_str
            state_indicator = 'session' in code_str or 'context' in code_str
            code_nodes.append({'name': node['name'], 'lines': lines, 'biz_risk': biz_indicator, 'state_risk': state_indicator})
        elif 'agent' in ntype.lower() or 'openai' in ntype.lower() or 'router' in ntype.lower() or 'ai' in ntype.lower() or 'groq' in ntype.lower() or 'ollama' in ntype.lower() or 'anthropic' in ntype.lower():
            ai_nodes.append({'name': node['name'], 'type': ntype, 'params': node.get('parameters', {})})
        elif 'HttpRequest' in ntype:
            http_nodes.append({'name': node['name'], 'params': node.get('parameters', {})})

    print('\n--- CODE NODES ---')
    for c in code_nodes:
        print(f"[{c['name']}] Lines: {c['lines']} | Biz Logic Risk: {c['biz_risk']} | State Store Risk: {c['state_risk']}")

    print('\n--- FRAGILE REF CHECK ---')
    if not fragile_refs:
        print("No fragile $node references found.")
    for f in fragile_refs:
        print(f"[{f['node']}] fragile refs: {set(f['refs'])}")

    print('\n--- HTTP/CONVEX CALLS ---')
    for h in http_nodes:
        url = h['params'].get('url', 'N/A')
        method = h['params'].get('method', 'GET')
        print(f"[{h['name']}] {method} {url}")
        if 'json' not in str(h['params']):
            pass

    print('\n--- AI USAGE ---')
    for a in ai_nodes:
        sys_msg = str(a['params'])
        biz_logic = 'decide' in sys_msg.lower() or 'price' in sys_msg.lower()
        print(f"[{a['name']}] - Biz logic in prompt? {biz_logic}")

    print('\n--- ERROR HANDLING ---')
    for node in nodes:
        if node.get('onError') == 'continueErrorOutput':
            print(f"[{node['name']}] continueOnFail=true")
        if node.get('retryOnFail'):
            print(f"[{node['name']}] retryOnFail=true")

if __name__ == '__main__':
    run()
