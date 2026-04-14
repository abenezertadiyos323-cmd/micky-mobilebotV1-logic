import json

with open('latest_telegram_fail.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

run_data = data.get('data', {}).get('resultData', {}).get('runData', {})
if 'Telegram Send' in run_data:
    tg_send = run_data['Telegram Send']
    for exec_item in tg_send:
        print(f"Error in TG node: {exec_item.get('error')}")
        # Look at the data preceding it? The input comes from 'Safe To Send'
        
if 'Safe To Send' in run_data:
    safe_to_send = run_data['Safe To Send'][0]['data']['main'][0][0]['json']
    print(f"\nPayload sent from Safe To Send:\n{json.dumps(safe_to_send, indent=2)}")
