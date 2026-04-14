import json
import re

def process():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error:", e)
        return

    nodes = data.get('nodes', [])
    if not nodes and 'data' in data:
        nodes = data['data'].get('nodes', [])

    report = []
    
    for i, node in enumerate(nodes):
        node_name = node['name']
        ntype = node.get('type')
        params = node.get('parameters', {})
        
        changed = False
        
        # 1. Session Bootstrap (Client Config)
        if node_name == 'Session Bootstrap' and 'code' in ntype.lower():
            code = params.get('jsCode', '')
            if 'const client_config = {' in code:
                # Replace the client_config block
                new_code = re.sub(
                    r'const client_config = \{\s*"store_name": "[^"]+",\s*"default_language": "[^"]+",\s*"supports_exchange": [a-z]+,\s*"supports_finance": [a-z]+,\s*"telegram_bot_name": "[^"]+"\s*\};',
                    r'''const client_config = {
  "store_name": $env.STORE_NAME || $json.store_name || "Store",
  "default_language": "am",
  "supports_exchange": true,
  "supports_finance": false,
  "telegram_bot_name": $env.BOT_NAME || $json.bot_name || "Bot",
  "sellerId": $env.SELLER_ID || $json.sellerId || null
};''',
                    code
                )
                if new_code != code:
                    params['jsCode'] = new_code
                    changed = True
                    report.append(f"- **{node_name}**: Replaced hardcoded `client_config` (store_name, telegram_bot_name) with dynamic `$env` and `$json` fallback. Added `sellerId` extraction.")
        
        # 2. AI Nodes (Understanding AI & Reply AI)
        if node_name in ['Understanding AI', 'Reply AI']:
            for key in ['jsonBody', 'bodyParameters', 'sendBody', 'prompt', 'messages']:
                if key in params:
                    pass
            # Just do string replacement on the whole dump then re-parse if needed?
            # It's easier to convert params to string, replace, convert back.
            p_str = json.dumps(params)
            new_p_str = p_str.replace('TedyTech', '{{ $json.client_config?.store_name || "our store" }}')
            new_p_str = new_p_str.replace('Tedy Store', '{{ $json.client_config?.store_name || "our store" }}')
            new_p_str = new_p_str.replace('Telegram phone sales bot', 'Telegram sales bot')
            
            if p_str != new_p_str:
                node['parameters'] = json.loads(new_p_str)
                changed = True
                report.append(f"- **{node_name}**: Replaced hardcoded bot/domain references with generic equivalents and {{ $json.client_config?.store_name }}.")
                
        # 3. Product Search / Convex / Other Code Nodes
        # Let's replace any TedyTech or sellerId hardcode globally in JS code
        if 'code' in ntype.lower() and node_name != 'Session Bootstrap':
            code = params.get('jsCode', '')
            if 'TedyTech' in code:
                new_code = code.replace('TedyTech', '${client_config.store_name}')
                node['parameters']['jsCode'] = new_code
                changed = True
                report.append(f"- **{node_name}**: Removed hardcoded 'TedyTech' from JS code.")
        
    with open('active_workflow_hc55q2zfas7gG1yu_patched.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('patch_report.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))

process()
