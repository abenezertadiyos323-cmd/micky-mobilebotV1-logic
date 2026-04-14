import json, shutil, sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

# Backup
ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/rules-guard-fix3-{ts}.json'
shutil.copy('workflow.json', backup_path)

rl = next((n for n in w['nodes'] if n['name'] == 'Rules Layer'), None)
if rl:
    old_code = rl['parameters']['jsCode']
    
    # We want to replace the `rules_output = {` definition inside the `fresh_request` block.
    # We can anchor on:
    ANCHOR_START = "  rules_output = {\r\n    ...rules_output,\r\n    reply_mode: isBusiness ? 'business_resolve' : 'off_topic_redirect',\r\n    should_call_resolver: isBusiness,"
    
    idx_start = old_code.find(ANCHOR_START)
    if idx_start > 0:
        idx_end = old_code.find("  };\r\n}\r\n\r\nreturn", idx_start)
        
        if idx_end > 0:
            original_block = old_code[idx_start:idx_end + 6]
            
            # The replacement block injects the product check
            NEW_BLOCK = """
  // GUARD: Ask which phone if intent is buy/pricing but no product info collected
  const hasProductContext = Boolean(
    mergedConstraints.brand ||
    mergedConstraints.model ||
    mergedConstraints.phoneType ||
    productContext.brand ||
    productContext.model ||
    productContext.phoneType ||
    resolvedProduct
  );
  const isBuyOrPricingIntent = isBusiness && (intentFlow === 'buy' || effectiveFlow === 'buy' || businessIntent === 'pricing');

  if (isBuyOrPricingIntent && !hasProductContext && missing_fields.length === 0) {
    rules_output = {
      ...rules_output,
      reply_mode: 'clarify_reference',
      should_call_resolver: false,
      resolver_input: {
        ...rules_output.resolver_input,
        flow: intentFlow ?? effectiveFlow,
        missing_fields: ['phoneType'],
      },
      session_update: {
        ...rules_output.session_update,
        flow_stage: intentFlow ?? effectiveFlow,
        last_asked_key: 'phoneType',
      },
      reasoning: 'no_product_context_needs_clarification',
    };
  } else {
    rules_output = {
      ...rules_output,
      reply_mode: isBusiness ? 'business_resolve' : 'off_topic_redirect',
      should_call_resolver: isBusiness,
      resolver_input: {
        ...rules_output.resolver_input,
        flow: intentFlow ?? effectiveFlow,
      },
      session_update: {
        ...rules_output.session_update,
        flow_stage: intentFlow ?? effectiveFlow,
        last_asked_key,
      },
      reasoning: isBusiness ? 'fresh_business_request' : 'fresh_non_business_message',
    };
  }
"""
            # Normalize to Windows line endings
            NEW_BLOCK = NEW_BLOCK.replace('\n', '\r\n')
            
            new_code = old_code[:idx_start] + NEW_BLOCK + old_code[idx_end+6:]
            rl['parameters']['jsCode'] = new_code
            print("[OK] Successfully injected Rules Layer guard.")
        else:
            print("[WARN] Could not find end anchor")
    else:
        print("[WARN] Could not find start anchor")

with open('workflow.json', 'w', encoding='utf-8') as f:
    json.dump(w, f, indent=2, ensure_ascii=False)
