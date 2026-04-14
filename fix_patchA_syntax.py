"""
Fix Patch A syntax error in Understanding AI node (node 4).
The literal \\n characters injected break the n8n JS expression.
Replace them with properly escaped \\\\n to match the surrounding string context.
"""

import json
import shutil
from datetime import datetime

WF_FILE = 'workflow.json'

ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup = f'backups/patch-patchA-fix-{ts}.json'
shutil.copyfile(WF_FILE, backup)
print(f'Backup saved → {backup}')

with open(WF_FILE, 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf['nodes']
ua = nodes[4]
assert ua['name'] == 'Understanding AI', f"Node 4 mismatch: {ua['name']}"

json_body = ua['parameters']['jsonBody']

# The broken addition: has a literal \n\n before CRITICAL (breaks JS expression)
# Find and rewrite it as a single inline sentence appended directly to the line — no newlines
BROKEN_FIND = (
    '- fresh_request ? completely new business request with no previous context\n\n'
    'CRITICAL CLASSIFICATION RULE: If the customer message contains a specific phone model name '
    '(e.g. iphone 12, samsung a55, pixel 8) that does NOT appear in shown_products or current_interest in session, '
    'classify as fresh_request, NOT refinement. '
    'Refinement is ONLY for messages that reference an already-shown or already-mentioned product '
    'using pronouns, ordinals, or the exact same model name already in session context.'
)

# Correct version: use \\n which in the JS expression context = newline in the final string
# Match the surrounding escaping style: \\\\n is how the original prompt encodes newlines
GOOD_REPLACE = (
    '- fresh_request ? completely new business request with no previous context'
    '\\\\nCRITICAL: If the customer message names a specific phone model (e.g. iphone 12, samsung a55) '
    'not found in shown_products or current_interest, classify as fresh_request NOT refinement. '
    'Refinement is ONLY for messages referencing an already-shown product by pronoun, ordinal, or same model name.'
)

if BROKEN_FIND in json_body:
    json_body = json_body.replace(BROKEN_FIND, GOOD_REPLACE, 1)
    print('✅ Patch A syntax fixed — literal newlines replaced with \\\\n escape')
else:
    print('❌ Broken string not found — checking raw snippet...')
    idx = json_body.find('CRITICAL CLASSIFICATION RULE')
    if idx >= 0:
        print('Found CRITICAL at index', idx)
        print(repr(json_body[max(0,idx-100):idx+200]))
    else:
        idx2 = json_body.find('fresh_request ? completely new')
        if idx2 >= 0:
            print(repr(json_body[idx2:idx2+300]))

ua['parameters']['jsonBody'] = json_body

with open(WF_FILE, 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=False, indent=2)

print('\n✅ workflow.json saved. No other files modified.')
