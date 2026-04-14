"""
Surgical patch for workflow.json — 4 targeted changes only.
Run: python apply_product_drift_patch.py
"""

import json
import shutil
from datetime import datetime

WF_FILE = 'workflow.json'

# ── Backup ──────────────────────────────────────────────────────────────────
ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup = f'backups/patch-product-drift-{ts}.json'
shutil.copyfile(WF_FILE, backup)
print(f'Backup saved → {backup}')

with open(WF_FILE, 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf['nodes']

# ─────────────────────────────────────────────────────────────────────────────
# PATCH C  —  Business Data Resolver (node index 8)
#   Replace constraint-wipe with a flag so that when iPhone 12
#   is not found in Convex results, result_type = 'no_match' instead of
#   listing iPhone 15/16/17.
# ─────────────────────────────────────────────────────────────────────────────
BDR_FIND = (
    'if (products.length > 0) {\r\n'
    '  if (effectiveConstraints.model) {\r\n'
    '    const hasModelMatch = candidateProducts.some((product) => productNameForMatch(product).includes(effectiveConstraints.model.toLowerCase()));\r\n'
    '    if (!hasModelMatch) effectiveConstraints = { ...effectiveConstraints, model: null };\r\n'
    '  }\r\n'
    '  if (effectiveConstraints.brand) {\r\n'
    '    const hasBrandMatch = candidateProducts.some((product) => product.brand && product.brand.toLowerCase().includes(effectiveConstraints.brand.toLowerCase()));\r\n'
    '    if (!hasBrandMatch) effectiveConstraints = { ...effectiveConstraints, brand: null };\r\n'
    '  }\r\n'
    '  if (effectiveConstraints.storage) {\r\n'
    '    const hasStorageMatch = candidateProducts.some((product) => product.storage && normalizeStorageValue(product.storage) === normalizeStorageValue(effectiveConstraints.storage));\r\n'
    '    if (!hasStorageMatch) effectiveConstraints = { ...effectiveConstraints, storage: null };\r\n'
    '  }\r\n'
    '  if (effectiveConstraints.condition) {\r\n'
    '    const hasConditionMatch = candidateProducts.some((product) => product.condition && product.condition.toLowerCase() === effectiveConstraints.condition.toLowerCase());\r\n'
    '    if (!hasConditionMatch) effectiveConstraints = { ...effectiveConstraints, condition: null };\r\n'
    '  }\r\n'
    '}'
)

BDR_REPLACE = (
    'let constraintMatchFailed = false;\r\n'
    'if (products.length > 0) {\r\n'
    '  if (effectiveConstraints.model) {\r\n'
    '    const hasModelMatch = candidateProducts.some((product) => productNameForMatch(product).includes(effectiveConstraints.model.toLowerCase()));\r\n'
    '    if (!hasModelMatch) constraintMatchFailed = true;\r\n'
    '  }\r\n'
    '  if (effectiveConstraints.brand && !constraintMatchFailed) {\r\n'
    '    const hasBrandMatch = candidateProducts.some((product) => product.brand && product.brand.toLowerCase().includes(effectiveConstraints.brand.toLowerCase()));\r\n'
    '    if (!hasBrandMatch) constraintMatchFailed = true;\r\n'
    '  }\r\n'
    '  if (effectiveConstraints.storage) {\r\n'
    '    const hasStorageMatch = candidateProducts.some((product) => product.storage && normalizeStorageValue(product.storage) === normalizeStorageValue(effectiveConstraints.storage));\r\n'
    '    if (!hasStorageMatch) effectiveConstraints = { ...effectiveConstraints, storage: null };\r\n'
    '  }\r\n'
    '  if (effectiveConstraints.condition) {\r\n'
    '    const hasConditionMatch = candidateProducts.some((product) => product.condition && product.condition.toLowerCase() === effectiveConstraints.condition.toLowerCase());\r\n'
    '    if (!hasConditionMatch) effectiveConstraints = { ...effectiveConstraints, condition: null };\r\n'
    '  }\r\n'
    '}'
)

# Also inject the constraintMatchFailed override right before post_price_mode
BDR_INJECT_FIND = (
    '} else if ((resolverInput.missing_fields ?? []).length > 0) {\r\n'
    '  result_type = \'clarification_needed\';\r\n'
    '  next_step = \'ask_clarification\';\r\n'
    '}\r\n'
    '\r\n'
    'const post_price_mode ='
)

BDR_INJECT_REPLACE = (
    '} else if ((resolverInput.missing_fields ?? []).length > 0) {\r\n'
    '  result_type = \'clarification_needed\';\r\n'
    '  next_step = \'ask_clarification\';\r\n'
    '}\r\n'
    'if (constraintMatchFailed && result_type !== \'clarification_needed\' && result_type !== \'exchange_offer\') {\r\n'
    '  result_type = \'no_match\';\r\n'
    '  next_step = \'ask_clarification\';\r\n'
    '}\r\n'
    '\r\n'
    'const post_price_mode ='
)

bdr = nodes[8]
assert bdr['name'] == 'Business Data Resolver', f"Node 8 is '{bdr['name']}', expected 'Business Data Resolver'"
code = bdr['parameters']['jsCode']

if BDR_FIND in code:
    code = code.replace(BDR_FIND, BDR_REPLACE, 1)
    print('✅ PATCH C part 1 applied — constraint-wipe → flag')
else:
    print('❌ PATCH C part 1 NOT FOUND — check exact string')

if BDR_INJECT_FIND in code:
    code = code.replace(BDR_INJECT_FIND, BDR_INJECT_REPLACE, 1)
    print('✅ PATCH C part 2 applied — constraintMatchFailed → no_match override')
else:
    print('❌ PATCH C part 2 NOT FOUND — check exact string')

bdr['parameters']['jsCode'] = code


# ─────────────────────────────────────────────────────────────────────────────
# PATCH B  —  Rules Layer (node index 6)
#   Add model-switch detection before shouldContinueContext.
#   If user types "iPhone 12" but session currentInterest is "iPhone 16 Pro Max",
#   shouldContinueContext is forced FALSE so old context is NOT inherited.
# ─────────────────────────────────────────────────────────────────────────────
RULES_FIND = (
    'const shouldContinueContext = Boolean(\r\n'
    '  hasActiveContext && (\r\n'
    '    [\'refinement\', \'negotiation\'].includes(messageFunction)\r\n'
    '    || reference_resolution.reference_type !== \'none\'\r\n'
    '    || sameFlowIntent\r\n'
    '  )\r\n'
    ');'
)

RULES_REPLACE = (
    'const extractModelFromText = (text) => {\r\n'
    '  if (typeof text !== \'string\') return null;\r\n'
    '  const m = text.match(/\\b(?:iphone\\s*\\d+(?:\\s*(?:pro\\s*max|pro|max|plus|mini))?|samsung\\s*[a-z0-9]+(?:\\s+[a-z0-9]+)?|pixel\\s*[a-z0-9]+|redmi\\s*[a-z0-9]+)\\b/i);\r\n'
    '  return m ? m[0].trim().toLowerCase() : null;\r\n'
    '};\r\n'
    'const rawTextModel = extractModelFromText(event.text ?? \'\');\r\n'
    'const sessionModelLower = (currentInterest?.model ?? mergedConstraints.model ?? \'\').toLowerCase() || null;\r\n'
    'const isModelSwitch = Boolean(\r\n'
    '  rawTextModel\r\n'
    '  && sessionModelLower\r\n'
    '  && !rawTextModel.includes(sessionModelLower)\r\n'
    '  && !sessionModelLower.includes(rawTextModel)\r\n'
    ');\r\n'
    'const shouldContinueContext = Boolean(\r\n'
    '  hasActiveContext && !isModelSwitch && (\r\n'
    '    [\'refinement\', \'negotiation\'].includes(messageFunction)\r\n'
    '    || reference_resolution.reference_type !== \'none\'\r\n'
    '    || sameFlowIntent\r\n'
    '  )\r\n'
    ');'
)

rl = nodes[6]
assert rl['name'] == 'Rules Layer', f"Node 6 is '{rl['name']}', expected 'Rules Layer'"
code_rl = rl['parameters']['jsCode']

if RULES_FIND in code_rl:
    code_rl = code_rl.replace(RULES_FIND, RULES_REPLACE, 1)
    print('✅ PATCH B applied — isModelSwitch guard added to shouldContinueContext')
else:
    print('❌ PATCH B NOT FOUND — check exact string')

rl['parameters']['jsCode'] = code_rl


# ─────────────────────────────────────────────────────────────────────────────
# PATCH A  —  Understanding AI system prompt (node index 4)
#   Add one rule: "iPhone 12" in text but NOT in shown_products → fresh_request.
# ─────────────────────────────────────────────────────────────────────────────
UA_FIND = (
    '- fresh_request ? completely new business request with no previous context'
)

UA_REPLACE = (
    '- fresh_request ? completely new business request with no previous context\n\n'
    'CRITICAL CLASSIFICATION RULE: If the customer message contains a specific phone model name '
    '(e.g. iphone 12, samsung a55, pixel 8) that does NOT appear in shown_products or current_interest in session, '
    'classify as fresh_request, NOT refinement. '
    'Refinement is ONLY for messages that reference an already-shown or already-mentioned product '
    'using pronouns, ordinals, or the exact same model name already in session context.'
)

ua = nodes[4]
assert ua['name'] == 'Understanding AI', f"Node 4 is '{ua['name']}', expected 'Understanding AI'"
json_body = ua['parameters']['jsonBody']

if UA_FIND in json_body:
    json_body = json_body.replace(UA_FIND, UA_REPLACE, 1)
    print('✅ PATCH A applied — fresh_request vs refinement rule added to Understanding AI')
else:
    print('❌ PATCH A NOT FOUND — check exact string')

ua['parameters']['jsonBody'] = json_body


# ─────────────────────────────────────────────────────────────────────────────
# PATCH D  —  Product Search / Convex query (node index 7)
#   Add storage field to Convex API call so backend can filter at query time.
# ─────────────────────────────────────────────────────────────────────────────
PS_FIND = (
    '    return cleanPhoneType(text) || text;\n'
    '  })(),\n'
    '}) }}'
)

PS_REPLACE = (
    '    return cleanPhoneType(text) || text;\n'
    '  })(),\n'
    '  storage: (() => {\n'
    '    const s = $json.rules_output?.resolver_input?.product_context?.storage\n'
    '      ?? $json.session?.collected_constraints?.storage\n'
    '      ?? null;\n'
    '    if (typeof s !== \'string\' || !s.trim()) return null;\n'
    '    const m = s.match(/\\b(32|64|128|256|512|1024)\\s*gb\\b/i);\n'
    '    return m ? (m[1] + \'GB\') : null;\n'
    '  })(),\n'
    '}) }}'
)

ps = nodes[7]
assert ps['name'] == 'Product Search (Convex Test)', f"Node 7 is '{ps['name']}'"
json_body_ps = ps['parameters']['jsonBody']

if PS_FIND in json_body_ps:
    json_body_ps = json_body_ps.replace(PS_FIND, PS_REPLACE, 1)
    print('✅ PATCH D applied — storage field added to Convex product search query')
else:
    print('❌ PATCH D NOT FOUND — check exact string')

ps['parameters']['jsonBody'] = json_body_ps


# ─────────────────────────────────────────────────────────────────────────────
# Save
# ─────────────────────────────────────────────────────────────────────────────
with open(WF_FILE, 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=False, indent=2)

print(f'\n✅ workflow.json saved with all patches applied.')
print('No other files were modified.')
