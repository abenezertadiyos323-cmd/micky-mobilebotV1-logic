# Anchor-Mode Architecture Audit Report
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**File Inspected:** `workflow.json`
**Date:** 2026-04-03
**Mode:** Planning / Audit Only — No code was changed

---

## 1. Architecture Verdict

> **Partially Safe — Stable under happy-path multi-turn but fragile at the budget/context boundary.**

The core signal-to-mode mapping is sound. The evidence-based approach (turn distances,
structured constraints, reference resolution) is a real improvement over naive intent
routing. However, one structural conflict and two state-ownership gaps make the system
unreliable in two real conversation patterns: (a) a short budget signal arriving while
old product context is still alive, and (b) stale `shown_products` extending
`selectedProductExists` indefinitely after a product offer.

---

## 2. What Is Strong

### 2.1 Ephemeral anchor_mode
`anchor_mode` is never persisted. It is computed fresh each turn from live signals.
This guarantees no stale mode leak across turns. Correct design.

### 2.2 Evidence-Based Signal Stack
The anchor evidence block is structured and traceable:
```
budget_signal             → numeric value or null
current_turn_phone_type   → regex-extracted brand+model or null
current_turn_brand/model  → derived from phone_type extraction
current_turn_storage/ram  → independent regex
reference_resolution      → from Understanding AI, not heuristic
last_offer_turn_distance  → persisted turn_index diff → time-bounded
last_constrained_turn_distance → same
current_turn_short        → char count ≤ 40
selected_product_exists   → union of 4 sources
```
Each signal is independently computable, not cascaded. This is clean.

### 2.3 Mode Separation in Resolver
The Business Data Resolver correctly gates on `anchorMode`:

| Mode | Action |
|------|--------|
| `anchored` | Uses brand/model/storage/condition from constraints + session |
| `broad` | Ignores brand/model constraints; budget-only product scan |
| `ambiguous` | Short-circuits to `result_type: clarification_needed`, returns no products |

This is the right contract. The resolver is not trying to guess — it defers to Rules Layer.

### 2.4 Turn-Distance Expiry (`<= 2` window)
Both `recentOfferContext` and `recentConstrainedContext` require turn distance ≤ 2.
This prevents deeply stale context from triggering anchor logic.
Delayed replies (24h silence, many intervening turns) naturally expire both windows → safe.

### 2.5 `start_reset` is a Clean Slate
On `start_reset`:
- `shown_products = []`
- `current_interest = null`
- `last_offer_context = { turn_index: null, offer_type: 'none', product_ids: [] }`
- `last_constrained_turn = null`
- `collected_constraints` zeroed
- History cleared

This is comprehensive. The only reliable full reset in the system, and it works correctly.

### 2.6 Normalization is Thorough
Session Bootstrap normalizes `last_offer_context`, `last_constrained_turn`,
`collected_constraints`, and other fields from remote storage. Defensive coding
against null/undefined is consistent throughout.

---

## 3. What Is Weak

### 3.1 Budget Override Block Has Structural Conflict With `ambiguous`

**Location:** Rules Layer — the final `if (budgetSignal !== null ...)` block at the bottom.

**The problem:**
When `anchorMode === 'ambiguous'`, the block still executes and forces:
```
reply_mode = 'business_resolve'
should_call_resolver = true
reasoning = 'ambiguous_anchor_requires_clarification'
```

This is internally contradictory. `reply_mode: 'business_resolve'` signals to the
rest of the pipeline that the resolver has a product answer. But the resolver itself,
upon seeing `anchorMode === 'ambiguous'`, immediately returns:
```
result_type = 'clarification_needed'
next_step = 'ask_clarification'
products = []
```

Result: Reply AI receives `reply_mode: 'business_resolve'` but `result_type:
clarification_needed`. The AI must reconcile these conflicting signals. There is no
guarantee it will always produce the correct clarification reply — and if
`resolver_output.result_type` is not in the allowed enum, Validation raises
`invalid_resolver_result_type` as a blocking issue. (It is in the enum, so it does
not block, but the mixed signal is architecturally wrong.)

Additionally, Product Search API is called and the resolver executes for every
ambiguous turn — entirely unnecessary work, since the result always discards 
the search output.

### 3.2 `selectedProductExists` Is Too Broad and Never Expires

```js
const selectedProductExists = Boolean(
  resolvedProduct
  || currentInterest
  || shownProducts.length > 0          // ← NEVER cleared by broad or ambiguous
  || lastOfferContext.product_ids.length > 0  // ← only cleared on start_reset
);
```

`shownProducts` is read from `session.flow_context.buy_flow.shown_products`.
In Validation, `shown_products` only updates when `resolver_output.products.length > 0`.
When a broad query returns zero results, old `shown_products` persist unchanged.
`lastOfferContext.product_ids` persists unless start_reset fires.

This means once a product has been shown, `selectedProductExists = true` for the
rest of the session — even after topic drift, even after many new turns, even after
the user explicitly says they want something different. The only escape is `/start`.

Consequence: The `ambiguous` path can trigger on budget signals even when the shown
products are from an irrelevant conversation 10 turns ago, provided turn distance is ≤ 2.

### 3.3 `shown_products` Is Not Cleared on Broad or Ambiguous

Validation does not explicitly null `shown_products` when `anchor_mode` is `broad`
or `ambiguous`. The only clearing mechanism is `isStartReset` or a new product
search returning non-empty results (which replaces them).

If a broad budget query finds zero products (e.g., "my budget is 5000" when
no phone is that cheap), `shown_products` from the previous iPhone discussion
survives into the next turn. That next turn may immediately trigger `ambiguous`
again because `selectedProductExists` is still true.

### 3.4 `current_interest` Is Cleared Even on `ambiguous`

In Validation:
```js
const currentInterest = isStartReset
  ? null
  : (resolverProducts.length === 1
      ? resolverProducts[0]
      : (anchorMode === 'anchored'
          ? (resolved_reference.raw ?? session.current_interest ?? null)
          : null));  // ← null for BOTH broad AND ambiguous
```

When the user says "25000?" (interpreted as ambiguous) after seeing an iPhone offer,
`current_interest` is cleared. But they may be asking about the price of that exact iPhone
at 25000. Clearing their interest before disambiguation is answered is premature.

The correct behavior would be for `ambiguous` to preserve `current_interest` in
the session while asking for clarification, then re-evaluate it after the user replies.

### 3.5 Product Search Node: `fromContext` Does Not Respect `anchorMode` Correctly

In the active Product Search `jsonBody` template:
```js
const fromContext = cleanPhoneType(([
  $json.rules_output?.resolver_input?.product_context?.brand,
  $json.rules_output?.resolver_input?.product_context?.model,
].filter(Boolean).join(' ')
  || [
    $json.session?.collected_constraints?.brand,  // ← fallback to session
    $json.session?.collected_constraints?.model,
  ].filter(Boolean).join(' ')));
```

For `broad` queries, Rules Layer correctly nulls `product_context.brand/model`.
But the Product Search falls back to `session.collected_constraints.brand/model`
— which may still have the previous brand/model from an earlier anchored query.

The dead code block at the TOP of the jsonBody (before the `={{ JSON.stringify(...) }}`
expression) included the correct guard:
```js
const fromContext = anchorMode === 'anchored' ? cleanPhoneType(...) : null;
```
...but this code is not inside the template expression and does NOT execute.
The active template always falls back to session constraints for `fromContext`,
ignoring anchor mode. This can cause broad queries to silently inherit old brand/model
filters.

### 3.6 `last_constrained_turn` Updates Even During `ambiguous`

When `anchorMode === 'ambiguous'` and `budgetSignal !== null`:
```js
const currentTurnConstrained = Boolean(budgetSignal !== null || currentTurnHasStructuredProductConstraint);
```
`currentTurnConstrained = true` → `last_constrained_turn` is updated.

This extends `recentConstrainedContext` into the next turn. If the user sends
"25000?" (ambiguous) and the bot asks for clarification, on the NEXT turn:
- `lastConstrainedTurnDistance = 1` (just updated)
- `recentConstrainedContext = true` again

If the user then sends another simple reply, they can get stuck in ambiguous again.
Turn N → ambiguous → turn N+1 → ambiguous → loop.

---

## 4. Hidden Failure Modes

### FM-1: Ambiguous Loop After Budget Near Old Context

```
T1: Bot shows 3 phones (recentOfferContext, lastOfferTurnDistance = 0)
T2: User: "25000" → ambiguous → clarification asked
    BUT last_constrained_turn updated (extends window)
T3: User: "the Samsung one" → anchored (brand detected) → resolved ✓

But if T3 is: "ok" (short, no brand):
T3: currentTurnLikelyFollowUp = true, budgetSignal = null → anchored ✓

But if T3 is again: "25000?" (same budget repeated, user is confused):
T3: ambiguous again → loop confirmed
```

This loop has no self-resolving exit unless the user adds a phone name or sends /start.
The bot will keep asking for clarification without ever acting.

### FM-2: Stale shown_products Contaminating Future Sessions

```
T1-T5: User discusses iPhone 13 heavily. shown_products = [iPhone13 options]
T6: "Do you have location?" → info request, resolver not called, shown_products unchanged
T7: "50000?" (asking about something new) → selectedProductExists = true (old iPhones)
    + if T6/T7 within 2 turns of any constrained turn → ambiguous triggered
    → User gets a clarification question when they asked a fresh budget question
```

### FM-3: Broad Budget Reset That Doesn't Clear Context

```
T1: Show iPhone options. current_interest = iPhone 13
T2: "my budget is 30000" → anchorMode computed as 'ambiguous' (not broad!)
    because: budgetSignal=30000, recentOfferContext=true, recentConstrainedContext=true,
    selectedProductExists=true, currentTurnShort=true, no structured constraint
    → NOT broad as intended in the task description for this case
    → The task says this should be "broad + current_interest=null"
    → ACTUAL behavior: ambiguous → clarification asked first
    → After clarification resolved (if user says "new search"), only THEN goes broad
```

This is a semantic gap: "my budget is 30000" intuitively signals a fresh query,
but the system cannot distinguish it from "25000?" without phrasing analysis.
The current pure-signal approach conflates these.

### FM-4: Single Match After Broad → Immediate Re-Anchor Without User Confirmation

```
T1: "Budget 20000" → broad → resolver finds exactly 1 phone → current_interest = that phone
T2: "okay" → currentTurnLikelyFollowUp=true, budgetSignal=null → anchored
    The bot now anchors to the single phone from the previous broad search
    This is technically correct but the user never explicitly chose that phone
    They may just be acknowledging the price, not accepting the product
```

### FM-5: Product Search Inheriting Stale Brand on Broad Query

```
T1: Search "Samsung S23" → collected_constraints.brand = "Samsung", model = "S23"
T2: "Budget 25000" (no brand mentioned) → broad → Rules nulls product_context.brand/model
T3: Product Search node falls back to session.collected_constraints.brand/model
    → Search runs as: brand=Samsung, model=S23, budget=25000
    → User gets Samsung results even though they said nothing about brand
    → This silently narrows a broad query
```

### FM-6: Exchange + Budget = Ignored by Budget Override

```
anchorMode computed first, then:
if (budgetSignal !== null && businessIntent !== 'exchange' && currentFlow !== 'exchange')
```
This guard is correct — exchange flow is protected from budget override.
However, Understanding AI might classify an exchange message as `product_search`
if it contains both exchange intent and a number (e.g., "exchange my iPhone, budget 30k").
Then `businessIntent = 'product_search'` and `currentFlow` may not be 'exchange' yet.
Budget override FIRES → exchange signal lost.

---

## 5. Evaluation of `ambiguous` Behavior

### When does it trigger correctly?
- "25000?" after product offer → ✅ correct (price about product vs new budget)
- "50k?" after multi-product show → ✅ correct
- "the cheap one? 25000" → NOT ambiguous (`reference_resolution.refers_to` set → structured constraint → anchored) → ✅ correct

### When does it trigger incorrectly?
- "my budget is 30000" after iPhone offer → triggers `ambiguous` when intent is clearly a fresh search → ❌ semantic gap
- Repeated budget queries during clarification → extends ambiguous window → ❌ loop risk

### Does ambiguous over-trigger or under-trigger?
**Over-triggers** in cases where phrasing provides strong fresh-start signal (explicit "my budget is X").
**Under-triggers** in cases where a brand name + price appear together — the brand makes it `anchored` immediately, bypassing ambiguous even if the intent is ambiguous.

### Should ambiguous preserve `current_interest`?
**Yes.** Clearing `current_interest` before disambiguation is answered is premature.
If the user says "25000?" while looking at an iPhone, and the bot asks "did you mean
for this iPhone or a new search?", clearing the iPhone context means if they answer
"for this iPhone", the context is already gone.

---

## 6. Evaluation of Session Fields

### `last_offer_context` (turn_index, offer_type, product_ids)
**Sufficient for its purpose.** Models when and what was last offered.
`turn_index` enables distance calculation. `offer_type` (single/multi/none) enables
resolver to know what kind of choice the user is referencing.
`product_ids` slice(0,3) is a safe limit.

**Risk:** Only 3 IDs stored. If user was shown 5 products, IDs 4-5 are lost.
`lastOfferContext.product_ids.length > 0` is true regardless, but if resolved_id
references product 4 or 5, it won't be found in the stored ids.

### `last_constrained_turn`
**Sufficient but problematic.** Updates when `budgetSignal !== null OR has structured constraint`.
The problem: it updates even during `ambiguous`, extending the window.
Should only update when the constraint is SUCCESSFULLY processed (not when it's in limbo).

### `collected_constraints` (budget, brand, model, storage, condition)
**Sufficient for current scope.** All used fields. No phantom fields.
**Risk:** Constraints from an anchored query persist into broad resets.
When `broad`, Rules Layer nulls `mergedConstraints.brand/model/storage/condition`
but the `session_update.collected_constraints` write path is:
```js
collected_constraints: mergedConstraints  (for most paths)
// or
collected_constraints: { ...mergedConstraints, budget_etb: budgetSignal }  (budget override path)
```
For broad + budget, `mergedConstraints.brand = null` → correctly writes null to session.
So constraints ARE properly cleared on broad. This part is safe.

### Missing Fields
- **No `anchor_mode_history` or turn-count for ambiguous loop detection.** The system has no
  counter for "how many consecutive ambiguous turns have occurred". Without this, a loop
  can run indefinitely.
- **No `shown_products_clear_trigger`.** There is no soft-clear for shown_products on
  topic drift. Only hard-clear on start_reset.

### Unnecessary or Risky Fields
- **`admin_section`, `admin_status`, `admin_type`, `admin_intent`, `admin_has_images`** are
  duplicated both inside `admin_lead` and as flat top-level session fields. This is
  redundant but not risky.
- **`last_asked_key`** reads correctly from Understanding AI but can be stale if Understanding
  AI does not set it (returns null). The fallback `missing_fields[0]` is a reasonable guard.

---

## 7. Smallest Next Improvement

**Target: Fix the `ambiguous` + budget override structural conflict in Rules Layer.**

**Why this is highest priority:**
- It is the only place where `reply_mode` and `reasoning` are actively contradictory
- It causes unnecessary Product Search API calls on every ambiguous turn
- It sends mixed signals to Reply AI (`business_resolve` + `clarification_needed`)
- It is isolated to one block at the bottom of the Rules Layer
- It requires exactly one conditional branch, no data model changes

**What to change (description only — no implementation):**

The final budget override block in Rules Layer should be split into two branches:

1. **If `anchorMode === 'ambiguous'`:**
   - Set `reply_mode = 'clarify_reference'` (correct for asking clarification)
   - Set `should_call_resolver = false` (no search needed)
   - Do NOT update `last_constrained_turn` (constraint is in limbo, not confirmed)
   - Do not fire the budget override path

2. **If `anchorMode !== 'ambiguous'` (broad or anchored) and `budgetSignal !== null`:**
   - Execute the existing budget override logic unchanged

**Risk level:** Very low. The resolver path for ambiguous already works as the
fallback — it just had unnecessary overhead. Removing the call makes the pipeline
cheaper and the signal chain consistent.

**Secondary improvement (if the above is clean):**
Preserve `current_interest` in session when `anchorMode === 'ambiguous'`. Only clear
it after the clarification is resolved (i.e., the next turn arrives and is NOT ambiguous).
This requires adding a `pending_context` or simply not clearing in Validation on
ambiguous turns.

---

## 8. Exact Layer Responsible for Each Issue

| Issue | Layer |
|-------|-------|
| Budget override fires for ambiguous | **Rules Layer** |
| `current_interest` cleared for ambiguous | **Validation** |
| `shown_products` not cleared on broad/ambiguous | **Validation** |
| `selectedProductExists` too broad (includes stale shown_products) | **Rules Layer** |
| `last_constrained_turn` updates during ambiguous | **Rules Layer** |
| Product Search `fromContext` ignores anchor_mode | **Product Search node (jsonBody)** |
| No ambiguous-loop break counter | **Rules Layer + Validation** |
| Exchange + budget signal race condition | **Rules Layer** |

---

## 9. What Must NOT Be Touched Next

The following components are correct and stable. Any change to them would
introduce risk without benefit:

1. **`currentTurnHasStructuredProductConstraint` computation** — the union of
   reference_type, phone_type, brand, storage, ram, condition is the correct anchoring
   signal. Do not simplify or expand it.

2. **`currentTurnLikelyFollowUp` computation** — the AND of 5 conditions is deliberately
   strict. Loosening any condition increases false-positive follow-up detection.

3. **Turn distance expiry window (`<= 2`)** — this window is calibrated to real
   conversation rhythm. Changing it to 3 or 1 would either increase stale context
   risk or break fast follow-ups.

4. **`start_reset` full-clear behavior** — it correctly wipes all state including
   `last_offer_context`, `shown_products`, `current_interest`, and constraints.
   Do not add conditions to this path.

5. **Resolver's `anchorMode === 'ambiguous'` short-circuit** — `result_type:
   clarification_needed` with no products is the correct and safe output for the
   ambiguous mode. Do not change the resolver to attempt partial product filtering
   here.

6. **Understanding AI schema** — the 6 `message_function` values and 5 `business_intent`
   values are well-scoped. Expanding this schema would increase Understanding AI
   hallucination risk and require guard updates across 3 nodes.

7. **`normalizeNullableNumber` in Rules Layer** — the k/thousand parsing and grouped
   decimal detection is correct for Ethiopian number formatting ("25k", "25,000").
   Do not touch this.

8. **Session Bootstrap normalization layer** — all data reaches downstream nodes
   through a clean, schema-enforced structure. Skipping or bypassing it would
   introduce raw-data fragility.

---

## Appendix: Traced Scenarios

| Scenario | Expected | Actual | Status |
|----------|----------|--------|--------|
| "Samsung around 25000" | anchored | anchored (brand+budget → currentTurnHasStructuredProductConstraint=true via brand) | ✅ |
| "iPhone 13 for 25000" | anchored | anchored (phone_type=iPhone 13 → constrained) | ✅ |
| "my budget is 30000" after iPhone offer | broad | **ambiguous** (short + recent context + budget signal) | ⚠️ Diverges from stated intent |
| "25000?" after product offer | ambiguous | ambiguous | ✅ |
| "okay" after reset turn | ambiguous | anchored (no budget, likelyFollowUp=true) | ✅ |
| "the cheap one" after multi-product | anchored | anchored (reference detected) | ✅ |
| "reserve it" after product shown | buy flow close | handled outside anchor logic (handled directly in Validation) | ✅ |
| "25000?" → clarification → "25000?" again | ambiguous resolved | **loop risk** (last_constrained_turn extended) | ⚠️ |
| Broad query → zero products → next "okay" | fresh | anchored (old shown_products alive → selectedProductExists=true) | ⚠️ Stale state |

---

*This report is planning-only. No runtime files were modified.*
