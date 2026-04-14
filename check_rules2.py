import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

rl = next((n for n in w['nodes'] if n['name'] == 'Rules Layer'), None)
if rl:
    code = rl['parameters'].get('jsCode', '')
    # Print section that decides should_call_resolver and how missing info is handled
    for keyword in ['missing_fields', 'should_call_resolver', 'missing_info', 'clarify', 'COLLECT']:
        idx = code.find(keyword)
        if idx >= 0:
            print(f'\n=== {keyword} found:')
            print(code[max(0, idx-100):idx+400])
            print('...')
        else:
            print(f'  [{keyword}] not found in Rules Layer')
