import json

with open('latest_exec.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

run_data = data.get('data', {}).get('resultData', {}).get('runData', {})
with open('reply_ai_out.json', 'w', encoding='utf-8') as f:
    if 'Reply AI' in run_data:
        reply_output = run_data['Reply AI'][0]['data']['main'][0][0]['json']
        json.dump(reply_output, f, indent=2)
    else:
        f.write('{"error": "Reply AI not found in runData"}')
