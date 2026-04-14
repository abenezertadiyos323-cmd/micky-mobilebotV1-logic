import json, sys
sys.stdout.reconfigure(encoding='utf-8')

# Check the Rules Layer node code - specifically the collect_pass / missing_fields logic
with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

rl = next((n for n in w['nodes'] if n['name'] == 'Rules Layer'), None)
if rl:
    code = rl['parameters'].get('jsCode', '')
    # Find the collect_pass and missing_fields section
    idx = code.find('collect_pass')
    if idx >= 0:
        print('collect_pass logic (500 chars around it):')
        print(code[max(0, idx-200):idx+800])
    else:
        print('collect_pass NOT found in Rules Layer')
    
    # Also find how seller_id is extracted
    idx2 = code.find('sellerId')
    if idx2 >= 0:
        print('\nsellerId logic:')
        print(code[max(0, idx2-100):idx2+300])
