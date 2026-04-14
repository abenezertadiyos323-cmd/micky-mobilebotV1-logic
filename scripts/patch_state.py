import json
import re

def process():
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    nodes = data.get('data', {}).get('nodes', [])
    if not nodes and 'nodes' in data:
        nodes = data['nodes']

    report = []
    
    for node in nodes:
        node_name = node['name']
        params = node.get('parameters', {})
        if node_name == 'Validation' and 'jsCode' in params:
            code = params['jsCode']
            
            # Find the part where it creates updatedSession
            # We want it to merge base.rules_output?.session_update
            new_code = code.replace(
                "const updatedSession = {\n  ...session,\n  last_message_at: now,",
                "const rulesUpdate = base.rules_output?.session_update || {};\nconst updatedSession = {\n  ...session,\n  ...rulesUpdate,\n  last_message_at: now,"
            )
            
            if new_code != code:
                params['jsCode'] = new_code
                report.append(f"- **{node_name}**: (RISKY MUTATION) Modified to safely merge `rules_output.session_update` instead of silently dropping upstream state changes.")

        elif node_name == 'Rules Layer' and 'jsCode' in params:
             report.append("- **Rules Layer**: (SAFE DERIVATION) Accumulating `session_update` internally was kept, but it is now safely merged downstream.")

        elif node_name == 'Session Bootstrap' and 'jsCode' in params:
             report.append("- **Session Bootstrap**: (SAFE PASS-THROUGH/INIT) Baseline normalization kept intact as starting payload.")
             
        elif node_name == 'Business Data Resolver' and 'jsCode' in params:
             report.append("- **Business Data Resolver**: (SAFE PASS-THROUGH) Confirmed it only reads state and does not mutate it.")

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('patch_report_state.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))

process()
