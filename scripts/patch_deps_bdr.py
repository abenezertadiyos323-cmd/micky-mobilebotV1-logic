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
    
    for node in nodes:
        node_name = node['name']
        ntype = node.get('type')
        params = node.get('parameters', {})

        if node_name == 'Business Data Resolver' and 'code' in ntype.lower():
            code = params.get('jsCode', '')
            # Could be $node[RULES_NODE] or $node['Rules Layer']
            new_code = re.sub(r'\$item\(0\)\.\$node\[RULES_NODE\]\.json|\$node\[RULES_NODE\]\.json', '$json', code)
            if new_code != code:
                params['jsCode'] = new_code
                report.append(f"- **{node_name}**: Removed FRAGILE `$node[RULES_NODE]` reference. Switched to reading directly from `$json`.")
                
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('patch_report_deps2.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))

process()
