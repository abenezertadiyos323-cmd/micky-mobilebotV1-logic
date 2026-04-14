import json

with open('exec_635.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

run_data = data.get('data', {}).get('resultData', {}).get('runData', {})

print("--- EXAMINING RUN 635 DATA ---")

# Check for node-level errors
for node, runs in run_data.items():
    for r in runs:
        if r.get('error'):
            print(f"!!! Error in node '{node}': {json.dumps(r['error'], indent=2)}")

# Check for data drops
def get_node_json(name):
    try:
        return run_data[name][0]['data']['main'][0][0]['json']
    except:
        return None

rules = get_node_json('Rules Layer')
if rules:
    print(f"\nRules Flow: {rules.get('rules_output', {}).get('resolver_input', {}).get('flow')}")
    print(f"Rules Resolved Product: {rules.get('rules_output', {}).get('resolver_input', {}).get('resolved_product_name')}")

search = get_node_json('Product Search (Convex Test)')
if search:
    print(f"\nSearch Result Count: {search.get('count')}")
    print(f"Top Product: {search.get('products', [{}])[0].get('model')}")

resolver = get_node_json('Business Data Resolver')
if resolver:
    print(f"\nResolver Mode: {resolver.get('resolver_output', {}).get('result_mode')}")
    print(f"Resolver Type: {resolver.get('resolver_output', {}).get('result_type')}")
    print(f"Resolver Hub Facts Found: {resolver.get('resolver_output', {}).get('facts_for_reply', {}).get('product_found')}")
    # Location Check
    config = resolver.get('client_config')
    if config:
        print(f"Client Config (Store Name): {config.get('store_name')}")
    else:
        print("Resolver output DOES NOT CONTAIN client_config!")

reply = get_node_json('Reply AI')
if reply:
    content = reply.get('choices', [{}])[0].get('message', {}).get('content', '')
    print(f"\nReply content: {content[:100]}...")

# Check the prompt sent to Reply AI
try:
    msgs = data['data']['resultData']['runData']['Reply AI'][0]['data']['main'][0][0]['json']['choices'][0]['message'] # wait, no, i need the input
    # To get inputs, we check the 'data' part of the execution
    # but n8n puts input under 'data' and output under 'json' usually.
except:
    pass
