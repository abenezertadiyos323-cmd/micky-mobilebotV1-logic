import urllib.request, json

url = 'https://n8n-production-c119.up.railway.app/api/v1/executions/636?includeData=true'
headers = {
    'X-N8N-API-KEY': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A',
    'Accept': 'application/json'
}

req = urllib.request.Request(url, headers=headers)
data = json.load(urllib.request.urlopen(req))
open('exec_636.json', 'w', encoding='utf-8').write(json.dumps(data, indent=2))
print('Saved exec_636.json')

rd = data['data']['resultData']['runData']

# Find errors
for node, runs in rd.items():
    for r in runs:
        err = r.get('error')
        if err:
            print(f'\nERROR in [{node}]:')
            print(json.dumps(err, indent=2)[:500])

print('\nAll nodes that ran:', list(rd.keys()))

# Show Product Search output
if 'Product Search (Convex Test)' in rd:
    ps = rd['Product Search (Convex Test)'][0]
    err = ps.get('error')
    if err:
        print('\nProduct Search ERROR:', json.dumps(err, indent=2)[:500])
    else:
        out = ps['data']['main'][0][0]['json']
        print('\nProduct Search output:', json.dumps(out)[:300])

# Show Telegram Send info
if 'Telegram Send' in rd:
    ts = rd['Telegram Send'][0]
    err = ts.get('error')
    if err:
        print('\nTelegram Send ERROR:', json.dumps(err, indent=2)[:500])

# Show Validation output (what is passed to Telegram Send?)
if 'Validation' in rd:
    val = rd['Validation'][0]['data']['main'][0][0]['json']
    print('\nValidation output (chat_id):', val.get('chat_id') or val.get('telegram_payload', {}).get('chat_id'))
