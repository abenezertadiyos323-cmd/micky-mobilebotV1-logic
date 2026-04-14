import json, sys
sys.stdout.reconfigure(encoding='utf-8')

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

rl = next(n for n in w['nodes'] if n['name'] == 'Rules Layer')
code = rl['parameters']['jsCode']

# Find the exact block at the end that becomes business_resolve
# It ends just before 'return [{'
# The block before the return is: "reasoning: isBusiness ? 'fresh_business_request' : ..."
ANCHOR = "reasoning: isBusiness ? 'fresh_business_request' : 'fresh_non_business_message',\n  };\n}\n\nreturn [{"
ANCHOR_WIN = "reasoning: isBusiness ? 'fresh_business_request' : 'fresh_non_business_message',\r\n  };\r\n}\r\n\r\nreturn [{"

if ANCHOR in code:
    print('Found UNIX anchor')
elif ANCHOR_WIN in code:
    print('Found Windows anchor')
    anchor = ANCHOR_WIN
else:
    # Find the reasoning line
    idx = code.find("'fresh_business_request'")
    print(f"Found 'fresh_business_request' at {idx}")
    print(repr(code[idx:idx+150]))
