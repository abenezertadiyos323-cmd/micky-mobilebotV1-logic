import json

with open('latest_exec.json', 'r', encoding='utf-8-sig') as f:
    data = json.load(f)

run_data = data.get('data', {}).get('resultData', {}).get('runData', {})
out_data = {}
if 'Validation' in run_data:
    out_data['Validation'] = run_data['Validation'][0]['data']['main'][0][0]['json']
if 'Telegram Send' in run_data:
    try:
        out_data['Telegram Send'] = run_data['Telegram Send'][0]['data']['main'][0][0]
    except:
        out_data['Telegram Send'] = "Failed to parse"
if 'Catch' in run_data:
    out_data['Catch'] = run_data['Catch']

with open('tail_nodes_out.json', 'w', encoding='utf-8') as f:
    json.dump(out_data, f, indent=2)
