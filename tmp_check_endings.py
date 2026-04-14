import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf['nodes']

bdr_code = nodes[8]['parameters']['jsCode']
rl_code = nodes[6]['parameters']['jsCode']

print('BDR has \\r\\n:', '\r\n' in bdr_code)
print('BDR has \\n:', '\n' in bdr_code)

print('RL has \\r\\n:', '\r\n' in rl_code)
print('RL has \\n:', '\n' in rl_code)

idx = bdr_code.find('if (products.length > 0)')
if idx >= 0:
    print('\nBDR snippet (repr):')
    print(repr(bdr_code[idx:idx+250]))
else:
    print('BDR: target NOT found')

idx2 = rl_code.find('shouldContinueContext = Boolean')
if idx2 >= 0:
    print('\nRL snippet (repr):')
    print(repr(rl_code[idx2:idx2+250]))
else:
    print('RL: target NOT found')
