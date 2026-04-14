import urllib.request
import json

url = "https://n8n-production-c119.up.railway.app/api/v1/workflows/hc55q2zfas7gG1yu"
headers = {
    "X-N8N-API-KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A",
    "Accept": "application/json"
}

req = urllib.request.Request(url, headers=headers)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode('utf-8'))

bdr_node = next((n for n in data.get('nodes', []) if n.get('name') == 'Business Data Resolver'), None)
if bdr_node:
    code = bdr_node.get('parameters', {}).get('jsCode', '')
    if not code:
        code = bdr_node.get('parameters', {}).get('code', '')
    with open('live_bdr_code.js', 'w', encoding='utf-8') as f:
        f.write(code)
    print(f"BDR code saved ({len(code)} bytes)")
else:
    print("Business Data Resolver node not found")
