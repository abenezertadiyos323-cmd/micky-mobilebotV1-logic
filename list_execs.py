import urllib.request, json, sys

sys.stdout.reconfigure(encoding='utf-8')

API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A'
HEADERS = {'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json'}

# Get latest executions
req = urllib.request.Request(
    'https://n8n-production-c119.up.railway.app/api/v1/executions?limit=5&includeData=false',
    headers=HEADERS
)
data = json.load(urllib.request.urlopen(req))
for e in data['data']:
    print(f"ID={e['id']} status={e['status']} time={e.get('startedAt','')} finished={e.get('finished')}")
