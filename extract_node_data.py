import json

with open('latest_exec.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

# Find the specific nodes we care about
run_data = data.get('data', {}).get('resultData', {}).get('runData', {})
if not run_data:
    print("NO runData found! Keys in data:")
    print(list(data.keys()))
    if 'data' in data:
        print("Keys in data['data']:")
        print(list(data['data'].keys()))
else:
    print("Nodes executed:")
    for node_name in run_data.keys():
        print(f" - {node_name}")
        output_len = 0
        try:
            output_len = len(json.dumps(run_data[node_name][0].get('data', {})))
        except: pass
        print(f"   (Data length: {output_len})")

def print_node_data(node_name):
    if node_name not in run_data: return
    print(f"\n--- {node_name} ---")
    try:
        output = run_data[node_name][0]['data']['main'][0][0]['json']
        print(json.dumps(output, indent=2)[:1000] + "\n...")
    except Exception as e:
        print(f"Error parsing: {e}")

print("\n--- Details ---")
print_node_data('Understanding JSON Guard - Pure Validator')
print_node_data('Rules Layer')
print_node_data('Business Data Resolver')
print_node_data('Reply AI')
print_node_data('Catch')
