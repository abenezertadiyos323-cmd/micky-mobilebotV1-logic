import json
import re

def process():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error:", e)
        return

    if 'data' in data and 'nodes' in data['data']:
        nodes = data['data']['nodes']
    elif 'nodes' in data:
        nodes = data['nodes']
    else:
        nodes = []

    report = []
    
    for node in nodes:
        node_name = node['name']
        ntype = node.get('type')
        params = node.get('parameters', {})
        
        # 1. Session Bootstrap (Client Config)
        if node_name == 'Session Bootstrap' and 'code' in ntype.lower():
            code = params.get('jsCode', '')
            if 'const client_config = {' in code:
                # Replace the client_config block
                new_code = re.sub(
                    r'const client_config = \{\s*"store_name": "[^"]+",\s*"default_language": "[^"]+",\s*"supports_exchange": [a-z]+,\s*"supports_finance": [a-z]+,\s*"telegram_bot_name": "[^"]+"\s*\};',
                    r'''const client_config = {
  "store_name": $env.STORE_NAME || $json.store_name || "Store",
  "default_language": $env.DEFAULT_LANG || "am",
  "supports_exchange": true,
  "supports_finance": false,
  "telegram_bot_name": $env.BOT_NAME || $json.bot_name || "Bot",
};''',
                    code
                )
                if new_code != code:
                    params['jsCode'] = new_code
                    report.append(f"- **{node_name}**: Removed hardcoded `client_config` (store_name: TedyTech) and replaced with `$env` and `$json` fallbacks.")
        
        # 2. AI Nodes (Understanding AI & Reply AI)
        if node_name in ['Understanding AI', 'Reply AI']:
            for key in ['jsonBody', 'bodyParameters', 'sendBody', 'prompt', 'messages']:
                if key in params and isinstance(params[key], str):
                    val = params[key]
                    new_val = val.replace('TedyTech', '{{ $json.client_config?.store_name || \"the store\" }}')
                    new_val = new_val.replace('Telegram phone sales bot', 'Telegram sales bot')
                    if val != new_val:
                        params[key] = new_val
                        report.append(f"- **{node_name}**: Replaced hardcoded brand name ('TedyTech') and specific business assumption ('phone sales') with dynamic variables.")

        # 3. Rules Layer (Often has Regex or hardcodes to check)
        if node_name == 'Rules Layer' and 'code' in ntype.lower():
            code = params.get('jsCode', '')
            new_code = code.replace('TedyTech', '${client_config.store_name || \"Store\"}')
            if new_code != code:
                 params['jsCode'] = new_code
                 report.append(f"- **{node_name}**: Removed hardcoded 'TedyTech' in Javascript logic.")
                 
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('patch_report.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))

process()
