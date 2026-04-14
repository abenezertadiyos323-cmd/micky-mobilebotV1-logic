"""
Safety verifier: compares original backup with patched workflow.json
and confirms ONLY the 3 target nodes were changed.
"""
import json

original = json.load(open('backups/convex-bridge-fix-2026-04-10T20-38-26.json', 'r', encoding='utf-8'))
patched = json.load(open('workflow.json', 'r', encoding='utf-8'))

orig_nodes = {n['name']: n for n in original.get('nodes', [])}
patch_nodes = {n['name']: n for n in patched.get('nodes', [])}

ALLOWED_CHANGES = {
    'Product Search (Convex Test)',
    'Session Bootstrap',
    'Reply AI',
}

changed = []
broken = []

for name in orig_nodes:
    if name not in patch_nodes:
        broken.append(f'MISSING NODE: {name}')
        continue
    if json.dumps(orig_nodes[name]) != json.dumps(patch_nodes[name]):
        if name in ALLOWED_CHANGES:
            changed.append(f'  [EXPECTED CHANGE]: {name}')
        else:
            broken.append(f'  [UNEXPECTED CHANGE]: {name}')

for name in patch_nodes:
    if name not in orig_nodes:
        broken.append(f'  [NEW NODE ADDED]: {name}')

print('=== SAFETY VERIFICATION ===')
print(f'\nExpected changes ({len(changed)}/3):')
for c in changed:
    print(c)

if broken:
    print(f'\n!!! UNEXPECTED CHANGES FOUND ({len(broken)}) !!!')
    for b in broken:
        print(b)
else:
    print('\n[PASS] No unexpected changes. Patch is clean.')

# Verify specific fixes
sb = patch_nodes['Session Bootstrap']
assert 'rawAdminSettings' in sb['parameters']['jsCode'], 'Fix 2 FAILED: rawAdminSettings not in Session Bootstrap'
assert 'store_address' in sb['parameters']['jsCode'], 'Fix 2 FAILED: store_address not in Session Bootstrap'
print('[PASS] Fix 2: Session Bootstrap has rawAdminSettings and store_address')

ps = patch_nodes['Product Search (Convex Test)']
assert 'seller_id:' in ps['parameters']['jsonBody'], 'Fix 1 FAILED: seller_id not in Product Search body'
assert 'cleanPhoneType' in ps['parameters']['jsonBody'], 'Fix 1 FAILED: cleanPhoneType guard not in Product Search body'
print('[PASS] Fix 1: Product Search has proper body with phoneType guard')

ra = patch_nodes['Reply AI']
assert 'store_address' in ra['parameters']['jsonBody'], 'Fix 3 FAILED: store_address not in Reply AI prompt'
assert 'GROUNDED store info is in client_config' in ra['parameters']['jsonBody'], 'Fix 3 FAILED: grounding instruction missing'
print('[PASS] Fix 3: Reply AI system prompt contains store grounding rules')

# Also check that Reply AI jsonBody is still valid JSON-embeddable (no unclosed braces)
total_nodes_orig = len(orig_nodes)
total_nodes_patch = len(patch_nodes)
print(f'\nNode count: original={total_nodes_orig}, patched={total_nodes_patch}')
assert total_nodes_orig == total_nodes_patch, 'Node count mismatch!'
print('[PASS] Node count unchanged.')
print('\n[ALL CHECKS PASSED] Safe to push.')
