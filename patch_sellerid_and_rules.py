import json, shutil, sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/sellerid-and-rules-guard-{ts}.json'
shutil.copy('workflow.json', backup_path)
print(f'Backup saved: {backup_path}')

nodes = {n['name']: n for n in w['nodes']}
changes = []

# ============================================================
# FIX 1 — Product Search: hardcode correct sellerId fallback
# ============================================================
ps = nodes.get('Product Search (Convex Test)')
if ps:
    old_body = ps['parameters'].get('jsonBody', '')
    
    # The current fallback ends with: return $env.SELLER_ID || 'missing_seller_id';
    # We need to add "8319120114" as the hardcoded known-good fallback
    old_fallback = "return $env.SELLER_ID || 'missing_seller_id';"
    new_fallback  = "return $env.SELLER_ID || '8319120114';"
    
    if old_fallback in old_body:
        ps['parameters']['jsonBody'] = old_body.replace(old_fallback, new_fallback)
        changes.append('Fix 1: Product Search sellerId fallback set to "8319120114"')
        print('[OK] Fix 1 applied.')
    else:
        print(f'[WARN] Fix 1: could not find fallback string. Looking for it...')
        idx = old_body.find('SELLER_ID')
        if idx >= 0:
            print(repr(old_body[max(0,idx-50):idx+120]))
else:
    print('[SKIP] Product Search node not found')

# ============================================================
# FIX 2 — Rules Layer: guard against resolver being called
#          when user intent is buy/pricing but no product specified
# ============================================================
rl = nodes.get('Rules Layer')
if rl:
    old_code = rl['parameters'].get('jsCode', '')
    
    # We need to insert a guard AFTER the resolver_input/output object is built
    # but BEFORE the final return. The guard checks: if intent is buy/pricing
    # but product_context has no phoneType/brand/model, switch to clarify_reference.
    
    # Find the block that sets should_call_resolver = true for business_resolve
    # We'll look for the comment/marker before the final output block
    OLD_GUARD_ANCHOR = "  reply_mode: 'business_resolve',\n  should_call_resolver: true,"
    
    NEW_GUARD = """  reply_mode: 'business_resolve',
  should_call_resolver: true,"""
    
    # The guard to inject — placed right before should_call_resolver: true is returned
    # We locate the final business_resolve output block
    
    # Better approach: find "should_call_resolver: true" inside business_resolve and
    # wrap with a no-product guard
    
    # Locate the line: reply_mode: 'business_resolve',
    idx = old_code.find("reply_mode: 'business_resolve',")
    if idx < 0:
        print('[WARN] Fix 2: could not find business_resolve output block')
    else:
        # Find the surrounding output block to understand context
        # Find where this is assigned and what comes before it
        # We'll inject the guard logic BEFORE the rules_output = { block
        
        # Strategy: find the line that kicks off the business_resolve assignment
        # and insert a product-check guard above it
        
        ANCHOR_BEFORE_RESOLVE = "const rules_output = {"
        # There may be multiple. Find the one that contains business_resolve
        
        # Safer: find the position of the business_resolve block 
        # and walk back to find the rules_output assignment
        block_start = old_code.rfind(ANCHOR_BEFORE_RESOLVE, 0, idx)
        
        if block_start >= 0:
            # The guard goes right before this assignment
            guard_code = """// GUARD: if intent is buy/pricing but no product info collected yet,
// ask which phone instead of jumping to the resolver
const hasProductContext = Boolean(
  mergedConstraints.brand ||
  mergedConstraints.model ||
  productContext.brand ||
  productContext.model ||
  resolvedProduct
);
const isBuyOrPricingIntent = effectiveFlow === 'buy' || businessIntent === 'pricing' || businessIntent === 'buy';

if (isBuyOrPricingIntent && !hasProductContext && missing_fields.length === 0) {
  rules_output = {
    reply_mode: 'clarify_reference',
    should_call_resolver: false,
    resolver_input: {
      flow: effectiveFlow,
      product_context: productContext,
      missing_fields: ['phoneType'],
      resolved_reference: null,
      resolved_product_name: null,
    },
    session_update: {
      last_topic: effectiveTopic,
      flow_stage: effectiveFlow,
      ambiguous_reference: null,
      resolved_ambiguity: false,
      collected_constraints: mergedConstraints,
      last_asked_key: 'phoneType',
    },
    confidence,
    reasoning: 'no_product_context_needs_clarification',
  };
} else {
"""
            
            # Find the end of the entire if/else block that contains rules_output = {
            # by locating the final return statement after it
            return_idx = old_code.find('return [{', block_start)
            if return_idx < 0:
                return_idx = old_code.find('return [{\n', block_start)
            
            if return_idx > 0:
                # Insert the guard before the rules_output = { block
                new_code = (
                    old_code[:block_start] +
                    guard_code +
                    old_code[block_start:return_idx] +
                    '}\n\n' +
                    old_code[return_idx:]
                )
                rl['parameters']['jsCode'] = new_code
                changes.append('Fix 2: Rules Layer — guard added to ask for phone model before resolving')
                print('[OK] Fix 2 applied.')
            else:
                print('[WARN] Fix 2: could not find return statement after rules_output block')
        else:
            print('[WARN] Fix 2: could not find rules_output assignment block')
else:
    print('[SKIP] Rules Layer node not found')

# Save
with open('workflow.json', 'w', encoding='utf-8') as f:
    json.dump(w, f, indent=2, ensure_ascii=False)

print('\n=== CHANGES ===')
for c in changes:
    print(f'  - {c}')
print(f'Total: {len(changes)}/2 applied')
