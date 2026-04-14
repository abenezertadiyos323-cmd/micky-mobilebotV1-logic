import json
import sys

try:
    with open('latest_runs.json', 'r', encoding='utf-16le') as f:
        data = json.load(f)
    if 'data' not in data:
        print(f"No 'data' key in JSON")
    for r in data.get('data', []):
        print(f"ID: {r.get('id')}, Finished: {r.get('finished')}, Status: {r.get('status')}")
except Exception as e:
    print(f"Error: {e}")
