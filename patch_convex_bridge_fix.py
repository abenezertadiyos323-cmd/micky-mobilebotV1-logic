"""
Precise 4-fix patch for Convex bridge restoration.
Changes ONLY the 4 specified nodes. No other nodes are touched.
"""
import json
import shutil
from datetime import datetime

# --- Load workflow ---
with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

# --- Backup first ---
ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/convex-bridge-fix-{ts}.json'
shutil.copy('workflow.json', backup_path)
print(f'Backup saved: {backup_path}')

nodes = {n['name']: n for n in w.get('nodes', [])}
changes = []

# ==========================================
# FIX 1: Product Search (Convex Test)
# Problem: sends entire session/rules_output to Convex instead of a proper
#          search body, and has no guard for empty phoneType
# Fix: revert jsonBody to the proper search format with empty-value guards
# ==========================================
if 'Product Search (Convex Test)' in nodes:
    ps = nodes['Product Search (Convex Test)']
    old_body = ps['parameters'].get('jsonBody', '')
    
    new_body = """={{ JSON.stringify({
  seller_id: (() => {
    const cfg = $json.client_config;
    if (cfg && typeof cfg.store_name === 'string' && cfg.store_name.trim()) {
      return cfg.store_name.trim().toLowerCase();
    }
    return $env.SELLER_ID || 'missing_seller_id';
  })(),
  phoneType: (() => {
    const cleanPhoneType = (value) => {
      if (typeof value !== 'string') return null;
      const normalized = value
        .replace(/\\b(32|64|128|256|512|1024)\\s*gb\\b/ig, ' ')
        .replace(/\\b(iphone|samsung|pixel|redmi|xiaomi|tecno|infinix|oppo|vivo|realme|itel|nokia)(\\d)/ig, '$1 $2')
        .replace(/\\b(pro)(max)\\b/ig, '$1 $2')
        .replace(/\\s+/g, ' ')
        .trim();
      return normalized || null;
    };
    const text = String($json.event?.text || '').trim();
    const extractFromText = (value) => {
      const source = String(value || '').trim();
      if (!source) return null;
      const match = source.match(/\\b(?:iphone\\s*\\d+(?:\\s*(?:pro\\s*max|pro|max|plus|mini))?|samsung\\s*[a-z0-9+ ]+|pixel\\s*[a-z0-9+ ]+|redmi\\s*[a-z0-9+ ]+|xiaomi\\s*[a-z0-9+ ]+|tecno\\s*[a-z0-9+ ]+|infinix\\s*[a-z0-9+ ]+|oppo\\s*[a-z0-9+ ]+|vivo\\s*[a-z0-9+ ]+|realme\\s*[a-z0-9+ ]+|itel\\s*[a-z0-9+ ]+|nokia\\s*[a-z0-9+ ]+)\\b/i);
      return cleanPhoneType(match ? match[0] : null);
    };
    const explicit = cleanPhoneType($json.rules_output?.resolver_input?.resolved_product_name || null);
    if (explicit) return explicit;
    const fromText = extractFromText(text);
    if (fromText) return fromText;
    const ref = $json.understanding_output?.reference_resolution?.refers_to;
    if (typeof ref === 'string') {
      const normalized = cleanPhoneType(ref);
      const blocked = ['desired_phone', 'current_phone', 'last_shown_option', 'cheaper_option', 'previous_selection', 'none'];
      if (normalized && !blocked.includes(normalized.toLowerCase())) return normalized;
    }
    const fromContext = cleanPhoneType(([
      $json.rules_output?.resolver_input?.product_context?.brand,
      $json.rules_output?.resolver_input?.product_context?.model,
    ].filter(Boolean).join(' ').trim() || [
      $json.session?.collected_constraints?.brand,
      $json.session?.collected_constraints?.model,
    ].filter(Boolean).join(' ').trim()));
    if (fromContext) return fromContext;
    return null;
  })(),
  storage: (() => {
    const s = $json.rules_output?.resolver_input?.product_context?.storage
      ?? $json.session?.collected_constraints?.storage
      ?? null;
    if (typeof s !== 'string' || !s.trim()) return null;
    const m = s.match(/\\b(32|64|128|256|512|1024)\\s*gb\\b/i);
    return m ? (m[1] + 'GB') : null;
  })(),
}) }}"""
    
    ps['parameters']['jsonBody'] = new_body
    # Remove wrong options key if present
    if 'responsePropertyName' in ps['parameters'].get('options', {}):
        del ps['parameters']['options']['responsePropertyName']
    
    changes.append('Fix 1: Product Search (Convex Test) - restored proper search body with phoneType guard')
    print('  [OK] Fix 1: Product Search jsonBody restored')
else:
    print('  [SKIP] Fix 1: Product Search node not found')

# ==========================================
# FIX 2: Session Bootstrap - read adminSettings from Session Load
# Problem: client_config is hardcoded; adminSettings from Convex is ignored
# Fix: read adminSettings from the upstream Session Load node
# ==========================================
if 'Session Bootstrap' in nodes:
    sb = nodes['Session Bootstrap']
    old_code = sb['parameters'].get('jsCode', '')
    
    # Find the client_config block and replace it
    old_config = '''const client_config = {
  "store_name": $env.STORE_NAME || $json.store_name || "Store",
  "default_language": $env.DEFAULT_LANG || "am",
  "supports_exchange": true,
  "supports_finance": false,
  "telegram_bot_name": $env.BOT_NAME || $json.bot_name || "Bot",
  "sellerId": $env.SELLER_ID || $json.seller_id || null,
};'''

    new_config = '''// Read adminSettings from the upstream Session Load Convex response
const rawAdminSettings = (() => {
  // adminSettings comes in through Session Load node's json output
  try {
    const loaded = $('Session Load').first()?.json;
    if (loaded && loaded.adminSettings && typeof loaded.adminSettings === 'object') {
      return loaded.adminSettings;
    }
  } catch {}
  return null;
})();

const client_config = {
  "store_name": $env.STORE_NAME || rawAdminSettings?.storeName || $json.store_name || "TedyTech",
  "default_language": $env.DEFAULT_LANG || "am",
  "supports_exchange": true,
  "supports_finance": false,
  "telegram_bot_name": $env.BOT_NAME || $json.bot_name || "TedyTech Bot",
  "sellerId": $env.SELLER_ID || $json.seller_id || null,
  "store_address": rawAdminSettings?.storeAddress || null,
  "store_location_link": rawAdminSettings?.storeLocationLink || null,
  "support_contact": rawAdminSettings?.supportContact || null,
  "warranty_policy": rawAdminSettings?.warrantyPolicy || null,
  "exchange_rules": rawAdminSettings?.exchangeRules || null,
};'''

    if old_config in old_code:
        new_code = old_code.replace(old_config, new_config)
        sb['parameters']['jsCode'] = new_code
        changes.append('Fix 2: Session Bootstrap - now reads adminSettings from Convex via Session Load')
        print('  [OK] Fix 2: Session Bootstrap updated with adminSettings reader')
    else:
        # Try a more flexible match - just find and replace the client_config block
        import re
        # Find block starting with client_config and ending with };
        pattern = r'const client_config = \{[^}]+(?:\{[^}]*\}[^}]*)?\};'
        match = re.search(pattern, old_code)
        if match:
            new_code = old_code[:match.start()] + new_config + old_code[match.end():]
            sb['parameters']['jsCode'] = new_code
            changes.append('Fix 2: Session Bootstrap - now reads adminSettings from Convex (regex match)')
            print('  [OK] Fix 2: Session Bootstrap updated (regex match)')
        else:
            print('  [WARN] Fix 2: Could not find client_config block in Session Bootstrap')
            print('  Current client_config area:')
            idx = old_code.find('client_config')
            if idx >= 0:
                print(old_code[max(0,idx-20):idx+300])
else:
    print('  [SKIP] Fix 2: Session Bootstrap node not found')

# ==========================================
# FIX 3: Reply AI system prompt - add store_address usage instruction
# Problem: AI doesn't know to look at client_config.store_address
# Fix: update the store-info rule to tell AI about the new fields
# ==========================================
if 'Reply AI' in nodes:
    ra = nodes['Reply AI']
    old_body = ra['parameters'].get('jsonBody', '')
    
    old_store_rule = 'Store-info rules:\\\\n- If rules_output.resolver_input.flow is info or understanding_output.topic is store_info, answer only the store-info request.\\\\n- If grounded store-info facts are missing, do not invent address, location, hours, or contact details. Say briefly that the exact store detail is not available here right now.\\\\n- After a store-info answer, do not append a product-search question unless the same message also asked about products.'
    
    new_store_rule = 'Store-info rules:\\\\n- If rules_output.resolver_input.flow is info or understanding_output.topic is store_info, answer only the store-info request.\\\\n- GROUNDED store info is in client_config: store_address contains the physical address, store_location_link is the maps link, support_contact is the phone/contact number, warranty_policy is the warranty info.\\\\n- If client_config.store_address is present, use it directly to answer location questions. Do NOT say the information is unavailable.\\\\n- If a specific detail is missing from client_config (e.g., store_location_link is null), only then say that specific detail is not available.\\\\n- After a store-info answer, do not append a product-search question unless the same message also asked about products.'
    
    if old_store_rule in old_body:
        new_body = old_body.replace(old_store_rule, new_store_rule)
        ra['parameters']['jsonBody'] = new_body
        changes.append('Fix 3: Reply AI - updated store-info rules to use client_config.store_address')
        print('  [OK] Fix 3: Reply AI system prompt updated')
    else:
        print('  [WARN] Fix 3: Could not find the exact store-info rule in Reply AI prompt')
        # Show what we have
        idx = old_body.find('Store-info rules')
        if idx >= 0:
            print('  Found at index:', idx)
            print('  Current text (100 chars):', repr(old_body[idx:idx+200]))
        else:
            print('  Store-info rules block not found at all')
else:
    print('  [SKIP] Fix 3: Reply AI node not found')

# ==========================================
# Save and report
# ==========================================
with open('workflow.json', 'w', encoding='utf-8') as f:
    json.dump(w, f, indent=2, ensure_ascii=False)

print('\n=== CHANGES APPLIED ===')
for c in changes:
    print(f'  - {c}')
print(f'\nTotal: {len(changes)}/3 fixes applied')
print('workflow.json saved.')
