import json
import re

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

    report = []
    
    # Track exactly what was replaced to output in final message
    # 1. Understanding JSON Guard
    # 2. Validation
    # 3. Session Save
    
    for node in nodes:
        node_name = node['name']
        ntype = node.get('type')
        params = node.get('parameters', {})
        
        changed = False

        if node_name == 'Understanding JSON Guard - Pure Validator' and 'code' in ntype.lower():
            code = params.get('jsCode', '')
            # replace const base = $item(0).$node['Session Bootstrap'].json ...
            # or const ref = $item(0).$node[SESSION_BOOTSTRAP_NODE].json;
            new_code = re.sub(r'const [a-zA-Z0-9_]+ = \$item\(0\)\.\$node\[[^\]]+\]\.json;', 'const base = $json;', code)
            new_code = new_code.replace('const ref = base;', '') # if there's any chaining
            
            # Specifically fix the dynamic loading
            if 'SESSION_BOOTSTRAP_NODE' in code:
                # We substitute generic $json
                new_code = re.sub(r'\$item\(0\)\.\$node\[SESSION_BOOTSTRAP_NODE\]\.json', '$json', code)
                
            # If there's a try/catch block for $node['Session Bootstrap']
            new_code = re.sub(
                r'return \$item\(0\)\.\$node\[\'Session Bootstrap\'\]\.json \?\? \{\};',
                r'return $json ?? {};',
                new_code
            )

            if new_code != code:
                params['jsCode'] = new_code
                changed = True
                report.append(f"- **{node_name}**: Removed FRAGILE `$node` reference to Session Bootstrap. Switched to reading directly from `$json`.")

        elif node_name == 'Business Data Resolver' and 'code' in ntype.lower():
            code = params.get('jsCode', '')
            new_code = re.sub(r'\$item\(0\)\.\$node\[\'Rules Layer\'\]\.json', '$json', code)
            if new_code != code:
                params['jsCode'] = new_code
                changed = True
                report.append(f"- **{node_name}**: Removed FRAGILE `$node['Rules Layer']` reference. Switched to reading directly from `$json`.")

        elif node_name == 'Validation' and 'code' in ntype.lower():
            code = params.get('jsCode', '')
            new_code = re.sub(r'\$item\(0\)\.\$node\[\'Business Data Resolver\'\]\.json', '$json', code)
            new_code = re.sub(r'\$item\(0\)\.\$node\[\'Rules Layer\'\]\.json', '$json', new_code)
            if new_code != code:
                params['jsCode'] = new_code
                changed = True
                report.append(f"- **{node_name}**: Removed FRAGILE `$node['Business Data Resolver']` and `$node['Rules Layer']` references. Switched to assigning variables from `$json`.")

        elif node_name == 'Session Save':
            json_body = params.get('jsonBody', '')
            new_body = re.sub(r'\$item\(0\)\.\$node\[\'Validation\'\]\.json', '$json', json_body)
            if new_body != json_body:
                params['jsonBody'] = new_body
                changed = True
                report.append(f"- **{node_name}**: Removed FRAGILE `$node['Validation']` mapping. Now stringifying `$json.session_update_payload` recursively.")

        elif node_name == 'Callback Session Save':
            json_body = params.get('jsonBody', '')
            new_body = re.sub(r'\$item\(0\)\.\$node\[\'Callback Action Handler\'\]\.json', '$json', json_body)
            if new_body != json_body:
                params['jsonBody'] = new_body
                changed = True
                report.append(f"- **{node_name}**: Removed FRAGILE `$node['Callback Action Handler']` mapping. Switched to `$json` directly.")
                
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('patch_report_deps.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))

process()
