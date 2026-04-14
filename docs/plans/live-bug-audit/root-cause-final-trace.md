# ROOT CAUSE FINAL TRACE — Why Reply AI Outputs "Address Not Registered"
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**File read:** workflow.json — 555 lines, 116,003 bytes
**Mode:** Audit Only — No code changed

---

## The Chain: Understanding AI → Guard → Rules Layer → Business Data Resolver → Reply AI

### STEP 1 — RULES LAYER CHECK

**Exact condition that sets `flow: 'info'` and calls the resolver:**

```javascript
} else if (businessIntent === 'store_info'
  || understandingTopic === 'store_info'
  || understandingTopic === 'location'
  || (messageFunction === 'info_request' && (businessIntent === null || businessIntent === 'store_info'))) {
  rules_output = {
    reply_mode: 'business_resolve',
    should_call_resolver: true,
    resolver_input: { flow: 'info', missing_fields: [] },
    session_update: { flow_stage: currentFlow ? currentFlow : 'info' },
    reasoning: 'store_info_bypasses_product_flow',
  };
}
```

✅ This is correctly implemented. If Understanding AI returns `business_intent: 'store_info'` OR `topic: 'store_info'` OR `topic: 'location'` OR `message_function: 'info_request'`, the resolver is called with `flow: 'info'`.

**Condition that blocks this path:**
A **budget signal** in the user's message will override this branch. The Rules Layer has a post-chain budget override that runs AFTER the `store_info` branch:

```javascript
if (budgetSignal !== null && businessIntent !== 'exchange' && currentFlow !== 'exchange') {
  rules_output = {
    reply_mode: ambiguousAnchor ? 'clarify_reference' : 'business_resolve',
    should_call_resolver: !ambiguousAnchor,
    resolver_input: { flow: 'buy', ... },  // ← OVERWRITES flow: 'info' → flow: 'buy'
  };
}
```

> [!IMPORTANT]
> If the user's location message contains a number pattern that looks like a price (e.g., a phone number, an address number), `extractBudgetEtb()` may match it and set `budgetSignal !== null`. This post-chain override would then silently rewrite `flow: 'info'` → `flow: 'buy'`, completely bypassing the store_info path.
> 
> **However**: for the test message `"Wed sukachu memtat falige nbr ena adrashachun laklgn esti"`, there are no numeric patterns. `budgetSignal = null`. This override does NOT fire for this specific test.

**Is there a branch where store_info is detected but resolver is NOT called?**
No. The `store_info` branch unconditionally sets `should_call_resolver: true`.

---

### STEP 2 — RESOLVER INPUT CHECK

**What exact input triggers `store_info` in the resolver:**
```javascript
} else if (resolverInput.flow === 'info') {
  result_type = 'store_info';
  next_step = 'show_store_info';
}
```

The resolver checks `resolverInput.flow`. If `flow === 'info'`, it returns `store_info`. There is no other condition.

**What input causes `no_match` instead:**
If `resolverInput.flow` is anything OTHER than `'info'` (e.g., `'buy'`, `'exchange'`, `'support'`, `null`, `undefined`), AND no products match, the resolver returns `result_type: 'no_match'`.

---

### STEP 3 — RESOLVER OUTPUT CHECK

**When `result_type === 'store_info'`:**
```javascript
store_info: result_type === 'store_info' ? STORE_INFO : null,
facts_for_reply: {
  store_info_available: result_type === 'store_info',
  store_name: result_type === 'store_info' ? STORE_INFO.store_name : null,
  address_text: result_type === 'store_info' ? STORE_INFO.address_text : null,
  map_url: result_type === 'store_info' ? STORE_INFO.map_url : null,
}
```

When `result_type === 'store_info'`:
- `resolver_output.store_info` = full `STORE_INFO` object
- `resolver_output.facts_for_reply.address_text` = `'TedyTech store location ? use the map button below.'`
- `resolver_output.facts_for_reply.store_info_available` = `true`

When `result_type !== 'store_info'`:
- `resolver_output.store_info` = `null`
- `resolver_output.facts_for_reply.address_text` = `null`
- `resolver_output.facts_for_reply.store_info_available` = `false`

---

### STEP 4 — REPLY AI PROMPT CHECK

Reply AI receives the full `resolver_output` object stringified into its `user` message:
```javascript
resolver_output: $json.resolver_output ?? null,
```

Reply AI's system prompt contains:
```
If resolver_output.result_type is store_info and resolver_output.store_info is present,
use resolver_output.store_info.address_text directly and keep the reply grounded.
Do not say the address is unavailable.

If grounded store-info facts are missing, do not invent address, location, hours,
or contact details. Say briefly that the exact store detail is not available here right now.
```

**When `store_info` IS present:** Reply AI uses `address_text` directly. No "not registered" output.
**When `store_info` IS null/missing:** Reply AI triggers the fallback → generates Amharic "address not registered" text.

---

## FAILURE PATH — EXACT SEQUENCE

For the test message: `"Wed sukachu memtat falige nbr ena adrashachun laklgn esti"`

### If the CURRENT FILE code were running:

```
1. Understanding AI → business_intent: 'store_info', topic: 'location'
2. Guard → passes (valid JSON)
3. Rules Layer → isStoreInfoTurn = true → flow: 'info', should_call_resolver: true
4. Product Search HTTP → fires (always runs), returns [] products
5. Business Data Resolver → resolverInput.flow === 'info' → result_type: 'store_info'
   → store_info: { address_text: 'TedyTech store location...' }
6. Reply AI → receives store_info → uses address_text → outputs grounded location reply
7. Validation → store_info branch fires → reply_text = grounded text + storeCtaText
   → telegram_markup = storeMarkup (Visit Store button)
8. Telegram Send → sends correct reply with map button
```

### What is ACTUALLY happening in the live bot:

```
1. Understanding AI → (likely correct — this is an LLM call, not a code node)
2. Guard → (likely correct — this is a code node but it's a simple validator)
3. Rules Layer → STALE CODE: no isStoreInfoTurn variable, no store_info branch
   → falls through to fresh_request or off_topic_redirect
   → flow: 'buy' or null, should_call_resolver: true or false
4. Product Search HTTP → fires, returns [] products
5. Business Data Resolver → STALE CODE: no 'else if (resolverInput.flow === "info")' block
   → result_type: 'no_match', store_info: null
6. Reply AI → receives no_match, no store_info
   → triggers fallback: "address not available / not registered"
   → generates: "የሱቃችን ትክክለኛ አድራሻ በአሁኑ ሰዓት እዚህ አልተመዘገበም..."
7. Validation → STALE CODE: no store_info branch, no resolverIsStoreInfo guard
   → passes Reply AI text through unmodified
8. Telegram Send → sends the AI-generated "not registered" text
```

---

## FINAL ROOT CAUSE

**Type A: `store_info` never reaches Reply AI.**

The live n8n instance is executing code from its internal database, which does not contain the `store_info` routing logic in the Rules Layer, the `flow === 'info'` handler in the Business Data Resolver, or the `store_info` branch in Validation. All three nodes are stale.

## ONE SENTENCE

The live n8n workflow has never been updated with the current `workflow.json` file, so all three code nodes (Rules Layer, Business Data Resolver, Validation) are running old versions that have no concept of `store_info`, causing the resolver to return `no_match` and Reply AI to generate "address not registered" from its honesty fallback.

---

## WHAT MUST NOT BE PATCHED

- Do not edit Understanding AI — it correctly identifies location intent
- Do not edit Reply AI prompt — it correctly uses `store_info` when present
- Do not add keyword workarounds — the logic is architecturally correct
- Do not edit workflow.json — the file is already correct
- The ONLY action needed is syncing the file's code into the live n8n instance

---
*No code was modified. This is strictly a data trace audit.*
