import urllib.request
import json

url = "https://n8n-production-c119.up.railway.app/api/v1/executions/632?includeData=true"
headers = {
    "X-N8N-API-KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A",
    "Accept": "application/json"
}

req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode('utf-8'))

run_data = data.get('data', {}).get('resultData', {}).get('runData', {})
bdr_json = run_data['Business Data Resolver'][0]['data']['main'][0][0]['json'] if 'Business Data Resolver' in run_data else "missing"
convex_json = run_data['Product Search (Convex Test)'][0]['data']['main'][0][0]['json'] if 'Product Search (Convex Test)' in run_data else "missing"

out_data = {
    "resolver": bdr_json,
    "search": convex_json
}

with open('bdr_output.json', 'w', encoding='utf-8') as f:
    json.dump(out_data, f, indent=2)
