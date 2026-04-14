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

    connections = data.get('data', {}).get('connections', [])
    if not connections and 'connections' in data:
        connections = data['connections']

    # 1. Add Rate Limit Guard (If Node)
    guard_node = {
        "parameters": {
            "conditions": {
                "boolean": [
                    {
                        "value1": "={{ $json.is_rate_limited }}",
                        "value2": "={{ true }}"
                    }
                ]
            }
        },
        "id": "rate-limit-guard",
        "name": "Rate Limit Guard",
        "type": "n8n-nodes-base.if",
        "typeVersion": 1,
        "position": [
            1400,
            450
        ]
    }
    nodes.append(guard_node)

    # 2. Add Cooldown Response (Set Node)
    cooldown_node = {
        "parameters": {
            "values": {
                "string": [
                    {
                        "name": "reply_text",
                        "value": "እባክዎ ሌላ መልዕክት ከመላክዎ በፊት ትንሽ ይጠብቁ (2 ሰከንድ)። / Please wait a moment (2 seconds) before sending another message."
                    },
                    {
                        "name": "is_cooldown",
                        "value": "true"
                    }
                ]
            }
        },
        "id": "cooldown-response",
        "name": "Cooldown Response",
        "type": "n8n-nodes-base.set",
        "typeVersion": 2,
        "position": [
            1600,
            600
        ]
    }
    nodes.append(cooldown_node)

    # 3. Rewire Connections
    # Callback Action? Output 1 currently points to Understanding AI.
    # We change it to point to Rate Limit Guard.
    if 'Callback Action?' in connections:
        cb_outputs = connections['Callback Action?'].get('main', [])
        if len(cb_outputs) > 1:
            # Output 1 (Else)
            current_target = cb_outputs[1]
            cb_outputs[1] = [
                {
                    "node": "Rate Limit Guard",
                    "type": "main",
                    "index": 0
                }
            ]

    # Rate Limit Guard connections
    connections['Rate Limit Guard'] = {
        "main": [
            [
                {
                    "node": "Cooldown Response",
                    "type": "main",
                    "index": 0
                }
            ],
            [
                {
                    "node": "Understanding AI",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }
    # Note: If Node Output 0 is True (Limit Hit), Output 1 is False (Success).
    # Since I put cooldown on Output 0 and AI on Output 1, it works correctly.

    # Cooldown Response -> Validation
    connections['Cooldown Response'] = {
        "main": [
            [
                {
                    "node": "Validation",
                    "type": "main",
                    "index": 0
                }
            ]
        ]
    }

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

process()
