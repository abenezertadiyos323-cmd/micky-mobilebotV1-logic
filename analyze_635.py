import json

with open('exec_635.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

run_data = data.get('data', {}).get('resultData', {}).get('runData', {})

errors = []
for node_name, node_runs in run_data.items():
    for run in node_runs:
        if run.get('error'):
            errors.append({
                'node': node_name,
                'error': run.get('error')
            })

if not errors:
    print("No nodes found with a direct 'error' property.")
else:
    for e in errors:
        print(f"Node: {e['node']}, Error: {e['error']}")

# Also check for empty data in critical nodes
critical_nodes = ['Product Search (Convex Test)', 'Business Data Resolver', 'Reply AI']
for node in critical_nodes:
    if node in run_data:
        try:
            output = run_data[node][0]['data']['main'][0][0]['json']
            print(f"\nNode: {node} output (truncated 500 chars):\n{json.dumps(output, indent=2)[:500]}")
        except Exception as ex:
            print(f"\nNode: {node} no data or parse error: {ex}")
    else:
        print(f"\nNode: {node} NOT found in runData.")
