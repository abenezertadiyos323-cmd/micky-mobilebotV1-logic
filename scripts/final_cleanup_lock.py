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
    
    # Blocker 1: Fix Product Search (Convex Test) fallback
    for node in nodes:
        if node['name'] == 'Product Search (Convex Test)':
            json_body = node.get('parameters', {}).get('jsonBody', '')
            if "return 'tedytech';" in json_body:
                # Replace with a safe dynamic fallback using $env.SELLER_ID
                new_json_body = json_body.replace(
                    "return 'tedytech';", 
                    "return $env.SELLER_ID || 'missing_seller_id';"
                )
                node['parameters']['jsonBody'] = new_json_body
                report.append("- **Product Search (Convex Test)**: Replaced hardcoded 'tedytech' fallback with dynamic `$env.SELLER_ID`.")

    # Blocker 2: Audit Credential Coupling
    credential_nodes = []
    for node in nodes:
        node_str = json.dumps(node).lower()
        if 'tedytech' in node_str and 'credential' in node_str:
            credential_nodes.append(node['name'])
            
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('final_lock_audit.md', 'w', encoding='utf-8') as f:
        f.write("# Final Cleanup & Lock Audit\n\n")
        f.write("## 1. Blocker 1 Fixes\n")
        f.write("\n".join(report) + "\n\n")
        f.write("## 2. Blocker 2: Credential Coupling (External Deployment Requirement)\n\n")
        f.write("The following nodes are bound to the `telegram_tedytech_customer` credential. In n8n, credential linkage is stored by the credential's internal name/ID. This is an **External Deployment Requirement** and cannot be abstracted within the workflow JSON without unlinking the node.\n\n")
        for cn in sorted(credential_nodes):
            f.write(f"- {cn}\n")
        f.write("\n> [!IMPORTANT]\n> When cloning this workflow, the user MUST manually update the credentials in the nodes listed above to match their own Telegram Bot credentials.\n")

process()
