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

    for node in nodes:
        if node['name'] == 'Session Bootstrap':
            code = node.get('parameters', {}).get('jsCode', '')
            with open('scripts/Session_Bootstrap_Current.js', 'w', encoding='utf-8') as out:
                out.write(code)
            print("Successfully extracted code to scripts/Session_Bootstrap_Current.js")

process()
