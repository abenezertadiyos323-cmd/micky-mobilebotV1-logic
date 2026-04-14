import os
import requests

baseUrl = "https://n8n-production-c119.up.railway.app"
apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A"

headers = {
    "accept": "application/json",
    "X-N8N-API-KEY": apiKey
}

try:
    resp = requests.get(f"{baseUrl}/api/v1/workflows", headers=headers)
    resp.raise_for_status()
    workflows = resp.json().get('data', [])
    
    active_ids = [w['id'] for w in workflows if w.get('active') is True]
    
    import json
    for wid in active_ids:
        resp_w = requests.get(f"{baseUrl}/api/v1/workflows/{wid}", headers=headers)
        resp_w.raise_for_status()
        print(f"--- WORKFLOW {wid} START ---")
        print(json.dumps(resp_w.json(), indent=2))
        print(f"--- WORKFLOW {wid} END ---")

except Exception as e:
    print("Error:", e)
