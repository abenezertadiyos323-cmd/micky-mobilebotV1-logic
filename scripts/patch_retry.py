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

    report = []
    
    for node in nodes:
        node_name = node['name']
        if node_name in ['Understanding AI', 'Reply AI']:
            node['retryOnFail'] = True
            node['maxTries'] = 3
            node['onError'] = 'continueRegularOutput'
            report.append(f"- **{node_name}**: Added `retryOnFail=true`, `maxTries=3` (which gives max 2 retries), and `onError=continueRegularOutput`.")
                
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('patch_report_retry.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))

process()
