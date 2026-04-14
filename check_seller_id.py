import json, sys
sys.stdout.reconfigure(encoding='utf-8')

# Check what sellerId the Product Search node is constructing
# The error says "Missing sellerId" -- check Session Bootstrap client_config output
with open('exec_645.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

rd = data['data']['resultData']['runData']

sb = rd.get('Session Bootstrap', [{}])[0].get('data', {}).get('main', [[]])[0]
if sb:
    cc = sb[0]['json'].get('client_config', {})
    print('client_config from Session Bootstrap:')
    print(json.dumps(cc, indent=2))

# Also check what the Product Search node actually received
ps_node_data = rd.get('Product Search (Convex Test)', [{}])[0]
print('\nProduct Search executionStatus:', ps_node_data.get('executionStatus'))
print('Product Search error:', json.dumps(ps_node_data.get('error', {}))[:400])
