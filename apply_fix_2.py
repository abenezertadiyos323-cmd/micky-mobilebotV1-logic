import json, sys, shutil
from datetime import datetime
sys.stdout.reconfigure(encoding='utf-8')

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

# Backup
ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/rules-guard-fix2-{ts}.json'
shutil.copy('workflow.json', backup_path)
print(f'Backup saved: {backup_path}')

rl = next((n for n in w['nodes'] if n['name'] == 'Rules Layer'), None)
if rl:
    old_code = rl['parameters']['jsCode']
    
    # We want to replace the final fallback part that blindly resolves business messages.
    # We will wrap it in a condition.
    
    # The piece we want to replace starts here:
    BLOCK = "} else {\r\n  const isBusiness = true;\r\n  rules_output = {\r\n    ...rules_output,\r\n    reply_mode: isBusiness ? 'business_resolve' : 'resume_previous_flow',\r\n    should_call_resolver: isBusiness,\r\n    resolver_input: {\r\n      ...rules_output.resolver_input,\r\n      flow: intentFlow ?? effectiveFlow,\r\n      product_context: productContext,\r\n      missing_fields,\r\n    },\r\n    session_update: {\r\n      ...rules_output.session_update,\r\n      flow_stage: intentFlow ?? effectiveFlow,\r\n      last_asked_key,\r\n    },\r\n    reasoning: isBusiness ? 'fresh_business_request' : 'fresh_non_business_message',\r\n  };\r\n}\r\n\r\nreturn [{"
    
    # Let's find exactly what's there
    idx = old_code.rfind("} else {\r\n  const isBusiness = true;")
    if idx > 0:
      print("Found the target block!")
      
      # Where does it end before the return statement?
      ret_idx = old_code.find("return [{", idx)
      
      original_block = old_code[idx:ret_idx]
      
      NEW_BLOCK = """} else {
  const isBusiness = true;
  
  // GUARD: if intent is buy/pricing but no product info collected yet,
  // ask which phone instead of jumping to the resolver
  const hasProductContext = Boolean(
    mergedConstraints.brand ||
    mergedConstraints.model ||
    mergedConstraints.phoneType ||
    productContext.brand ||
    productContext.model ||
    productContext.phoneType ||
    resolvedProduct
  );
  
  const isBuyOrPricingIntent = effectiveFlow === 'buy' || businessIntent === 'pricing' || businessIntent === 'buy';

  if (isBuyOrPricingIntent && !hasProductContext && missing_fields.length === 0) {
    rules_output = {
      ...rules_output,
      reply_mode: 'clarify_reference',
      should_call_resolver: false,
      resolver_input: {
        ...rules_output.resolver_input,
        flow: intentFlow ?? effectiveFlow,
        product_context: productContext,
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
      reply_mode: isBusiness ? 'business_resolve' : 'resume_previous_flow',
      should_call_resolver: isBusiness,
      resolver_input: {
        ...rules_output.resolver_input,
        flow: intentFlow ?? effectiveFlow,
        product_context: productContext,
        missing_fields,
      },
      session_update: {
        ...rules_output.session_update,
        flow_stage: intentFlow ?? effectiveFlow,
        last_asked_key,
      },
      reasoning: isBusiness ? 'fresh_business_request' : 'fresh_non_business_message',
    };
  }
}

"""
      # Normalize new block line endings to match Windows
      NEW_BLOCK = NEW_BLOCK.replace('\\n', '\\r\\n')
      
      new_code = old_code[:idx] + NEW_BLOCK + old_code[ret_idx:]
      rl['parameters']['jsCode'] = new_code
      print("Successfully injected the guard block.")
    else:
      print("Could not find the target '} else { const isBusiness = true;' block.")
      
else:
    print("Rules Layer not found.")

with open('workflow.json', 'w', encoding='utf-8') as f:
    json.dump(w, f, indent=2, ensure_ascii=False)
    
print("Saved workflow.json.")
