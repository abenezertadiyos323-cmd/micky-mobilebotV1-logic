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
        if node['name'] == 'Session Bootstrap':
            code = node.get('parameters', {}).get('jsCode', '')
            
            # Logic to insert rate limiting before the return
            limit_logic = """
  // ── Step 9: Rate Limit Guard ────────────────────────────────
  const time_since_last = now - Number(existing.last_message_at || 0);
  const is_exempt = isStartReset || event.event_type === 'callback_action';
  const is_rate_limited = !is_exempt && time_since_last < 2000;
"""
            # Insert before the return
            if 'return [{' in code:
                code = code.replace('return [{', limit_logic + '\n  return [{')
            
            # Add to the output json object
            code = code.replace('session_source:', 'is_rate_limited,\n    session_source:')
            
            node['parameters']['jsCode'] = code

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

process()
