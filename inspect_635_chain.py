import json
import sys

# Ensure stdout is utf-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

with open('exec_635.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

run_data = data.get('data', {}).get('resultData', {}).get('runData', {})

def print_node_json(node_name):
    if node_name in run_data:
        try:
            output = run_data[node_name][0]['data']['main'][0][0]['json']
            print(f"\n--- {node_name} ---")
            print(json.dumps(output, indent=2))
        except:
            print(f"\n--- {node_name} (No JSON or failed to parse) ---")
    else:
        print(f"\n--- {node_name} (Not found in runData) ---")

# Specific check for the "red thing" - any error logs?
for node in run_data:
    if run_data[node][0].get('error'):
        print(f"\nNode error in {node}: {json.dumps(run_data[node][0]['error'], indent=2)}")

print_node_json('Rules Layer')
print_node_json('Product Search (Convex Test)')
print_node_json('Business Data Resolver')
print_node_json('Reply AI')
print_node_json('Validation')
