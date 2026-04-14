import json
import re

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
    found_nodes = set()
    
    # 1. Identify nodes that use camelCase
    for node in nodes:
        params_str = json.dumps(node.get('parameters', {}))
        if any(x in params_str for x in ['chatId', 'userId', 'messageId']):
            found_nodes.add(node['name'])

    # 2. Globally replace keys and property accessors
    # We use regex to replace chat|user|message + Id with chat|user|message + _id
    # We must be careful not to double-replace if something is already chat_id.
    
    json_str = json.dumps(data)
    
    # Replaces: .chatId, .userId, .messageId
    json_str = re.sub(r'\.(\w+)Id\b', r'.\1_id', json_str)
    
    # Replaces: "chatId": or 'chatId': or chatId: (inside expressions)
    # We look for patterns like "chatId" followed by : or within {{ }}
    json_str = re.sub(r'([\'"]?)(\w+)Id([\'"]?)\s*:', r'\1\2_id\3:', json_str)
    
    # Specifically for n8n expressions like {{ $json.event.chatId }}
    json_str = re.sub(r'\$(\w+)\.event\.(\w+)Id\b', r'$\1.event.\2_id', json_str)

    # 3. Handle Special Case: Event Normalizer return keys
    # The return block: event: { chatId: ..., userId: ... }
    # The regex above handles "chatId": but not the bare key in JS.
    # We catch the JS return block manually if needed, but the regex usually catches "chatId": keys.
    
    data = json.loads(json_str)

    # Fix Event Normalizer specifically just to be sure
    for node in nodes:
        if node['name'] == 'Event Normalizer':
            code = node['parameters'].get('jsCode', '')
            # If the regex didn't catch the JS return keys (it might not if they aren't quoted)
            # Replaced chatId: with chat_id: etc.
            code = re.sub(r'\b(chat|user|message)Id\s*:', r'\1_id:', code)
            node['parameters']['jsCode'] = code
            report.append("- **Event Normalizer**: Standardized all output IDs to snake_case (`chat_id`, `user_id`, `message_id`).")

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('step6_final_patch_report.md', 'w', encoding='utf-8') as f:
        f.write("# Step 6 Final Patch Report\n\n")
        f.write("\n".join(report))
        f.write("\n\nNodes that were referencing camelCase IDs and were successfully updated to snake_case:\n\n")
        f.write("\n".join(f"- {n}" for n in sorted(list(found_nodes))))

process()
