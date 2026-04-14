# Store-Info Route Audit — Address Grounding Gap
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**File Inspected:** `workflow.json`
**Date:** 2026-04-04
**Trigger message:** `"Wed sukachu memtat falige nbr ena adrashachun laklgn esti"`
**Symptom:** Bot replies `"የሱቃችን አድራሻ ... አልተመዘገበም"` (our store address is not registered)
**Mode:** Planning / Audit Only — No code changed

---

## 1. Exact Root Cause (One Sentence)

> **The store/address route reaches Reply AI with `result_type: 'no_match'` and zero grounded store facts, because Business Data Resolver explicitly sets `no_match` for all `flow: info` turns — and Reply AI's honesty directive then produces the "address not registered" hallucination fill-text.**

---

## 2. Full Node-by-Node Trace

### Node 1 — Event Normalizer
`"Wed sukachu memtat falige nbr ena adrashachun laklgn esti"` is a plain text message.  
No `/start`, no callback.  
`event_type = 'text_message'`. ✅ No issue here.

---

### Node 2 — Session Bootstrap
Session is loaded normally. This message is not a reset.  
The prior session state (current_flow, conversation_history, etc.) is hydrated as-is. No issue here.

---

### Node 3 — Understanding AI
The message means: *"I want to come to your store, please send your address."*  
It contains `sukachu` (your shop), `memtat` (to come), `adrashachun` (your address), `laklgn` (send me).

This is an unambiguous **direct address / store-info request**. Understanding AI should classify it as:
```json
{
  "message_function": "info_request",
  "business_intent": "store_info",
  "topic": "location",
  "confidence": 0.85–0.95
}
```

**What Understanding AI likely actually produces:**  
The system prompt correctly lists `info_request` as a valid `message_function` and `store_info`/`location` as valid topics. The message is clear. Understanding AI **does** correctly classify this — this is the one node that works for this message.

**Critical note:** The Understanding AI prompt sends `shown_products`, `current_interest`, and `last_messages` from the session. If the prior turn was a phone search, `current_interest` is still a phone object. Understanding AI may see this and classify the message at a lower confidence, but `store_info` / `info_request` should dominate. Assume correct classification here for the worst-case path analysis below.

---

### Node 4 — Understanding JSON Guard
Validates the AI response. If `message_function = 'info_request'` and `topic = 'location'`, output passes through unchanged. No issue here.

---

### Node 5 — Rules Layer
The Rules Layer branch tree is evaluated in this order for this message:

```
1. event_type === 'start_reset'         → NO
2. event_type === 'deep_link_start'     → NO
3. confidence < 0.6                     → NO (assume > 0.6)
4. messageFunction === 'acknowledgment' → NO
5. messageFunction === 'clarification'  → NO
6. businessIntent === 'store_info'
   OR understandingTopic === 'store_info'
   OR understandingTopic === 'location'
   OR (messageFunction === 'info_request' && businessIntent in [null, 'store_info'])
                                        → YES ← TAKEN
```

The store_info branch fires correctly:
```js
rules_output = {
  reply_mode: 'business_resolve',
  should_call_resolver: true,
  resolver_input: {
    flow: 'info',
    missing_fields: [],
  },
  session_update: {
    last_topic: understandingTopic ?? 'store_info',   // 'location'
    flow_stage: ...,
    last_asked_key: null,
  },
  reasoning: 'store_info_bypasses_product_flow',
};
```

**`should_call_resolver = true` and `reply_mode = 'business_resolve'`.** ✅ Rules Layer works correctly.

> **No routing failure for this specific message.** The `visitIntent` regex expansion was appropriate for soft visit phrasing, but a direct address request like this passes through Rules Layer correctly even before that fix.

---

### Node 6 — Should Resolve (IF gate)
`should_call_resolver = true` → Product Search API is called.

The Product Search request body is built as:
```js
brand: null,   // no phone type in message
model: null,
maxPrice: null,  // no budget signal
```
Convex returns: `[]` (no products — this is an info request, not a product query).
`result_mode = 'no_products'`.

This is expected and correct. No issue here.

---

### Node 7 — Business Data Resolver ← **ROOT CAUSE NODE**

This is where the address grounding is **permanently destroyed**.

The resolver receives `resolverInput.flow = 'info'` and `products = []` (empty from Convex).

The result-type assignment logic:
```js
if (anchorMode === 'ambiguous') {
  result_type = 'clarification_needed';
} else if (rules_output.reply_mode === 'clarify_reference') {
  result_type = 'clarification_needed';
} else if (resolverInput.flow === 'exchange') {
  result_type = 'exchange_offer';
} else if (resolverInput.flow === 'info' || resolverInput.flow === 'support') {
  result_type = 'no_match';        // ← HARD-CODED 'no_match' FOR ALL INFO TURNS
  next_step = 'ask_clarification';
} else if (selectedWithinBudget) { ... }
  else if (effectiveProducts.length > 1) { ... }
  ...
```

**For `flow: info`, the resolver unconditionally assigns `result_type = 'no_match'` and `next_step = 'ask_clarification'`.**

The `resolver_output` that reaches Reply AI:
```json
{
  "result_mode": "no_products",
  "result_type": "no_match",
  "products": [],
  "exchange_context": null,
  "next_step": "ask_clarification",
  "facts_for_reply": {
    "product_found": false,
    "how_many_options": 0,
    "stock_status": null,
    "price_range": null,
    "budget_limit": null,
    "budget_exact_match_found": false,
    "budget_fallback_used": false,
    "search_scope": "broad"
  }
}
```

**There is no `address`, no `map_url`, no `store_name`, no `open_hours`, no `contact` — nothing.**

The `facts_for_reply` object is entirely product-oriented. There is no store-info slot. The resolver was never designed to carry store facts.

---

### Node 8 — Reply AI ← **WHERE THE WRONG REPLY IS GENERATED**

Reply AI receives:
- `reply_mode: 'business_resolve'`
- `resolver_output.result_type: 'no_match'`
- `resolver_output.facts_for_reply`: all null / false / 0
- No address, no map URL, no store hours — nothing

Reply AI's system prompt contains:
```
"Store-info rules:
- If rules_output.resolver_input.flow is info or understanding_output.topic is store_info,
  answer only the store-info request.
- If grounded store-info facts are missing, do not invent address, location, hours, or
  contact details. Say briefly that the exact store detail is not available here right now."
```

Reply AI correctly follows this rule: it sees `flow: info`, sees no grounded facts, and produces the "address not registered" / "this info is not available" phrasing.

**The model is not hallucinating incorrectly — it is correctly following a honesty directive. The problem is that it has nothing to be honest *with*.**

---

### Node 9 — Validation (side-effects)
By the time Validation runs, `reply_mode` is `'business_resolve'` (not `'acknowledge_and_close'`), so the acknowledgment block does not fire.

The `visitIntent` variable is evaluated here:
```js
const visitIntent = /\b(visit|come see|come to the store|...)\b/i.test(lowerText)
  // + expanded Amharic patterns if that fix was applied
```

For `"Wed sukachu memtat falige nbr ena adrashachun laklgn esti"`:
- Even with the Amharic expansion (`lemta`, `ቦታ`, etc.), `memtat` means "to go/come" but may or may not be in the pattern list
- `adrashachun` (your address) is not a visit-action word — it's an address-request word
- This is **not a visit request** — it's an **address data request**

So even with the expanded `visitIntent` regex, this message does not match. `visitIntent = false`.

The `storeMarkup` CTA block in Validation is gated on `visitIntent`:
```js
} else if (!flowIsExchange && visitIntent) {
  reply_text = 'እሺ, ቦታችን ይሄ ነው: ' + mapUrl + '\n' + storeCtaText;
  telegram_markup = storeMarkup;
}
```

Since `visitIntent = false`, this block **never runs**.

The address/map data in Validation is local to the `visitIntent` code path only. It does not apply to the `business_resolve` + `flow: info` path.

---

### The Map URL / Address Data Location

The hardcoded store data exists in Validation:
```js
// In Validation (side-effects node)
const mapUrl = 'https://maps.google.com/maps?q=8.998702,38.786851&ll=8.998702,38.786851&z=16';
const storeCtaText = 'For more phones and accessories, visit our store using the button below.';
const storeMarkup = buildInlineKeyboard([[{ text: 'Visit Store', additionalFields: { url: mapUrl } }]]);
```

**These values exist ONLY in Validation's local scope. They are NEVER passed upstream to Business Data Resolver or Reply AI.**

Reply AI has **no access whatsoever** to `mapUrl`, `storeCtaText`, or `storeMarkup`. They are Validation-only constants. There is no data pipeline carrying store facts from any source to the AI layer.

---

## 3. Root Cause Summary

| Step | Node | Status | Issue |
|------|------|--------|-------|
| Classification | Understanding AI | ✅ Works | `info_request` / `store_info` / `location` correct |
| Routing | Rules Layer | ✅ Works | `flow: info`, `should_call_resolver: true` correct |
| Product search | Product Search API | ✅ Works | Returns `[]` correctly for info queries |
| **Store facts** | **Business Data Resolver** | ❌ **Broken** | Hard-codes `result_type: 'no_match'` for all `flow: info` turns. Carries zero store facts. |
| Reply generation | Reply AI | ⚠️ Symptom | Correctly refuses to invent facts. Produces "not available" fill-text. |
| CTA attachment | Validation | ❌ Not reached | Map URL and button are `visitIntent`-gated only; never attached for address-request path |

**The issue is: missing resolver facts + no store-info contract.**  
The routing is correct. The Classification is correct. The gap is that the Business Data Resolver has no store-info data contract, so Reply AI is always forced to say "not available."

---

## 4. Whether This Is Route Classification, Missing Resolver Facts, or Reply Grounding

**It is missing resolver facts — not classification, not reply grounding.**

- Classification: ✅ correct
- Routing: ✅ correct
- Reply AI grounding: ⚠️ AI is doing the right thing given empty facts
- **Resolver contract: ❌ broken** — `flow: info` has no fact-carrying path

---

## 5. Smallest Safe Fix

### Fix A — Business Data Resolver: Add `store_info` contract for `flow: info`

The Business Data Resolver must be given a static store-info data block and must return it as `result_type: 'store_info'` instead of `no_match`.

**What to add (description only, no code patch):**

Inside the Business Data Resolver, before the `result_type` assignment block, define a static store info object:

```
// DESCRIPTION ONLY

const STORE_INFO = {
  store_name: 'TedyTech',
  address_text: '[fill: human-readable Amharic/English address]',
  map_url: 'https://maps.google.com/maps?q=8.998702,38.786851&ll=8.998702,38.786851&z=16',
  open_hours: null,       // fill later if known
  phone_number: null,     // fill later if known
  telegram_channel: null, // fill later if known
};
```

Then change the `flow: info` branch:
```
// CURRENT (wrong):
} else if (resolverInput.flow === 'info' || resolverInput.flow === 'support') {
  result_type = 'no_match';
  next_step = 'ask_clarification';
}

// PROPOSED (description):
} else if (resolverInput.flow === 'info' || resolverInput.flow === 'support') {
  result_type = 'store_info';
  next_step = 'show_store_info';
}
```

And add `store_info` to `resolver_output` and `facts_for_reply`:
```
// In resolver_output:
store_info: resolverInput.flow === 'info' || resolverInput.flow === 'support'
  ? STORE_INFO
  : null,

// In facts_for_reply:
store_info_available: Boolean(STORE_INFO.address_text),
```

---

### Fix B — Validation: Attach `storeMarkup` for `flow: info` path

After Fix A, Reply AI will receive grounded `store_info` facts and produce a correct address reply. But the inline keyboard button (Visit Store / Map Link) still won't appear unless Validation also attaches `storeMarkup`.

The `storeMarkup` block in Validation must be extended to fire on `flow: info` + `result_type: store_info` — not just on `visitIntent`:

```
// DESCRIPTION ONLY

// Current: gated only on visitIntent
} else if (!flowIsExchange && visitIntent) {
  reply_text = '...';
  telegram_markup = storeMarkup;
}

// Proposed: also fire when the resolver returned store_info
const flowIsInfo = rules_output.resolver_input?.flow === 'info';
const resolverReturnedStoreInfo = resolver_output?.result_type === 'store_info';

} else if (!flowIsExchange && (visitIntent || (flowIsInfo && resolverReturnedStoreInfo))) {
  // For pure address request: do NOT overwrite reply_text (Reply AI already has the address)
  // Only attach the button
  telegram_markup = storeMarkup;
  // Optionally append the Visit Store CTA line if not already present:
  if (!reply_text.includes(storeCtaText)) {
    reply_text = reply_text.replace(/\s*$/, '') + '\n' + storeCtaText;
  }
}
```

This way:
- Reply AI's grounded address text is preserved
- The Visit Store / Map Link inline button is attached
- `reply_text` is not replaced (only the button and CTA line are appended)

---

### Fix C — Reply AI system prompt: add `store_info` result_type instruction

Once the resolver returns `result_type: 'store_info'` with a `store_info` object, Reply AI needs to know how to use it. Add one rule to the system prompt:

```
// DESCRIPTION ONLY — add to Reply AI system prompt

"- If resolver_output.result_type is store_info and resolver_output.store_info is present,
   use resolver_output.store_info.address_text and store_info.map_url to answer the address
   question directly. Do not say the address is unavailable."
```

---

## 6. Fix Priority for This Bug

| Priority | Fix | Node | Depends On | Risk |
|----------|-----|------|------------|------|
| **1** | Add `STORE_INFO` block + `result_type: 'store_info'` | Business Data Resolver | Nothing — just needs seller's address text filled in | Very low |
| **2** | Extend `storeMarkup` attachment to `flow: info` path | Validation | Fix 1 (needs `result_type === 'store_info'` to be reliable) | Very low |
| **3** | Add `store_info` result_type handling to Reply AI prompt | Reply AI prompt | Fix 1 | Very low |

All three fixes are needed for a complete end-to-end fix. Fix 1 alone makes the address appear in text. Fix 2 adds the button. Fix 3 makes the AI use the facts reliably.

---

## 7. Whether to Fix in Validation, Business Data Resolver, or Both

**Both are required — for different responsibilities:**

| Node | What it must own |
|------|-----------------|
| Business Data Resolver | Own the store-info data contract. Be the single source of truth for `store_info` facts. Return `result_type: 'store_info'` with a populated `store_info` object. |
| Validation | Own the Telegram-layer CTA assembly. Attach `storeMarkup` when `flow: info` + `result_type: store_info` is present. Do not move the map URL or button logic out of Validation. |
| Reply AI system prompt | Know that `result_type: 'store_info'` means "use the store_info object, do not say unavailable." |

**The map URL and button markup should remain local to Validation** — they are presentation-layer concerns, not business logic. However, Validation must be told *when* to attach them via the resolver contract signal (`result_type`), not via keyword regex.

---

## 8. What Must NOT Be Touched

### Do NOT move the map URL into the Understanding AI prompt
The LLM should never receive a map URL as a system prompt constant. That creates a prompt injection surface and makes the URL impossible to update without redeployment of the AI model configuration.

### Do NOT move the map URL into the Reply AI system prompt
Same reason. Store facts belong in the resolver_output data layer, not in AI instructions.

### Do NOT replace the `visitIntent` regex block in Validation
The `visitIntent` block handles a different case: **visit action intent in the middle of a buy flow**, where `flow` may not be `info` but the user says they want to come in person. That block is separately valid. Do not collapse it into the `flow: info` fix.

### Do NOT change the Rules Layer store_info branch
The routing is correct. `flow: info`, `should_call_resolver: true`, `reply_mode: 'business_resolve'`. All correct. Do not add a new `reply_mode` value.

### Do NOT add a word list for address detection anywhere
The root cause is not classification. Adding more regex patterns to Understanding AI or Validation does not solve the fact-grounding gap. The fix must be in the data plane.

### Do NOT change the Product Search API call for `flow: info`
The Product Search correctly returns `[]` for info queries. The store info data should NOT go through the Product Search API — it is static seller configuration, not a product catalog lookup.

### Do NOT add address text to `client_config` in Session Bootstrap
`client_config` is read-only context passed through the pipeline. It is not currently read by Business Data Resolver. Putting the address there would require Business Data Resolver to be changed to read from `client_config`, which is a larger architectural change than defining a `STORE_INFO` constant locally. Keep it simple.

---

## 9. Architecture Diagram — Store-Info Path (Current vs. Fixed)

### Current (broken)
```
Understanding AI → info_request / store_info ✅
Rules Layer     → flow: info, business_resolve ✅
Business Data Resolver → result_type: 'no_match', facts_for_reply: {} ❌
Reply AI        → "store details not available" (honesty directive fires) ⚠️
Validation      → visitIntent = false, storeMarkup NOT attached ❌
Telegram        → text only, no button, wrong message ❌
```

### Fixed (proposed)
```
Understanding AI → info_request / store_info ✅
Rules Layer     → flow: info, business_resolve ✅
Business Data Resolver → result_type: 'store_info', store_info: { address, map_url } ✅
Reply AI        → uses store_info.address_text, produces correct Amharic reply ✅
Validation      → flowIsInfo && result_type === 'store_info' → storeMarkup attached ✅
Telegram        → correct address text + Visit Store button ✅
```

---

## 10. Seller Data Dependency

**Fix 1 cannot be completed without the real store address text.**

The `map_url` coordinates (`8.998702, 38.786851`) are already hardcoded in Validation. These coordinates can be reused.

What is still missing:
- A human-readable Amharic + English address string (e.g. "Bole Medhanialem, next to [landmark]")
- Working hours (optional initially)
- Contact number (optional initially)

**Action required from the seller/owner before Fix 1 can be implemented:**  
→ Provide the official store address text in both Amharic and English.

Until that is provided, `address_text` can be set to `null` and the fix can still ship — but Reply AI should then say "our address is [map link], tap the button below" using just the map URL, rather than "not available."

---

*This report is planning/audit only. No runtime files were modified.*
