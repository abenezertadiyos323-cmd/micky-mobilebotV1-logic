import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

rl = next(n for n in w['nodes'] if n['name'] == 'Rules Layer')
code = rl['parameters']['jsCode']

# Find the business_resolve block and the 200 chars before it
idx = code.find("reply_mode: 'business_resolve',")
print(f'Found business_resolve at index {idx}')
# Walk back to find where the outer block starts
print('\n--- 300 chars BEFORE business_resolve ---')
print(repr(code[max(0, idx-300):idx]))
print('\n--- 200 chars AFTER business_resolve ---')
print(repr(code[idx:idx+200]))

# Find the return statement
ret_idx = code.rfind('return [{', 0, len(code))
print(f'\nLast return [{{  at index {ret_idx}')
print(repr(code[max(0, ret_idx-200):ret_idx+60]))
