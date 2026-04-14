# Residual `shown_products` Risk Audit (Post Rules Layer Fix)
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**File Inspected:** `workflow.json`
**Date:** 2026-04-03
**Scope:** Downstream risk of stale `shown_products` AFTER the Rules Layer fix is applied
**Mode:** Planning / Audit Only — No code changed

---

## Baseline: What the Rules Layer Fix Changed

The applied fix narrowed `selectedProductExists` and `hasActiveContext` in the Rules Layer:

**Before (timeless):**
```
selectedProductExists = resolvedProduct || currentInterest
  || shownProducts.length > 0
  || lastOfferContext.product_ids.length > 0
```

**After (time-gated):**
```
selectedProductExists = resolvedProduct || currentInterest
  || (recentOfferContext && shownProducts.length > 0)
  || (recentOfferContext && lastOfferContext.product_ids.length > 0)
```

`hasActiveContext` received the same gating on the `shownProducts.length > 0` branch.

**What this fixes:**
- `ambiguous` no longer triggers from stale shown_products (no longer makes `selectedProductExists = true` after turn distance > 2)
- `shouldContinueContext` no longer stays true from stale shown_products alone
- False-positive `anchored` mode from old product context is suppressed

**What this does NOT fix:**
- Understanding AI still receives stale `shown_products` directly
- Business Data Resolver still uses stale `shown_products` as `candidateProducts` fallback
- Reply AI still reads stale `shown_products` directly for `has_active_context`
- Validation still preserves stale `shown_products` on every non-resolver and zero-result turn

These are independent read paths that bypass the Rules Layer entirely.

---

## 1. Understanding AI — Remaining Risk After Fix

**Node:** `understanding-ai`
**Read:**
```js
shown_products: Array.isArray($json.session?.flow_context?.buy_flow?.shown_products)
  ? $json.session.flow_context.buy_flow.shown_products.slice(0, 5)
  : [],
```

The Understanding AI prompt injects up to 5 shown products as session context. The
Rules Layer fix does not affect this. Understanding AI runs before the Rules Layer,
so any flag changes in Rules Layer come after the damage is done.

### The Specific Risk

Understanding AI uses shown_products to resolve references like:
- "that one", "the cheaper one", "this phone", "the second one"

If stale products are injected, the AI resolves these references to **old, irrelevant
product IDs**. This produces:

```
reference_resolution.refers_to = "last_shown_option"
reference_resolution.resolved_id = "stale-product-id-from-turn-1"
```

In Rules Layer, this has a direct consequence that BYPASSES the new fix:

```js
const currentTurnHasStructuredProductConstraint = Boolean(
  reference_resolution.reference_type !== 'none'   ← triggers if refers_to is set
  || reference_resolution.resolved               ← triggers if resolved_id is set
  || currentTurnPhoneType
  ...
);
```

`currentTurnHasStructuredProductConstraint = true` → `anchorMode = 'anchored'`

The Rules Layer fix gated `selectedProductExists` behind `recentOfferContext`. But
`currentTurnHasStructuredProductConstraint` is a separate input computed from
Understanding AI output, not from `shown_products` directly. The fix has no effect here.

**Result:** Even after the Rules Layer fix, stale `shown_products` can still force
`anchorMode = 'anchored'` through the reference_resolution pathway:

> User: "okay, any other options?" (3 turns after last offer, old products in session)
> → Understanding AI sees stale iPhone 13 in shown_products
> → AI resolves "other options" as referring to the iPhone 13 context
> → `reference_resolution.refers_to = 'last_shown_option'`, `resolved_id = 'iphone13-id'`
> → `currentTurnHasStructuredProductConstraint = true`
> → `anchorMode = 'anchored'` to a phone the user may not care about anymore

**Severity after fix:** HIGH — this is an independent channel, fully unaffected by
the Rules Layer change.

---

## 2. Business Data Resolver — Remaining Risk After Fix

**Node:** `business-data-resolver`
**Read:**
```js
const candidateProducts = products.length > 0 ? products : shownProducts;
```

The `candidateProducts` fallback is entirely downstream of the Rules Layer. The
Rules Layer fix changed how boolean flags are computed. It did not change what happens
inside the resolver when the API returns zero results.

### When Does This Fire?

| Scenario | `products` (API result) | `candidateProducts` used |
|----------|------------------------|--------------------------|
| Broad budget search, products found | `[...new products]` | New products ✅ |
| Broad budget search, no match | `[]` | **Stale `shownProducts`** ❌ |
| Anchored follow-up, product still available | `[...matching]` | New products ✅ |
| Anchored follow-up, API returns nothing | `[]` | **Stale `shownProducts`** — intentional ✅ |
| Ambiguous | Short-circuited, never reaches candidateProducts | Moot |

The anchored path using old `shownProducts` as fallback is **correct and intentional** —
the user is referencing a specific product and the API may just have an empty result.
The danger is the **broad path** using stale products.

### Concrete Risk (Post-Fix)

```
T1: [Broad] Show iPhone 13 (38,000 ETB), iPhone 13 Pro (48,000 ETB)
    → shown_products = [iPhone13, iPhone13Pro]
    → last_offer_context.turn_index = 1

T4: [Broad] User: "budget 40,000, any Samsung?" 
    → Rules Layer fix applies: selectedProductExists is now false (turn distance > 2)
    → anchorMode = broad (correct, fix worked)
    → Product Search finds no Samsung → products = []
    → Business Data Resolver: candidateProducts = shownProducts (stale iPhone data)
    → Budget filter: 40,000 ≥ iPhone 13 at 38,000 ET? → match
    → replyProducts = [iPhone 13] ← wrong product, wrong brand
    → Bot presents iPhone 13 to a user who asked for Samsung at 40,000

T5: Resolver output had products → Validation stamps last_offer_context.turn_index = 4
    → recentOfferContext = true on next turn
    → This re-arms the context window from stale data
```

The Rules Layer fix prevented T4 from triggering false ambiguous. But it did not
prevent the resolver from serving wrong products on empty API results. The stale
re-arming loop in T5 is also unaffected by the fix.

**Severity after fix:** HIGH — independent of Rules Layer, direct user-visible symptom.

---

## 3. Reply AI `has_active_context` — Remaining Risk After Fix

**Node:** `reply-ai`
**Read:**
```js
has_active_context: Boolean(
  ($json.session?.conversation_state?.current_flow ?? null)
  || ($json.session?.conversation_state?.current_topic ?? null)
  || (Array.isArray($json.session?.conversation_history) && $json.session.conversation_history.length > 0)
  || (Array.isArray($json.session?.flow_context?.buy_flow?.shown_products)
      && $json.session.flow_context.buy_flow.shown_products.length > 0)   ← still reads session directly
  || $json.session?.flow_context?.buy_flow?.current_interest
),
```

Reply AI reads `shown_products` directly from the session object — the same raw
session that was populated before the Rules Layer ran. The Rules Layer fix only
changed internal flag computations; it does NOT modify the session object received
by Reply AI.

### Is This Still Harmful?

The `has_active_context = true` flag in the Reply AI prompt controls:
1. Greeting suppression: "If reply_context.has_active_context is true, continue that
   context instead of asking a generic buying-or-exchange question."
2. Re-opening prevention: no "what phone are you looking for?" opener.

After the Rules Layer fix:
- `rules_output.reply_mode` is computed correctly (e.g., `off_topic_redirect`)
- The resolver does not anchor wrongly
- But Reply AI still receives `has_active_context = true` and suppresses its greeting

In practice, Reply AI should defer to `rules_output.reply_mode` for behavioral routing.
If `reply_mode = 'off_topic_redirect'`, the system prompt says to stay on-topic.
Whether `has_active_context` is true or false changes phrasing, not routing.

**Severity after fix:** LOW-MEDIUM — causes incorrect phrasing (no re-opening even
when appropriate) but does not cause wrong routing, wrong product answers, or
wrong anchor mode. The AI's behavioral guardrails are driven by `reply_mode`, not
`has_active_context` alone.

**Conclusion:** This is a polish issue, not a correctness issue. Low priority compared
to risks #1 and #2.

---

## 4. Validation Persistence — Root Source Still Active

**Node:** `side-effects` (Validation)

```js
const shownProducts = isStartReset
  ? []
  : (resolver_output && Array.isArray(resolver_output.products)
      && resolver_output.products.length > 0
        ? resolver_output.products
        : (Array.isArray(session.flow_context?.buy_flow?.shown_products)
            ? session.flow_context.buy_flow.shown_products
            : []));
```

The Validation write path is the origin of all stale `shown_products` risk. Nothing
in the Rules Layer fix changes this write behavior. After every turn where the
resolver returns zero products or is not called, old `shown_products` survive into
the next session load.

Stale `shown_products` in the persisted session then feeds Understanding AI on the
NEXT turn — before Rules Layer even runs. This is why downstream risks #1 and #2
remain live after the Rules Layer fix.

**Validation is the correct fix layer.** Rules Layer fix was the correct first step
(gating boolean flags). Validation fix is the correct second step (controlling
the persistence of the underlying data).

---

## 5. Answering the Specific Questions

### Q1: Is stale `shown_products` still a real downstream problem after the Rules Layer fix?

**Yes — in two specific channels:**

| Channel | Risk level | Affected by Rules Layer fix? |
|---------|-----------|------------------------------|
| Understanding AI reference resolution → false anchor | HIGH | No — runs before Rules Layer |
| Business Data Resolver candidateProducts fallback → wrong product shown | HIGH | No — runs after but independently |
| Reply AI `has_active_context` → wrong greeting suppression | LOW-MEDIUM | No — reads session directly |
| Rules Layer `selectedProductExists` / `hasActiveContext` | FIXED | Yes ✅ |

The Rules Layer fix neutralized the anchor mode triggering and context continuation
from stale products. But it cannot protect against:
- LLM-level reference resolution against stale product IDs (upstream of Rules Layer)
- The resolver's product fallback when the API is empty (downstream of Rules Layer)

---

### Q2: Is Validation-side clearing on broad + zero resolver products still necessary?

**Yes — to address risks #1 and #2 which the Rules Layer fix cannot reach.**

Without Validation clearing:
- On the NEXT turn after "broad + zero products", Understanding AI will still receive
  stale `shown_products` and may wrongly resolve references to old products
- Business Data Resolver will still fall back to stale candidates if the API is empty
  again on that next turn

The Rules Layer fix protected the anchor mode flags from being misled by stale data.
But it did not prevent the stale data from existing in the session. Clearing on
broad + zero results removes the source data, which protects both upstream (Understanding AI
on the next turn) and downstream (resolver fallback on the next turn) simultaneously.

---

### Q3: Would Validation clearing be safe, or could it break legitimate refinement flows?

**Safe — with the correct scoping.**

The legitimate scenario where stale `shown_products` SHOULD be preserved as a fallback is:

> **Anchored follow-up where the API returns zero new results.**
> The user said "Samsung S23" → bot showed it → user asks a refinement → resolver
> re-fetches but API returns nothing new → falls back to old `shownProducts` →
> correct, the old iPhone is still relevant.

This scenario is `anchorMode === 'anchored'`. It must NOT be cleared.

For `anchorMode === 'broad'` with zero results:
- There is no product the user was anchored to
- The search returned nothing relevant
- Old products from a different context are not a valid fallback
- No legitimate refinement can happen against a product the user was NOT looking for
- Clearing is safe

For `anchorMode === 'ambiguous'` with zero results:
- The resolver short-circuits before reaching `candidateProducts` — returns
  `clarification_needed` without filtering any products
- `resolver_output.products = []` always for ambiguous
- Clearing shown_products on ambiguous would erase context the user might be
  referencing in their clarification
- **Do NOT clear on ambiguous.**

---

### Q4: Is there a smaller or safer condition than `broad + zero` for clearing?

**The cleanest condition is: `anchorMode === 'broad'` unconditionally.**

Reasoning:
- If `anchorMode === 'broad'` AND `products.length > 0`: Validation already replaces
  `shown_products` with the new products (no change in behavior)
- If `anchorMode === 'broad'` AND `products.length === 0`: Validation clears ← new behavior
- If `anchorMode !== 'broad'` (anchored, ambiguous): no change — preserve as before

The condition `anchorMode === 'broad'` is simpler, easier to read, and produces
identical results for the `products.length > 0` case. It adds exactly one new behavior:
clearing when broad search returns nothing.

**Alternative narrower condition: `anchorMode === 'broad' AND products.length === 0`**

This is equally correct and slightly more explicit. Either form is safe.
The unconditional broad form is preferred for readability and robustness —
it makes the invariant clear: *after a broad search, shown_products always reflects
only the results of that search (possibly empty).*

**Condition to avoid:** Clearing on `resolver not called` (i.e., acknowledgment turns,
info turns, admin handoffs). These non-resolver turns are not "resets" — the user
is continuing a thread. Clearing on these would erase context the user is still
in the middle of.

**Condition to avoid:** Clearing on `anchorMode === 'ambiguous'`. Already explained —
the user is in the middle of disambiguation and the products are the reference objects.

---

### Q5: What Is the Smallest Safe Next Improvement?

**Validation: change `shown_products` write logic to clear on `anchorMode === 'broad'`.**

**Scope:** One conditional addition in the `shownProducts` resolution block within
the `side-effects` (Validation) node.

**Current logic (summarized):**
```
shown_products =
  isStartReset  → []
  products.length > 0 → new products (replace)
  otherwise → preserve old
```

**Proposed logic (description only):**
```
shown_products =
  isStartReset         → []
  anchorMode === 'broad' → resolver_output.products (may be [], intentionally)
  products.length > 0  → new products (replace) [already covered by broad above for broad case]
  otherwise            → preserve old
```

Simplified as a single expression:

```
isStartReset → []
anchorMode === 'broad' AND products.length > 0 → new products (same as current behavior)
anchorMode === 'broad' AND products.length === 0 → [] (new behavior — the only change)
anchorMode !== 'broad' AND products.length > 0 → new products (same as current)
anchorMode !== 'broad' AND products.length === 0 → preserve (same as current)
```

Net change: exactly one new case — `broad + zero → clear`. All other cases
are identical to current behavior.

**How to read `anchorMode` in Validation:**
```js
const anchorMode = normalizeText(rules_output.resolver_input?.anchor_mode) ?? 'broad';
```
This is already computed early in the Validation node. Available in scope.

---

## 6. Exact Layer / Node Ownership

| Risk | Node | Node ID | Fix Required? |
|------|------|---------|---------------|
| Understanding AI gets stale products | Validation (write path prevents it next turn) | `side-effects` | Yes — clear upstream |  
| Business Data Resolver wrong candidateProducts | Validation (clear on broad+zero) | `side-effects` | Yes — same fix |
| Reply AI `has_active_context` false positive | Reply AI prompt OR Validation | `reply-ai` + `side-effects` | Low priority, optional |
| Validation preserves stale shown_products | Validation | `side-effects` | **Primary fix target** |

**One fix in one node (`side-effects`) addresses risks #1 and #2 simultaneously.**

Risk #3 (Reply AI) is lower priority and can be deferred. It will also be partially
fixed as a side effect of clearing the session data (the next read will find `[]`).

---

## 7. What Must NOT Be Touched

### Do NOT clear `shown_products` when `anchorMode === 'anchored'`

The anchored path depends on `candidateProducts = products.length > 0 ? products : shownProducts`
as a legitimate fallback. When the user is referencing a specific product and the
API returns nothing (possibly a transient issue or an exact-match query that fails),
falling back to old `shownProducts` is the correct behavior. This must be preserved.

### Do NOT modify `candidateProducts` logic in Business Data Resolver

The resolver fallback `products.length > 0 ? products : shownProducts` is correct
for anchored mode. The fix belongs in _what gets written_ to `shown_products`
(Validation), not in _how_ the resolver uses them. Changing the resolver would
break anchored-fallback behavior.

### Do NOT clear `shown_products` on ambiguous turns

Ambiguous turns are asking the user to disambiguate. The products in `shown_products`
are potentially the reference objects for the user's next reply. Clearing them
during disambiguation removes the context that disambiguation is supposed to resolve.

### Do NOT add a new `shown_products_v2` or parallel field

The fix is a behavioral change to the existing write path. Adding a new field
would require updates across all 5+ read points and would create inconsistency
between old sessions and new sessions during rollout. Not worth the complexity.

### Do NOT touch Understanding AI prompt structure

The `shown_products` injection into Understanding AI will be fixed as a side effect:
once Validation stops persisting stale `shown_products` after broad+zero, the next
turn will naturally receive an empty or fresh array. No change to Understanding AI
node is needed.

### Do NOT revisit the Rules Layer `selectedProductExists` logic

The Rules Layer fix applied in the previous patch is correct and complete. Do not
re-open it. The Validation fix complements it by removing the stale source data;
it does not replace or undo the flag-gating.

---

## Summary Table

| Channel | Risk (before Rules Layer fix) | Risk (after Rules Layer fix) | Remaining fix needed |
|---------|------------------------------|------------------------------|----------------------|
| Rules Layer flags (`selectedProductExists`, `hasActiveContext`) | HIGH | **FIXED** ✅ | None |
| Understanding AI reference resolution | HIGH | HIGH (unaffected) | Yes — Validation clear |
| Business Data Resolver candidateProducts | HIGH | HIGH (unaffected) | Yes — Validation clear |
| Reply AI `has_active_context` | MEDIUM | LOW-MEDIUM | Optional, deferred |
| Validation persistence | Root cause | Root cause (unaffected) | **Primary fix target** |

---

*This report is planning-only. No runtime files were modified.*
