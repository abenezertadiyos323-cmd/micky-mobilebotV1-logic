import json, shutil, sys
from datetime import datetime

sys.stdout.reconfigure(encoding='utf-8')

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

# Backup
ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/exchange-battery-fix-{ts}.json'
shutil.copy('workflow.json', backup_path)
print(f'Backup saved: {backup_path}')

# 1. Patch Understanding AI schema
uai = next((n for n in w['nodes'] if n['name'] == 'Understanding AI'), None)
if uai:
    old_prompt = uai['parameters']['jsonBody']
    
    old_schema = """  "missing_information": [],
  "reference_resolution": {
    "refers_to": null,
    "resolved_id": null
  },
  "last_asked_key": null
}"""
    
    new_schema = """  "missing_information": [],
  "reference_resolution": {
    "refers_to": null,
    "resolved_id": null
  },
  "exchange_context": {
    "trade_in_model": "iphone 12 pro | null",
    "target_model": "iphone 15 pro max | null",
    "trade_in_condition": "new|used|damaged|null",
    "trade_in_battery_health": 85
  },
  "last_asked_key": null
}"""

    if old_schema in old_prompt:
        uai['parameters']['jsonBody'] = old_prompt.replace(old_schema, new_schema)
        print("[OK] Understanding AI prompt schema updated.")
    else:
        print("[WARN] Could not find the old schema string in Understanding AI prompt.")

# 2. Patch Rules Layer
rl = next((n for n in w['nodes'] if n['name'] == 'Rules Layer'), None)
if rl:
    old_code = rl['parameters']['jsCode']
    
    # We need to inject the logic to read exchange_context into mergedConstraints
    # Right around line 55 (after mergedConstraints is declared)
    
    inject_point_1 = "};\r\n\r\nconst referenceSource"
    
    logic_1 = """;

// --- START NEW EXCHANGE LOGIC ---
const exCtx = isRecord(understanding_output.exchange_context) ? understanding_output.exchange_context : {};
mergedConstraints.trade_in_model = normalizeText(exCtx.trade_in_model) ?? normalizeText(existingConstraintsSource.trade_in_model);
mergedConstraints.target_model = normalizeText(exCtx.target_model) ?? normalizeText(existingConstraintsSource.target_model);
mergedConstraints.trade_in_condition = normalizeText(exCtx.trade_in_condition) ?? normalizeText(existingConstraintsSource.trade_in_condition);
mergedConstraints.trade_in_battery_health = normalizeNullableNumber(exCtx.trade_in_battery_health) ?? normalizeNullableNumber(existingConstraintsSource.trade_in_battery_health);
// --- END NEW EXCHANGE LOGIC ---

const referenceSource"""

    if inject_point_1 in old_code:
        old_code = old_code.replace(inject_point_1, logic_1)
        print("[OK] Extracted exchange_context and persisted variables.")
    else:
        print("[WARN] Could not find inject point 1 (mergedConstraints).")

    # Now we need to update the rules for computedMissingFields for exchange
    # Right around line 138-144
    
    inject_point_2 = """if (effectiveFlow === 'exchange' && missingInformation.length === 0) {
  const needProductAnchor = !currentInterest && shownProducts.length === 0;
  if (needProductAnchor) {
    if (hasKnownBrand && !hasKnownModel) computedMissingFields.push('model');
    else if (!hasKnownBrand && !hasKnownModel) computedMissingFields.push('brand_or_model');
  }
  if (!mergedConstraints.condition) computedMissingFields.push('condition');
}"""

    logic_2 = """if (effectiveFlow === 'exchange') {
  // We don't just rely on general missingInformation anymore. We specifically check our new dedicated exchange fields.
  if (!mergedConstraints.trade_in_model) computedMissingFields.push('trade_in_model');
  if (!mergedConstraints.target_model) computedMissingFields.push('target_model');
  if (!mergedConstraints.trade_in_condition) computedMissingFields.push('trade_in_condition');
  
  // Battery health is only required if the trade-in phone is an iPhone
  const tradeInLower = (mergedConstraints.trade_in_model || '').toLowerCase();
  const isIphone = tradeInLower.includes('iphone') || tradeInLower.includes('apple');
  if (isIphone && mergedConstraints.trade_in_battery_health === null) {
    computedMissingFields.push('trade_in_battery_health');
  }
}"""
    
    if inject_point_2 in old_code:
        old_code = old_code.replace(inject_point_2, logic_2)
        print("[OK] Updated exchange clarification rules to demand both phones and battery health.")
    else:
        print("[WARN] Could not find inject point 2 (exchange missing field logic).")

    # Finally, we must make sure these properties are bundled into productContext 
    # so they pass through to BDR
    inject_point_3 = """const productContext = {
  brand: mergedConstraints.brand,
  model: mergedConstraints.model,
  storage: mergedConstraints.storage,
  condition: mergedConstraints.condition,
  budget_etb: mergedConstraints.budget_etb,"""

    logic_3 = """const productContext = {
  brand: mergedConstraints.brand,
  model: mergedConstraints.model,
  storage: mergedConstraints.storage,
  condition: mergedConstraints.condition,
  budget_etb: mergedConstraints.budget_etb,
  trade_in_model: mergedConstraints.trade_in_model,
  target_model: mergedConstraints.target_model,
  trade_in_condition: mergedConstraints.trade_in_condition,
  trade_in_battery_health: mergedConstraints.trade_in_battery_health,"""
  
    if inject_point_3 in old_code:
        old_code = old_code.replace(inject_point_3, logic_3)
        print("[OK] Bundled exchange constraints into productContext.")
    else:
        print("[WARN] Could not find inject point 3 (productContext).")

    # Save modified code back
    rl['parameters']['jsCode'] = old_code

with open('workflow.json', 'w', encoding='utf-8') as f:
    json.dump(w, f, indent=2, ensure_ascii=False)

print("Saved workflow.json.")
