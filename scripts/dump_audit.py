import json
import logging

def run():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Failed to open file:", e)
        return

    nodes = data.get('data', {}).get('nodes', [])
    if not nodes and isinstance(data, list) and len(data) > 0:
        nodes = data[0].get('nodes', [])

    out = []
    
    # 1. Architecture Compliance / Code Node Audit
    out.append("## Code Nodes")
    for n in nodes:
        if 'code' in n.get('type', '').lower():
            code = n.get('parameters', {}).get('jsCode', '')
            lines = len(code.split('\n'))
            is_biz = 'price' in code.lower() or 'product' in code.lower() or 'inventory' in code.lower()
            is_state = '$session' in code.lower() or 'context' in code.lower()
            out.append(f"- **{n['name']}**: {lines} lines. Has BizLogic: {is_biz}, Manipulates State: {is_state}")
            if is_biz:
                out.append("  - *Violates Rules*: Contains business logic.")
    
    # 3. Fragility Detection
    out.append("\n## Fragility ($node references)")
    import re
    for n in nodes:
        params = str(n.get('parameters', {}))
        matches = set(re.findall(r'\$node\[["\']?([^"\'\]]+)["\']?\]', params))
        if matches:
            out.append(f"- **{n['name']}**: Depends on {list(matches)}")

    # 4 & 6. State Management & API Consistency
    out.append("\n## API Calls")
    for n in nodes:
        if 'httpRequest' in n.get('type', '').lower():
            if n['name'] not in ['Understanding AI', 'Reply AI']:
                url = n.get('parameters', {}).get('url', '')
                out.append(f"- **{n['name']}**: URL={url}")

    # 5. AI Usage Audit
    out.append("\n## AI Usage")
    for n in nodes:
        if n['name'] in ['Understanding AI', 'Reply AI']:
            params = str(n.get('parameters', {}))
            if 'price' in params.lower() or 'decide' in params.lower():
                out.append(f"- **{n['name']}**: Warning - Prompts may contain business logic.")
            else:
                out.append(f"- **{n['name']}**: Clean.")

    # 7. Error Handling
    out.append("\n## Error Handling")
    for n in nodes:
        if n.get('onError'):
            out.append(f"- **{n['name']}**: onError = {n.get('onError')}")

    with open('audit_report_dump.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(out))

run()
