import json
import re

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
        nodes = []

    out = [f'Total nodes: {len(nodes)}']

    for node in nodes:
        ntype = node.get('type', '')
        name = node.get('name', '')
        params = node.get('parameters', {})
        param_str = str(params)
        
        # 1. ARCHITECTURE COMPLIANCE / CODE NODE AUDIT
        if 'code' in ntype.lower():
            code = params.get('jsCode', '')
            lines = len(code.split('\n'))
            has_biz = 'price' in code or 'inventory' in code or 'stock' in code or 'product' in code
            state_mut = '$session' in code or 'context' in code
            out.append(f"CODE NODE: [{name}] - Lines: {lines} - Contains BizLogic? {has_biz} - Mutates State? {state_mut}")
            
        # 3. FRAGILE DEPS
        fragile_matches = set(re.findall(r'\$node\[["\']?([^"\'\]]+)["\']?\]', param_str))
        if fragile_matches:
            out.append(f"FRAGILE: [{name}] depends on nodes via $node: {fragile_matches}")

        # 4, 5, 8. HTTP / CONVEX / AI
        if 'httpRequest' in ntype.lower():
            url = params.get('url', '')
            method = params.get('method', 'GET')
            # Look inside expressions for URL
            if str(url).startswith('='):
                url = params.get('url', 'EXPRESSION')
            out.append(f"HTTP CALL: [{name}] -> {method} {url}")
            
            pstr = json.dumps(params).lower()
            if 'openrouter' in pstr or 'gemini' in pstr or 'gpt' in pstr or 'system' in pstr or 'user' in pstr:
                out.append(f"  -> SUSPECTED AI NODE")
                if 'decide' in pstr or 'rules' in pstr or 'price' in pstr or 'logic' in pstr:
                    out.append(f"  -> WARNING: AI prompt contains business logic/rules references.")

        # 7. ERROR HANDLING
        if node.get('onError'):
            out.append(f"ERROR_HANDLING: [{name}] has {node.get('onError')}")
        if node.get('retryOnFail'):
            out.append(f"ERROR_HANDLING: [{name}] has retryOnFail=true")

    with open('audit_results_utf8.txt', 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

run()
