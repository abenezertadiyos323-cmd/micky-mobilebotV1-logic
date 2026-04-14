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
        if node['name'] == 'Validation':
            code = node.get('parameters', {}).get('jsCode', '')
            
            # Add is_rate_limited_hit to observability
            obs_logic = """
  // ── Step 9: Tracking Rate Limiting in Observability ────────
  const is_rate_limited_hit = Boolean(base.is_rate_limited || replyPayload.is_cooldown);
"""
            # Insert after other observability calculations
            code = code.replace('const ai_confidence =', obs_logic + '\n  const ai_confidence =')
            
            # Add to the _observability object
            code = code.replace('is_clarification,', 'is_clarification,\n    is_rate_limited_hit,')
            
            node['parameters']['jsCode'] = code

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

process()
