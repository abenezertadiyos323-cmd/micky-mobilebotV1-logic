# Live Bug Audit Report
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)  
**File Inspected:** `workflow.json`  
**Date:** 2026-04-03  
**Mode:** Planning / Audit Only — No code changed  
**Baseline:** Anchor-mode stabilization fixes already applied (3 fixes per post-fix-architecture-audit.md)

---

## 1. Architecture Summary of the 3 Bugs

### Execution pipeline (for reference)
```
Telegram Input
  → Event Normalizer          [detects event_type incl. 'start_reset']
  → Session Load              [reads remote session from Convex]
  → Session Bootstrap         [hydrates & normalizes session object]
  → Understanding AI          [LLM: classifies message function/intent]
  → Understanding JSON Guard  [validates AI output]
  → Rules Layer               [pure-JS: decides reply_mode, should_call_resolver]
  → Should Resolve (IF)       [branches: resolver path vs. direct reply]
      → Product Search API    [Convex /products-search]
      → Business Data Resolver[pure-JS: picks products, builds resolver_output]
  → Reply AI                  [LLM: generates reply_text]
  → Validation (side-effects) [pure-JS: assembles telegram_payload, updated_session]
  → Safe To Send (IF)
      → Telegram Send
      → Session Save          [writes updated_session back to Convex]
```

### Bug classification at a glance

| # | Bug | Root Layer | Issue Type |
|---|-----|-----------|------------|
| 1 | `/start` still mentions prior phone | Rules Layer + Session Bootstrap | State timing / pipeline context leak |
| 2 | Budget recommendation jumps above budget | Business Data Resolver | Logic: fallback priority order |
| 3 | Visit/address CTA missing | Validation (side-effects) + Reply AI | Keyword matching + reply_mode contract |

---

## 2. Bug 1 — `/start` Does Not Fully Reset

### Observed Symptom
User had discussed a phone earlier. After pressing `/start`, the bot replies with the welcome text **but still references the previously discussed phone** — e.g. mentions the model or implies the prior context.

### Root Cause Trace

#### Step 1 — Event Normalizer correctly classifies `/start`
```js
// Event Normalizer
const startMatch = text.match(/^\/start(?:\s+(.+))?$/);
const deepLink = startMatch?.[1] ? ... : null;
eventType = deepLink ? 'deep_link_start' : 'start_reset';
```
`event.event_type = 'start_reset'` ✅ — Classification is correct.

#### Step 2 — Session Bootstrap loads stale session BEFORE reset fires
Session Bootstrap runs **before** Rules Layer and before any reset signal is consumed. It unconditionally hydrates the full old session:
```js
// Session Bootstrap
const shownProducts = Array.isArray(existing.flow_context?.buy_flow?.shown_products) ? ... : [];
const currentInterest = existing.flow_context?.buy_flow?.current_interest ?? ...;
const currentTopic = existing.conversation_state?.current_topic ?? null;
const currentFlow = existing.conversation_state?.current_flow ?? null;
```
The stale `shownProducts`, `currentInterest`, `currentTopic`, and `currentFlow` from the previous session are all available in `session` by the time any downstream node runs.

#### Step 3 — Understanding AI receives the stale session context
Understanding AI is called **before** Rules Layer. Its prompt includes:
```js
session_context: {
  current_interest: $json.session?.flow_context?.buy_flow?.current_interest ?? null,
  shown_products: $json.session.flow_context.buy_flow.shown_products.slice(0, 5),
  last_messages: $json.session.conversation_history.slice(-6),
}
```
Even on a `/start` turn, Understanding AI sees the old product as `current_interest` and the old conversation history in `last_messages`. It classifies intent in this polluted context and may reference the old phone in its output.

#### Step 4 — Rules Layer resets `session_update` fields but NOT the in-flight `session` object
The Rules Layer correctly detects `start_reset`:
```js
if (event.event_type === 'start_reset') {
  rules_output = {
    ...rules_output,
    reply_mode: 'small_talk_redirect',
    should_call_resolver: false,
    session_update: {
      last_topic: null,
      flow_stage: null,
      ambiguous_reference: null,
      resolved_ambiguity: false,
      last_asked_key: null,
    },
    reasoning: 'start_reset_welcome',
  };
}
```
This resets only fields written to `session_update`. It does **NOT** zero out `session.flow_context.buy_flow.current_interest`, `session.collected_constraints`, or `session.conversation_history` in the live `session` object that Rules Layer itself reads during the same execution.

Critically, `rules_output.resolver_input.product_context` is built **before** the `start_reset` branch overwrites `rules_output`:
```js
const productContext = {
  brand: ...,
  model: ...,
  budget_etb: mergedConstraints.budget_etb,
  current_interest: ... (currentInterest ? currentInterest.raw : null),
  ...
};
let rules_output = { resolver_input: { product_context: productContext, ... }, ... };
// THEN start_reset override runs — but product_context is already baked in
```
The stale `productContext` (including old phone references) is baked into `rules_output.resolver_input` and is passed to Reply AI.

#### Step 5 — Reply AI sees stale context
Reply AI is called with the full `rules_output` (containing stale `product_context`) and the full old `session` (containing `current_interest` and `conversation_history`). Its system prompt rules say:
> "If reply_context.has_active_context is true, continue that context."

`reply_context.has_active_context` is computed in the Reply AI input builder as:
```js
has_active_context: Boolean(
  (session.conversation_state?.current_flow ?? null)
  || (session.conversation_state?.current_topic ?? null)
  || (conversation_history.length > 0)
  || (shown_products.length > 0)
  || current_interest
)
```
On a `/start` turn, `conversation_history` is still the OLD history (it's only cleared in Validation **after** Reply AI runs). So `has_active_context = true`. Reply AI then references the prior context.

The `should_greet: Boolean(event.event_type === 'start_reset')` is correctly set to `true`, but the old session context still bleeds into the Response.

#### Step 6 — Validation finally clears everything — but too late
Validation correctly handles `isStartReset`:
```js
const isStartReset = event.event_type === 'start_reset';
// shown_products = []
// currentInterest = null
// nextHistory = [] (cleared, then only /start turn appended)
// mergedConstraints = zeroed
// updatedSession.conversation_state = { current_topic: null, current_flow: null }
```
This is the **correct** reset. But Validation runs **after** Understanding AI and Reply AI have already consumed the stale data.

### Exact Nodes/Layers Involved

| Node | Role in the bug |
|------|----------------|
| Session Bootstrap | Loads full stale session; no reset logic here — by design |
| Understanding AI | Receives stale `current_interest` + old `conversation_history` before reset fires |
| Rules Layer | Correctly detects start_reset but `resolver_input.product_context` is already baked with stale data before the override runs |
| Reply AI | Sees stale `session.current_interest`, `conversation_history`, and `has_active_context = true` from old history |
| Validation | Correctly clears all state — but it runs AFTER the response is generated |

### Issue Type
**State timing / pipeline context leak.** The reset is a write-path-only reset. There is no read-path guard at the start of the pipeline that zeroes the in-flight session object when `event_type === 'start_reset'`.

### Smallest Safe Fix

In **Session Bootstrap**, after the full session hydration, add a thin conditional override when `event.event_type === 'start_reset'`:

```
// DESCRIPTION ONLY — no code edit
if (event.event_type === 'start_reset') {
  // Shadow the fields that downstream nodes (Understanding AI, Rules Layer, Reply AI)
  // should NOT see on a /start turn:
  session.flow_context.buy_flow.shown_products = [];
  session.flow_context.buy_flow.current_interest = null;
  session.conversation_history = [];
  session.collected_constraints = { budget_etb: null, brand: null, model: null, storage: null, condition: null };
  session.conversation_state.current_topic = null;
  session.conversation_state.current_flow = null;
  session.last_offer_context = { turn_index: null, offer_type: 'none', product_ids: [] };
  session.last_constrained_turn = null;
  session.last_asked_key = null;
}
```

**Effect:** Understanding AI, Rules Layer, and Reply AI all receive a zeroed session context on `/start` turns. The rest of the pipeline proceeds normally. Validation's existing `isStartReset` cleanup remains correct and still runs as the authoritative write.

**Risk:** Very low. This only applies to `event_type === 'start_reset'` (exactly when the Event Normalizer set that flag). Session Bootstrap already reads `event.event_type` — it knows about it. No other node is affected. The subsequent Validation reset writes correct values to storage regardless.

**Scope:** ~10 lines added at the end of Session Bootstrap's JS code, inside a single `if` block.

---

## 3. Bug 2 — Budget Recommendation Jumps Above Budget

### Observed Symptom
User says "Be 60k mn ayenat slk magegnet chelalw?" (What phone can I get for 60k?).  
Bot replies: "no phone around 60,000, do you want something above that?"  
**Expected:** first offer the single closest option **below** 60k; only if truly nothing exists at or below should any above-budget option be mentioned, and even then as a single closest-below alternative — not an upsell opener.

### Root Cause Trace

#### Step 1 — Budget signal correctly extracted
Rules Layer extracts `budgetSignal = 60000` from the Amharic/mixed-language text. `anchorMode = 'broad'` (no prior product context). `budgetOnlyQuery = true`. Rules Layer sets `reply_mode = 'business_resolve'`, `should_call_resolver = true`.

#### Step 2 — Product Search API is called correctly
Product Search receives `{ sellerId: 'tedytech', brand: null, model: null, maxPrice: 60000 }`. Convex filters products with `price_etb <= 60000`. If Convex returns an empty array, `result_mode = 'no_products'`.

#### Step 3 — Business Data Resolver: the fallback priority is wrong
This is the **root cause node**. Trace the fallback logic when zero in-budget products are returned:

```js
const narrowBudgetMatchedProducts = filteredProducts.filter(p => p.price_etb <= 60000);
// → []  (no product at or below 60k)

const broadBudgetMatchedProducts = candidateProducts
  .filter(p => p.price_etb <= budgetLimit)
  .sort((a, b) => a.price_etb - b.price_etb);
// → []  (same result since candidateProducts = remoteProducts = [])

const budgetFallbackProducts = filteredProducts.length > 0
  ? filteredProducts.filter(p => p.price_etb > budgetLimit)  // not reached
  : candidateProducts.filter(p => p.price_etb > budgetLimit)  // ← ONLY above-budget products
      .sort((a, b) => a.price_etb - b.price_etb);
// → [cheapest above 60k, ...]
```

Then:
```js
const effectiveProducts = budgetLimit === null
  ? filteredProducts
  : (narrowBudgetMatchedProducts.length > 0
      ? narrowBudgetMatchedProducts       // path 1: within budget — NOT taken
      : (broadBudgetMatchedProducts.length > 0
          ? broadBudgetMatchedProducts    // path 2: any <= budget  — NOT taken
          : budgetFallbackProducts));     // path 3: above budget   ← TAKEN
```

When the Product Search API returns zero results (empty database for that budget), `candidateProducts = shownProducts` (the session's prior shown products, which may also be empty). If `candidateProducts = []`, then `effectiveProducts = []` too (all three filter pools are empty), and `result_type` becomes `no_match`.

**However**, when there ARE products in the database above 60k but none at/below 60k, `budgetFallbackProducts` will be non-empty (products priced above 60k). `effectiveProducts = budgetFallbackProducts` → the resolver presents above-budget products.

#### Step 4 — Validation (side-effects) adds the misleading notice
When `budgetFallbackUsed = true`:
```js
const budgetFallbackUsed = Boolean(resolver_output?.facts_for_reply?.budget_fallback_used);
// facts_for_reply.budget_fallback_used = (budgetLimit !== null && !exactBudgetMatchFound)
```
The Validation node adds:
```js
if (budgetFallbackUsed) {
  const budgetFallbackNotice = 'No exact match in your budget, so these are the nearest options above budget.';
  reply_text = budgetFallbackNotice + '\n' + reply_text;
}
```
This string is hardcoded as "nearest options **above** budget" — confirming the above-budget-first policy is intentional but wrong per requirements.

#### Step 5 — Reply AI has no policy to respect budget as a maximum
The Reply AI system prompt says nothing about trying closest-below-budget first. It will follow whatever resolver_output sends it.

### Exact Nodes/Layers Involved

| Node | Role in the bug |
|------|----------------|
| Business Data Resolver | `budgetFallbackProducts` is defined as ABOVE-budget products only. There is no below-budget closest-option fallback path. |
| Validation (side-effects) | Hardcoded fallback notice reads "above budget" — no below-budget variant exists. |
| Reply AI | No policy to prefer below-budget; follows resolver_output passively. |

### Issue Type
**Logic: fallback priority order.** The Resolver defines "fallback" as anything above the budget cap. The business requirement is the opposite: fallback should be the single closest option **below** (or failing that, **at**) the budget. "Above budget upsell" should only appear if explicitly requested or as a secondary mention.

### Smallest Safe Fix

In **Business Data Resolver**, add a `closestBelowBudget` list before the `effectiveProducts` expression, and reorder the fallback chain:

```
// DESCRIPTION ONLY — no code edit

// NEW: products just below budget (descending — closest to budget first)
const closestBelowBudgetProducts = budgetLimit === null
  ? []
  : candidateProducts
      .filter(p => Number.isFinite(p.price_etb) && p.price_etb <= budgetLimit)
      .sort((a, b) => b.price_etb - a.price_etb)   // descend: closest to cap first
      .slice(0, 1);                                  // single best option

// CHANGED fallback chain:
const effectiveProducts = budgetLimit === null
  ? filteredProducts
  : (narrowBudgetMatchedProducts.length > 0
      ? narrowBudgetMatchedProducts           // 1. exact in-budget match
      : (broadBudgetMatchedProducts.length > 0
          ? broadBudgetMatchedProducts         // 2. any within-budget broad match
          : (closestBelowBudgetProducts.length > 0
              ? closestBelowBudgetProducts     // 3. NEW: single closest-below
              : budgetFallbackProducts)));      // 4. last resort: above budget
```

In **Validation**, change the `budgetFallbackNotice` to distinguish below-budget vs. above-budget fallback, driven by a `facts_for_reply` flag from the resolver:

```
// DESCRIPTION ONLY — no code edit
// In Business Data Resolver, add to facts_for_reply:
below_budget_fallback_used: closestBelowBudgetProducts.length > 0 && exactBudgetMatchFound === false

// In Validation, change the hardcoded string:
const budgetFallbackNotice = resolver_output.facts_for_reply.below_budget_fallback_used
  ? 'No exact match found for your budget — here is the closest option:'
  : 'No exact match in your budget. Here are the nearest options above budget.';
```

**Effect:** When no product exists at exactly 60k, the bot offers the single best phone priced just below 60k instead of jumping to above-budget phones. Above-budget upsell only surfaces as a last resort with 0 below-budget options.

**Risk:** Very low. This adds one new filtered-sorted array (`closestBelowBudgetProducts`) from the existing `candidateProducts` pool. It does not change any API call, any session write, or any AI prompt. The fallback chain is strictly extended — the existing behavior still fires in position 4 as a last resort.

**Scope:** ~8 lines added in Business Data Resolver, ~3 lines changed in the `budgetFallbackNotice` block in Validation.

---

## 4. Bug 3 — Visit / Address / Map CTA Is Missing

### Observed Symptom
User: "Awo mache lemta" (Okay, when should I come / I'm coming to the store).  
Current: Bot says "address is not registered in the system."  
Expected: Bot shows the Visit Store / Map Link button (inline keyboard CTA).

### Root Cause Trace

#### Step 1 — Understanding AI classifies the message
"Awo mache lemta" in Amharic means roughly "Okay, when should I come." It contains visit/come intent but is phrased as a soft acknowledgment with an embedded location question.

Understanding AI likely classifies this as:
- `message_function: 'acknowledgment'` or `'info_request'`
- `business_intent: 'store_info'` or `null`
- `topic: 'location'` or `null`

If it lands on `acknowledgment` with `null` intent, Rules Layer takes the acknowledgment branch and returns `reply_mode: 'acknowledge_and_close'`, `should_call_resolver: false`. This means the **store_info path is never triggered**.

#### Step 2 — Rules Layer store_info branch requires very specific classification
The store_info route in Rules Layer fires only under this condition:
```js
} else if (
  businessIntent === 'store_info'
  || understandingTopic === 'store_info'
  || understandingTopic === 'location'
  || (messageFunction === 'info_request' && (businessIntent === null || businessIntent === 'store_info'))
) {
  rules_output = { reply_mode: 'business_resolve', should_call_resolver: true, resolver_input: { flow: 'info' }, ... };
}
```
If Understanding AI classifies "Awo mache lemta" as `acknowledgment` (not `info_request`), this branch is **skipped entirely**. The message falls through to the acknowledgment branch instead.

#### Step 3 — The `visitIntent` keyword detector in Validation does NOT fire
Validation has a hardcoded English keyword detector for visit intent:
```js
const visitIntent = /\b(visit|come see|come to the store|come in person|physically|in person)\b/i.test(lowerText);
```
The input text is `"Awo mache lemta"` — Amharic/transliterated Ethio-Somali — none of the English keywords match. `visitIntent = false`.

This means the Validation `visitIntent` block never fires:
```js
} else if (!flowIsExchange && visitIntent) {
  reply_text = 'እሺ, ቦታችን ይሄ ነው: ' + mapUrl + '\n' + storeCtaText;
  telegram_markup = storeMarkup;
}
```
The map URL and `storeMarkup` (Visit Store button) are never attached.

#### Step 4 — The business address / map URL data EXISTS in the workflow
This is **not a missing data problem**. The Validation node contains a hardcoded map URL and a store markup builder:
```js
const mapUrl = 'https://maps.google.com/maps?q=8.998702,38.786851&ll=8.998702,38.786851&z=16';
const storeCtaText = 'For more phones and accessories, visit our store using the button below.';
const storeMarkup = buildInlineKeyboard([[{ text: 'Visit Store', additionalFields: { url: mapUrl } }]]);
```
The address data and the button exist. They are simply never reached because the routing failed upstream.

#### Step 5 — Reply AI has no grounded address to cite
Because `reply_mode` is `acknowledge_and_close` (or `small_talk_redirect`), the Reply AI system prompt for that mode says:
> "acknowledge_and_close: short close only, no question, no greeting."

Reply AI produces a brief close acknowledgment with no map or store info. Since the system prompt also says "Never invent address, location, hours, or contact details" — the model correctly declines to invent. The result is a reply that neither gives the address (correctly refused) nor triggers the button (incorrectly absent).

#### Why "address is not registered in the system":
This exact phrasing is likely coming from Reply AI when `reply_mode = 'business_resolve'` and `flow = 'info'` **is** reached (possibly on a slightly different phrasing by others) but `facts_for_reply` for store_info contains nothing — because the Business Data Resolver for `flow = 'info'` sets `result_type = 'no_match'` with no facts:
```js
} else if (resolverInput.flow === 'info' || resolverInput.flow === 'support') {
  result_type = 'no_match';
  next_step = 'ask_clarification';
}
```
The resolver returns `no_match` for `info` flow. Reply AI sees `result_type: no_match` + `reply_mode: business_resolve` + `flow: info` and tries to answer the store question with no data — the model guesses/hallucinates the "not registered" phrasing. This is a secondary failure path for when `info_request` classification _does_ fire.

### Exact Nodes/Layers Involved

| Node | Role in the bug |
|------|----------------|
| Understanding AI | Likely classifies Amharic visit phrasing as `acknowledgment` instead of `info_request`/`store_info` |
| Rules Layer | Store_info branch never fires because `messageFunction !== 'info_request'` and `topic !== 'location'` |
| Validation (side-effects) | `visitIntent` keyword list is English-only; Amharic/transliterated text never matches |
| Business Data Resolver | Sets `result_type: 'no_match'` for `flow: info` with no grounded store facts |
| Reply AI | Correctly refuses to invent address; produces generic close instead of store CTA |

### Whether Business Data Is Missing or Flow Is Broken
**The flow is broken — the business data (map URL, Visit Store button) already exists in Validation.**  
The issue is a dual routing failure:
1. Understanding AI misclassifies (soft Amharic visit phrasing → wrong `message_function`)
2. Validation's `visitIntent` keyword guard is English-only and does not catch Amharic "lemta" / "mache" patterns

### Smallest Safe Fix

**Fix A (highest leverage) — Extend `visitIntent` in Validation to catch Amharic/transliterated patterns:**

```
// DESCRIPTION ONLY — no code edit
// Current:
const visitIntent = /\b(visit|come see|come to the store|come in person|physically|in person)\b/i.test(lowerText);

// Proposed:
const visitIntent = /\b(visit|come see|come to the store|come in person|physically|in person)\b/i.test(lowerText)
  || /\b(lemta|mache lemta|bota|adrasachin|store|nus|nus lemta)\b/i.test(lowerText)
  || /አድራሻ|ቦታ|ማዬ|ልምጣ|ልምጡ|ስፍራ/.test(eventText);
```

This is a Validation-only change. It adds Amharic script detection (`አድራሻ` = address, `ቦታ` = place, `ልምጣ` = let me come) and common Amharic romanization patterns. When this fires, the existing `storeMarkup` CTA block runs correctly.

**Fix B (belt-and-suspenders) — Add store facts to Business Data Resolver for `flow: info` turns:**

```
// DESCRIPTION ONLY — no code edit
// In Business Data Resolver, when resolverInput.flow === 'info':
const storeInfo = {
  address_text: 'Bole, Addis Ababa, near [landmark]',  // fill from seller config
  map_url: 'https://maps.google.com/maps?q=8.998702,38.786851&ll=8.998702,38.786851&z=16',
  open_hours: null,  // fill if available
};
// Return result_type: 'store_info' instead of 'no_match'
// Include storeInfo in resolver_output.facts_for_reply
```

This lets Reply AI produce a grounded response even if it does reach the `business_resolve` + `info` path. Currently the resolver returns `no_match` for all info requests, guaranteeing no facts are available.

**Priority:** Fix A first (immediate coverage for Amharic text), Fix B after (necessary to fix the secondary path where classification succeeds but resolver returns empty).

**Risk of Fix A:** Very low. The `visitIntent` boolean is only used for the `reply_text` override and `telegram_markup` assignment in Validation. Extending its regex cannot cause false positives in other branches.

**Scope of Fix A:** 3 lines changed in Validation.

---

## 5. Fix Priority Order

| Priority | Bug | Fix Target | Risk | Size |
|----------|-----|-----------|------|------|
| **1** | Bug 3A — Visit/address CTA (Amharic `visitIntent`) | Validation | Very low | 3 lines |
| **2** | Bug 1 — `/start` stale context leak | Session Bootstrap | Very low | ~10 lines |
| **3** | Bug 2 — Budget closest-below fallback | Business Data Resolver + Validation notice | Very low | ~11 lines |
| **4** | Bug 3B — `flow: info` returns `no_match` | Business Data Resolver | Low | ~8 lines |

### Why this order:
1. **Bug 3A first** — smallest possible fix (one regex line), already has a live failing case, data already exists.
2. **Bug 1 second** — `/start` is a trust-breaking moment (restart should feel like a clean slate). The risk of the fix is minimal because Session Bootstrap already checks `event.event_type`.
3. **Bug 2 third** — requires adding a new sorted array plus a new flag; still small but involves two nodes. The fallback behavior is wrong but not trust-breaking (it does show phones, just wrong ones).
4. **Bug 3B fourth** — depends on Seller config data to fill `storeInfo`; cannot be implemented until the seller's actual address text is confirmed.

---

## 6. What Must NOT Be Touched Yet

### Do NOT change the Understanding AI system prompt for visit detection
Adding "mache lemta" or Amharic patterns to the AI prompt is fragile — it will change model behavior globally and cannot be unit tested in isolation. The Validation-layer `visitIntent` fix (Fix A) is narrower, testable, and reversible.

### Do NOT change the `recentOfferContext` window (`<= 2`)
This is the natural anchor-mode loop expiry gate identified in the prior audit. It is not involved in any of these 3 bugs.

### Do NOT touch the `should_call_resolver` contract for `start_reset`
Rules Layer correctly sets `should_call_resolver: false` on `start_reset`. The Product Search API must never be called on `/start` turns. This is already correct — do not alter it.

### Do NOT modify the Business Data Resolver's `candidateProducts` fallback (`products.length > 0 ? products : shownProducts`)
This is correct for anchored refinements. The budget fix only adds a new filtered sort; it does not change this line.

### Do NOT alter the Reply AI system prompt's "never invent address" rule
The phrasing "address not registered in the system" is a hallucination artifact of having no grounded facts. The fix is to supply facts (Fix B) — not to change the AI's honesty directive, which is correctly protecting against false store location claims.

### Do NOT clear `conversation_history` in Session Bootstrap for non-start turns  
The `conversation_history` is intentionally preserved across turns so Understanding AI can resolve references. Only `/start` turns should clear it (which is what the proposed Bug 1 fix does).

### Do NOT change the `last_constrained_turn` ambiguous-turn fix  
This was identified as the next priority fix in the post-fix audit. It is still the next fix for the anchor-mode loop issue. None of these 3 new bugs depend on it or conflict with it.

---

## Appendix: Node ID Reference

| Node Name | Node ID | Type |
|-----------|---------|------|
| Event Normalizer | `event-normalizer` | Code (JS) |
| Session Bootstrap | `session-bootstrap` | Code (JS) |
| Understanding AI | `understanding-ai` | HTTP (LLM) |
| Understanding JSON Guard | `validation-node` | Code (JS) |
| Rules Layer | `rules-layer` | Code (JS) |
| Should Resolve | `6cf3b3b0-...` | IF branch |
| Product Search | `product-search-convex-test` | HTTP (Convex) |
| Business Data Resolver | `business-data-resolver` | Code (JS) |
| Reply AI | `reply-ai` | HTTP (LLM) |
| Validation (side-effects) | `side-effects` | Code (JS) |
| Safe To Send | `de4bc6fc-...` | IF branch |
| Telegram Send | `telegram-send` | Telegram node |
| Session Save | `session-save` | HTTP (Convex) |

---

*This report is planning/audit only. No runtime files were modified.*
