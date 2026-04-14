import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf['nodes']

print('=== VERIFY PATCH B (Rules Layer - isModelSwitch) ===')
rl_code = nodes[6]['parameters']['jsCode']
if 'isModelSwitch' in rl_code and '!isModelSwitch' in rl_code:
    idx = rl_code.find('extractModelFromText')
    print(rl_code[idx:idx+500])
else:
    print('NOT FOUND')

print('\n=== VERIFY PATCH C part 1 (BDR - constraintMatchFailed) ===')
bdr_code = nodes[8]['parameters']['jsCode']
if 'constraintMatchFailed' in bdr_code:
    idx = bdr_code.find('let constraintMatchFailed')
    print(bdr_code[idx:idx+600])
else:
    print('NOT FOUND')

print('\n=== VERIFY PATCH C part 2 (BDR - no_match override) ===')
if "result_type !== 'exchange_offer'" in bdr_code:
    idx = bdr_code.find('if (constraintMatchFailed')
    print(bdr_code[idx:idx+200])
else:
    print('NOT FOUND')

print('\n=== VERIFY PATCH A (Understanding AI - fresh_request rule) ===')
ua_body = nodes[4]['parameters']['jsonBody']
if 'CRITICAL CLASSIFICATION RULE' in ua_body:
    idx = ua_body.find('CRITICAL CLASSIFICATION RULE')
    print(ua_body[idx:idx+300])
else:
    print('NOT FOUND')

print('\n=== VERIFY PATCH D (Product Search - storage field) ===')
ps_body = nodes[7]['parameters']['jsonBody']
if 'storage:' in ps_body:
    idx = ps_body.find('storage:')
    print(ps_body[idx:idx+250])
else:
    print('NOT FOUND')
