import urllib.request, json, sys

sys.stdout.reconfigure(encoding='utf-8')

API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A'
HEADERS = {'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json'}

# Fetch the most recent exec with full data 
req = urllib.request.Request(
    'https://n8n-production-c119.up.railway.app/api/v1/executions/645?includeData=true',
    headers=HEADERS
)
data = json.load(urllib.request.urlopen(req))
with open('exec_645.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
print('Saved exec_645.json')

rd = data['data']['resultData']['runData']
print('Nodes:', list(rd.keys()))

# 1. What input text triggered this?
en = rd.get('Event Normalizer', [{}])[0].get('data', {}).get('main', [[]])[0]
if en:
    print('\nInput text:', en[0]['json'].get('event', {}).get('text', ''))

# 2. Check Understanding AI output
ua = rd.get('Understanding AI', [{}])[0].get('data', {}).get('main', [[]])[0]
if ua:
    raw = ua[0]['json']
    choices = raw.get('choices', [{}])
    content = choices[0].get('message', {}).get('content', '')
    print('\nUnderstanding AI raw output:', content[:500])

# 3. Check Rules Layer output
rl = rd.get('Rules Layer', [{}])[0].get('data', {}).get('main', [[]])[0]
if rl:
    rules = rl[0]['json'].get('rules_output', {})
    print('\nRules Layer output:')
    print('  reply_mode:', rules.get('reply_mode'))
    print('  flow:', rules.get('resolver_input', {}).get('flow'))
    print('  resolved_product_name:', rules.get('resolver_input', {}).get('resolved_product_name'))
    print('  collect_pass:', rules.get('collect_pass'))
    print('  missing_fields:', rules.get('missing_fields'))
    print('  full rules_output:', json.dumps(rules, indent=2)[:1000])

# 4. Check Product Search output
ps = rd.get('Product Search (Convex Test)', [{}])[0]
ps_err = ps.get('error')
if ps_err:
    print('\nProduct Search ERROR:', json.dumps(ps_err, indent=2)[:500])
else:
    ps_out = ps.get('data', {}).get('main', [[]])[0]
    if ps_out:
        print('\nProduct Search products:', json.dumps(ps_out[0]['json'])[:500])

# 5. Check BDR output
bdr = rd.get('Business Data Resolver', [{}])[0].get('data', {}).get('main', [[]])[0]
if bdr:
    print('\nBDR resolver_output:')
    print(json.dumps(bdr[0]['json'].get('resolver_output', {}), indent=2)[:800])
