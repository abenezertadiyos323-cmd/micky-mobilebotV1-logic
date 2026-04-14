"""
Surgical patch for workflow.json — Patches B and C (BDR + Rules Layer jsCode fixes).
Patches A and D already applied. Run this to complete all 4 patches.
"""

import json
import shutil
from datetime import datetime

WF_FILE = 'workflow.json'

ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup = f'backups/patch-product-drift-BC-{ts}.json'
shutil.copyfile(WF_FILE, backup)
print(f'Backup saved → {backup}')

with open(WF_FILE, 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf['nodes']

# ─────────────────────────────────────────────────────────────────────────────
# PATCH C — Business Data Resolver (node index 8)
#   Part 1: Replace constraint-wipe with a flag (constraintMatchFailed)
#   Part 2: Use that flag to force result_type = 'no_match' at end of chain
# ─────────────────────────────────────────────────────────────────────────────
BDR_FIND_1 = (
    'if (products.length > 0) {\n'
    '  if (effectiveConstraints.model) {\n'
    '    const hasModelMatch = candidateProducts.some((product) => productNameForMatch(product).includes(effectiveConstraints.model.toLowerCase()));\n'
    '    if (!hasModelMatch) effectiveConstraints = { ...effectiveConstraints, model: null };\n'
    '  }\n'
    '  if (effectiveConstraints.brand) {\n'
    '    const hasBrandMatch = candidateProducts.some((product) => product.brand && product.brand.toLowerCase().includes(effectiveConstraints.brand.toLowerCase()));\n'
    '    if (!hasBrandMatch) effectiveConstraints = { ...effectiveConstraints, brand: null };\n'
    '  }\n'
    '  if (effectiveConstraints.storage) {\n'
    '    const hasStorageMatch = candidateProducts.some((product) => product.storage && normalizeStorageValue(product.storage) === normalizeStorageValue(effectiveConstraints.storage));\n'
    '    if (!hasStorageMatch) effectiveConstraints = { ...effectiveConstraints, storage: null };\n'
    '  }\n'
    '  if (effectiveConstraints.condition) {\n'
    '    const hasConditionMatch = candidateProducts.some((product) => product.condition && product.condition.toLowerCase() === effectiveConstraints.condition.toLowerCase());\n'
    '    if (!hasConditionMatch) effectiveConstraints = { ...effectiveConstraints, condition: null };\n'
    '  }\n'
    '}'
)

BDR_REPLACE_1 = (
    'let constraintMatchFailed = false;\n'
    'if (products.length > 0) {\n'
    '  if (effectiveConstraints.model) {\n'
    '    const hasModelMatch = candidateProducts.some((product) => productNameForMatch(product).includes(effectiveConstraints.model.toLowerCase()));\n'
    '    if (!hasModelMatch) constraintMatchFailed = true;\n'
    '  }\n'
    '  if (effectiveConstraints.brand && !constraintMatchFailed) {\n'
    '    const hasBrandMatch = candidateProducts.some((product) => product.brand && product.brand.toLowerCase().includes(effectiveConstraints.brand.toLowerCase()));\n'
    '    if (!hasBrandMatch) constraintMatchFailed = true;\n'
    '  }\n'
    '  if (effectiveConstraints.storage) {\n'
    '    const hasStorageMatch = candidateProducts.some((product) => product.storage && normalizeStorageValue(product.storage) === normalizeStorageValue(effectiveConstraints.storage));\n'
    '    if (!hasStorageMatch) effectiveConstraints = { ...effectiveConstraints, storage: null };\n'
    '  }\n'
    '  if (effectiveConstraints.condition) {\n'
    '    const hasConditionMatch = candidateProducts.some((product) => product.condition && product.condition.toLowerCase() === effectiveConstraints.condition.toLowerCase());\n'
    '    if (!hasConditionMatch) effectiveConstraints = { ...effectiveConstraints, condition: null };\n'
    '  }\n'
    '}'
)

BDR_FIND_2 = (
    '} else if ((resolverInput.missing_fields ?? []).length > 0) {\n'
    '  result_type = \'clarification_needed\';\n'
    '  next_step = \'ask_clarification\';\n'
    '}\n'
    '\n'
    'const post_price_mode ='
)

BDR_REPLACE_2 = (
    '} else if ((resolverInput.missing_fields ?? []).length > 0) {\n'
    '  result_type = \'clarification_needed\';\n'
    '  next_step = \'ask_clarification\';\n'
    '}\n'
    'if (constraintMatchFailed && result_type !== \'clarification_needed\' && result_type !== \'exchange_offer\') {\n'
    '  result_type = \'no_match\';\n'
    '  next_step = \'ask_clarification\';\n'
    '}\n'
    '\n'
    'const post_price_mode ='
)

bdr = nodes[8]
assert bdr['name'] == 'Business Data Resolver', f"Node 8 name mismatch: {bdr['name']}"
code = bdr['parameters']['jsCode']

if BDR_FIND_1 in code:
    code = code.replace(BDR_FIND_1, BDR_REPLACE_1, 1)
    print('✅ PATCH C part 1 — constraint-wipe replaced with flag')
else:
    print('❌ PATCH C part 1 NOT FOUND')

if BDR_FIND_2 in code:
    code = code.replace(BDR_FIND_2, BDR_REPLACE_2, 1)
    print('✅ PATCH C part 2 — constraintMatchFailed → no_match override injected')
else:
    print('❌ PATCH C part 2 NOT FOUND')

bdr['parameters']['jsCode'] = code


# ─────────────────────────────────────────────────────────────────────────────
# PATCH B — Rules Layer (node index 6)
#   Add isModelSwitch detection before shouldContinueContext.
# ─────────────────────────────────────────────────────────────────────────────
RULES_FIND = (
    'const shouldContinueContext = Boolean(\n'
    '  hasActiveContext && (\n'
    '    [\'refinement\', \'negotiation\'].includes(messageFunction)\n'
    '    || reference_resolution.reference_type !== \'none\'\n'
    '    || sameFlowIntent\n'
    '  )\n'
    ');'
)

RULES_REPLACE = (
    'const extractModelFromText = (text) => {\n'
    '  if (typeof text !== \'string\') return null;\n'
    '  const m = text.match(/\\b(?:iphone\\s*\\d+(?:\\s*(?:pro\\s*max|pro|max|plus|mini))?|samsung\\s*[a-z0-9]+(?:\\s+[a-z0-9]+)?|pixel\\s*[a-z0-9]+|redmi\\s*[a-z0-9]+)\\b/i);\n'
    '  return m ? m[0].trim().toLowerCase() : null;\n'
    '};\n'
    'const rawTextModel = extractModelFromText(event.text ?? \'\');\n'
    'const sessionModelLower = (currentInterest?.model ?? mergedConstraints.model ?? \'\').toLowerCase() || null;\n'
    'const isModelSwitch = Boolean(\n'
    '  rawTextModel\n'
    '  && sessionModelLower\n'
    '  && !rawTextModel.includes(sessionModelLower)\n'
    '  && !sessionModelLower.includes(rawTextModel)\n'
    ');\n'
    'const shouldContinueContext = Boolean(\n'
    '  hasActiveContext && !isModelSwitch && (\n'
    '    [\'refinement\', \'negotiation\'].includes(messageFunction)\n'
    '    || reference_resolution.reference_type !== \'none\'\n'
    '    || sameFlowIntent\n'
    '  )\n'
    ');'
)

rl = nodes[6]
assert rl['name'] == 'Rules Layer', f"Node 6 name mismatch: {rl['name']}"
code_rl = rl['parameters']['jsCode']

if RULES_FIND in code_rl:
    code_rl = code_rl.replace(RULES_FIND, RULES_REPLACE, 1)
    print('✅ PATCH B — isModelSwitch guard added to Rules Layer')
else:
    print('❌ PATCH B NOT FOUND')

rl['parameters']['jsCode'] = code_rl


# ─────────────────────────────────────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────────────────────────────────────
with open(WF_FILE, 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=False, indent=2)

print('\n✅ workflow.json saved — Patches B and C complete.')
print('No other files were modified.')
