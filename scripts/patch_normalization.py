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

    report = []
    
    for node in nodes:
        node_name = node['name']
        params = node.get('parameters', {})
        
        # 1. Update Event Normalizer - Remove duplicate chatId
        if node_name == 'Event Normalizer':
            code = params.get('jsCode', '')
            new_code = code.replace("chatId: String(chatIdRaw || ''),", "") # Remove duplicate
            if new_code != code:
                params['jsCode'] = new_code
                report.append(f"- **{node_name}**: Removed redundant `chatId` key; downstream nodes now use `chat_id` exclusively.")

        # 2. Update Session Bootstrap - Clean up lookups
        if node_name == 'Session Bootstrap':
            code = params.get('jsCode', '')
            # Reduce rescue nodes to just Event Normalizer
            new_code = code.replace(
                "?? readEventFromNode('Event Loader')\n    ?? readEventFromNode('Unify Payload')\n    ?? readEventFromNode('Telegram Input')\n    ?? readEventFromNode('Telegram Trigger')",
                ""
            )
            if new_code != code:
                params['jsCode'] = new_code
                report.append(f"- **{node_name}**: Simplified event rescue logic to trust the `Event Normalizer` as the primary upstream.")

        # 3. Update Validation - Fix ID consistency
        if node_name == 'Validation':
            code = params.get('jsCode', '')
            new_code = code.replace("event.chat_id ?? event.chatId", "event.chat_id")
            if new_code != code:
                params['jsCode'] = new_code
                report.append(f"- **{node_name}**: Standardized chat_id resolution to snake_case.")

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('patch_report_norm.md', 'w', encoding='utf-8') as f:
        f.write('\n'.join(report))

process()
