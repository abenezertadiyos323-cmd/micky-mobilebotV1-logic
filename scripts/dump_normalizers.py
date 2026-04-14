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

    for node in nodes:
        node_name = node['name']
        if 'Normalizer' in node_name or 'Bootstrap' in node_name:
            params = node.get('parameters', {})
            code = params.get('jsCode', '')
            if code:
                with open(f"scripts/{node_name.replace(' ', '_')}.js", 'w', encoding='utf-8') as sf:
                    sf.write(code)

process()
