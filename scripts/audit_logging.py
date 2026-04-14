import json
import os

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

    result = []
    for node in nodes:
        code = node.get('parameters', {}).get('jsCode', '')
        if 'console.log' in code:
            logs = [line.strip() for line in code.split('\n') if 'console.log' in line]
            result.append({
                "node": node['name'],
                "logs": logs
            })

    with open('scripts/observability_audit.json', 'w', encoding='utf-8') as out:
        json.dump(result, out, indent=2)

process()
