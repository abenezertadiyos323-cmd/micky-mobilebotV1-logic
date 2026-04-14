import urllib.request
import json
import traceback

url = "https://n8n-production-c119.up.railway.app/api/v1/executions?workflowId=hc55q2zfas7gG1yu&limit=5"
headers = {
    "X-N8N-API-KEY": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A",
    "Accept": "application/json"
}

req = urllib.request.Request(url, headers=headers)
try:
    with urllib.request.urlopen(req) as response:
        list_data = json.loads(response.read().decode('utf-8'))
        
    runs = list_data.get('data', [])
    failed = next((r for r in runs if not r.get('finished')), runs[0] if runs else None)
    
    if not failed:
        print("No executions found.")
    else:
        eid = failed['id']
        print(f"Latest relevant execution ID: {eid}")
        
        detail_url = f"https://n8n-production-c119.up.railway.app/api/v1/executions/{eid}?includeData=true"
        req2 = urllib.request.Request(detail_url, headers=headers)
        with urllib.request.urlopen(req2) as resp2:
            exec_data = json.loads(resp2.read().decode('utf-8'))
            
        with open('latest_telegram_fail.json', 'w', encoding='utf-8') as f:
            json.dump(exec_data, f, indent=2)
        print("Execution details saved to latest_telegram_fail.json")
except Exception as e:
    print(e)
    traceback.print_exc()
