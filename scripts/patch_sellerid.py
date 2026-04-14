import json

def process():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error:", e)
        return

    nodes = data.get('data', {}).get('nodes', [])
    if not nodes and 'nodes' in data:
        nodes = data['nodes']

    for node in nodes:
        node_name = node['name']
        ntype = node.get('type')
        params = node.get('parameters', {})
        
        if node_name == 'Session Bootstrap' and 'code' in ntype.lower():
            code = params.get('jsCode', '')
            if '"telegram_bot_name"' in code and 'seller_id' not in code and 'sellerId' not in code:
                # Add sellerId to config
                new_code = code.replace(
                    '"telegram_bot_name": $env.BOT_NAME || $json.bot_name || "Bot",',
                    '"telegram_bot_name": $env.BOT_NAME || $json.bot_name || "Bot",\n  "sellerId": $env.SELLER_ID || $json.sellerId || null,'
                )
                if new_code == code:
                    # Maybe it's missing trailing comma
                    new_code = code.replace(
                        '"telegram_bot_name": $env.BOT_NAME || $json.bot_name || "Bot"',
                        '"telegram_bot_name": $env.BOT_NAME || $json.bot_name || "Bot",\n  "sellerId": $env.SELLER_ID || $json.sellerId || null'
                    )
                params['jsCode'] = new_code
                 
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

process()
