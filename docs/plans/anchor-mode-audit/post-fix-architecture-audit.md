# Post-Fix Architecture Audit (After 3 Applied Fixes)
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**File Inspected:** `workflow.json`
**Date:** 2026-04-03
**Applied Fixes Baseline:**
  1. Ambiguous anchor_mode no longer calls resolver (`clarify_reference`, `should_call_resolver = false`)
  2. `shown_products` no longer counts toward `selectedProductExists` / `hasActiveContext` in Rules Layer without `recentOfferContext`
  3. Validation clears `shown_products` when `anchorMode === 'broad'` and resolver returns zero products
**Mode:** Planning / Audit Only — No code changed

---

## 1. Architecture Verdict

> **Mostly Stable. Ready for live use with one bounded residual risk.**

The three fixes together eliminated the primary failure modes: uncontrolled resolver calls
on ambiguous, stale product context driving false anchor mode permanently, and stale
products re-surfacing as search results on empty broad queries. The system now has
coherent boundaries around context expiry.

One bounded loop risk remains — not infinite, but still visible to users in realistic
scenarios. It can be resolved with a targeted single-field addition.

---

## 2. What Is Now Fully Fixed

### Fix 1 — Ambiguous No Longer Calls Resolver
**Layer:** Rules Layer

Before: Budget override always fired (`reply_mode: 'business_resolve'`, `should_call_resolver: true`)
even when `anchorMode === 'ambiguous'`, causing contradictory signals to Resolver and Reply AI.

After: Ambiguous branch sets `reply_mode: 'clarify_reference'`, `should_call_resolver: false`.
- Resolver is never called for ambiguous ✅
- Product Search API is never called for ambiguous ✅
- Reply AI receives consistent signal: `reply_mode = 'clarify_reference'` ✅
- No `invalid_resolver_result_type` validation issue on ambiguous ✅

### Fix 2 — `shown_products` Time-Gated in Rules Layer
**Layer:** Rules Layer

Before: `shownProducts.length > 0` made `selectedProductExists`, `hasProductContext`,
and `hasActiveContext` permanently true after first offer.

After: Both `shownProducts.length > 0` and `lastOfferContext.product_ids.length > 0`
are gated behind `recentOfferContext` in `selectedProductExists`.

`anchorMode = 'ambiguous'` now requires ALL of:
- `budgetSignal !== null`
- `recentOfferContext` (lastOfferTurnDistance ≤ 2) ← now the binding gate
- `recentConstrainedContext` (lastConstrainedTurnDistance ≤ 2)
- `selectedProductExists` (which requires `recentOfferContext` for shown_products)
- `currentTurnShort`

Old products beyond turn distance 2 can no longer trigger ambiguous. ✅

### Fix 3 — Validation Clears `shown_products` on Broad + Zero Results
**Layer:** Validation

Before: Old `shown_products` survived any turn where the resolver returned nothing,
including broad searches that found no matching product.

After: When `anchorMode === 'broad'` and resolver returns zero products, `shown_products` is
cleared to `[]`. This protects two downstream channels on the NEXT turn:
- Understanding AI no longer receives stale product IDs in its prompt ✅
- Business Data Resolver `candidateProducts` fallback has no stale pool ✅

---

## 3. What Is Still Risky

### 3.1 `last_constrained_turn` Still Updates During Ambiguous Turns — MEDIUM RISK

**Node:** Rules Layer

During an ambiguous turn, `budgetSignal !== null` → `currentTurnConstrained = true`.
The session_update writes:
```
last_constrained_turn: currentTurnConstrained ? currentTurnIndex : lastConstrainedTurnIndex
```

Fix #1 overrides `reply_mode` and `should_call_resolver` for ambiguous, but does NOT
override `session_update.last_constrained_turn`. The base session_update — which has
`last_constrained_turn = currentTurnIndex` — is spread into the ambiguous branch via
`...rules_output`.

**Consequence:** Each ambiguous turn updates `last_constrained_turn` to the current
turn index. This keeps `recentConstrainedContext` active into the next turn, which
is one of the conditions for ambiguous to re-trigger.

**Loop trace with all 3 fixes applied:**

```
T1: Bot shows 2 phones
    → last_offer_context.turn_index = 1
    → product_ids = [A, B]

T2: User: "25000?" (budgetSignal=25000, short, no phone type)
    → recentOfferContext: distance = 2-1 = 1 ≤ 2 → TRUE
    → recentConstrainedContext: last_constrained_turn = null or old → may be within window
    → selectedProductExists: recentOfferContext && shown_products.length > 0 → TRUE (shown_products not cleared on ambiguous)
    → anchorMode = 'ambiguous' → clarification asked (fix #1 working)
    → last_constrained_turn = 2 ← EXTENDED by unfixed behavior
    → shown_products PRESERVED (fix #3 only clears on broad, not ambiguous)
    → last_offer_context PRESERVED (offer turn_index still = 1)

T3: User: "25000?" again (confused, repeating)
    → recentOfferContext: distance = 3-1 = 2 ≤ 2 → TRUE (still within window)
    → recentConstrainedContext: distance = 3-2 = 1 ≤ 2 → TRUE (extended by T2!)
    → selectedProductExists: (recentOfferContext && shown_products.length > 0) → TRUE
    → anchorMode = 'ambiguous' again → second clarification question
    → last_constrained_turn = 3 ← extended again

T4: User: "25000?" again
    → recentOfferContext: distance = 4-1 = 3 > 2 → FALSE ← natural expiry
    → ambiguous condition fails → anchorMode = 'broad' ← loop exits naturally
```

**Conclusion:** The loop is bounded to **2 consecutive ambiguous turns maximum**
(limited by `recentOfferContext` expiry, which is NOT extended on ambiguous because
fix #1 prevents resolver calls, which means `last_offer_context.turn_index` is never
re-stamped during ambiguous). The loop does NOT run indefinitely.

However, the user experiences two redundant "did you mean...?" questions before
the system accepts their budget as a new broad search. This is a visible UX regression.

### 3.2 `last_offer_context.product_ids` Not Cleared on Broad + Zero Results — LOW RISK

**Node:** Validation

Fix #3 clears `shown_products` on broad+zero. But `last_offer_context` is NOT cleared
in the same condition. The Validation write for `nextLastOfferContext` when
`resolverProducts.length === 0`:

```
nextOfferType = 'none'
→ nextLastOfferContext = preserve old last_offer_context (turn_index, offer_type, product_ids unchanged)
```

So after broad+zero:
- `shown_products = []` ✅ (fix #3)
- `last_offer_context.product_ids = ['old-id-1', 'old-id-2']` ← stale, preserved

On the NEXT turn: `selectedProductExists = (recentOfferContext && product_ids.length > 0)`
— still `true` if within the offer expiry window (likely, since broad+zero is usually
an immediate response to a recent offer's context).

**Impact:** Within 2 turns of the original offer, even after a broad+zero clears
`shown_products`, `selectedProductExists` can still be `true` via `product_ids`.
This means the ambiguous condition can still trigger from the `product_ids` channel
despite fix #3.

**Severity:** Lower than 3.1. Not loop-inducing (offer turn_index not extended on
broad). Isolated to the 1-2 turn window after a failed broad search adjacent to
a prior offer. The `last_constrained_turn` fix (below) further limits exposure.

### 3.3 `currentInterest` Not Time-Gated in Rules Layer — LOW RISK

**Node:** Rules Layer

`currentInterest` contributes directly to `selectedProductExists` and `hasProductContext`
without a `recentOfferContext` gate:
```
selectedProductExists = resolvedProduct || currentInterest || (recentOfferContext && ...)
```

In Validation, `currentInterest` is already cleared when:
- `anchorMode === 'broad'` → `currentInterest = null`
- `anchorMode === 'ambiguous'` → `currentInterest = null`
- `isStartReset` → `currentInterest = null`

The only scenario where a stale `currentInterest` persists is a long anchored session
where every turn is `anchored` and no broad search ever fires. In that case, preserving
`currentInterest` is intentional — the user is still looking at the same product.

**Practical risk:** When a user has been on anchored for many turns, then sends a budget
signal with no product name, `hasProductContext = true` from `currentInterest` →
`computedMissingFields` does not push `brand_or_model`. The bot will try to continue
with the old product rather than asking what they're looking for. This may or may not
be the correct behavior (arguably it is — last known product is a reasonable anchor).

**Verdict:** This is **intentional behavior**, not a bug. `currentInterest` is the
product the resolver last confirmed. Preserving it across consecutive anchored turns
is correct. Low risk, borderline design choice — do not change.

### 3.4 Reply AI `has_active_context` Still Reads `shown_products` Directly — LOW RISK

**Node:** Reply AI

The Reply AI prompt computes `has_active_context` directly from session fields:
```
has_active_context: shown_products.length > 0 || currentInterest || current_flow || ...
```

This reads from the session object that Validation populated in the PREVIOUS turn.
After fix #3, on broad+zero: `shown_products = []` written to session. On the NEXT
turn (when Understanding AI and Reply AI run), they read `[]`. The 1-turn lag is
inherent in the architecture (Validation writes AFTER all AI nodes run).

After the 1-turn lag, `has_active_context = false` via the `shown_products` channel
(since `shown_products = []`). However, it can still be `true` via:
- `conversation_history.length > 0` (always true after first message)
- `current_flow` (stays 'buy' through broad turns)
- `current_topic` (stays 'product' through buy turns)

**Impact:** Reply AI may suppress re-opening greeting even when a broader restart
would be natural. But since `rules_output.reply_mode` drives the actual routing
logic and the Reply AI system prompt explicitly defers to `reply_mode`, this is
a phrasing nuance — not a routing error.

**Verdict:** Acceptable. Low priority. Conversation history and current_flow being
present is the correct reason for `has_active_context = true`, not `shown_products`.

---

## 4. The Single Next Highest-Priority Issue

> **`last_constrained_turn` updating during ambiguous turns.**

### Why This Is the Next Priority

It is the only mechanism that keeps a bounded but user-visible ambiguous loop alive.
Without it:
- On any ambiguous turn: `last_constrained_turn` would NOT be updated
- On the NEXT turn: `recentConstrainedContext.lastConstrainedTurnDistance` = currentTurn - (older_constrained_turn)
- If the older turn was T-3 or more, `recentConstrainedContext = false`
- Ambiguous condition fails: `recentOfferContext && recentConstrainedContext && selectedProductExists` → cannot all be true
- System goes broad → resolves correctly

With the fix applied, the maximum ambiguous-loop length drops from **2 consecutive turns** to
**1 clarification per event** — after which `recentConstrainedContext` begins expiring naturally
and the next budget signal is treated as a broad query.

### Why Not Priority Fix 3.2 (`product_ids` not cleared)

Fixing `last_constrained_turn` (priority 1) is upstream of the `product_ids` issue (priority 2).
After the `last_constrained_turn` fix, a single ambiguous turn is followed by
`recentConstrainedContext` starting to expire. Even if `product_ids` can still make
`selectedProductExists = true`, the full ambiguous condition
(`budgetSignal && recentOfferContext && recentConstrainedContext && selectedProductExists && short`)
requires ALL conditions. With `recentConstrainedContext` expiring, the second ambiguous
turn becomes much less likely. Priority 2 becomes a very low risk after priority 1.

---

## 5. Smallest Safe Next Improvement

**Target:** Prevent `last_constrained_turn` from updating during ambiguous turns.

**Where:** In the Rules Layer ambiguous branch of the budget override block (the same
location as fix #1), add a `session_update` override:

**Current ambiguous branch (fix #1 applied):**
```
if (anchorMode === 'ambiguous') {
  rules_output = {
    ...rules_output,
    reply_mode: 'clarify_reference',
    should_call_resolver: false,
    reasoning: 'ambiguous_anchor_requires_clarification',
    // session_update NOT overridden → last_constrained_turn is still updated
  };
}
```

**Proposed addition (description only):**
```
if (anchorMode === 'ambiguous') {
  rules_output = {
    ...rules_output,
    reply_mode: 'clarify_reference',
    should_call_resolver: false,
    reasoning: 'ambiguous_anchor_requires_clarification',
    session_update: {
      ...rules_output.session_update,
      last_constrained_turn: lastConstrainedTurnIndex,  // keep old value — constraint is unresolved
    },
  };
}
```

**Effect:** On an ambiguous turn, `last_constrained_turn` is NOT advanced. The constraint
(budget signal) is treated as in-limbo — not confirmed, not recorded. Once the user
resolves the ambiguity on the next turn (either by naming a phone → anchored, or by
sending a clear fresh request), `last_constrained_turn` updates at that point correctly.

**Risk:** Very low. `lastConstrainedTurnIndex` is already defined in scope at this point.
The only change is which value is written — old vs current. No data shape change.
No new variables. No other node impacted.

**Scope:** 4 lines added inside an existing `if` block in the Rules Layer node.

---

## 6. Exact Layer / Node Ownership

| Issue | Layer | Node ID | Priority |
|-------|-------|---------|----------|
| `last_constrained_turn` updating on ambiguous | Rules Layer | `rules-layer` | **Next fix** |
| `last_offer_context.product_ids` not cleared on broad+zero | Validation | `side-effects` | After above |
| Reply AI `has_active_context` stale (1-turn lag) | Reply AI | `reply-ai` | Optional, low |

The Rules Layer fix is the correct first next step. The Validation `product_ids` fix
can follow once the `last_constrained_turn` fix is verified stable — at that point, the
combined effect eliminates essentially all stale-context ambiguous re-triggering.

---

## 7. What Must NOT Be Changed

### `recentOfferContext` window (`<= 2`)
This is the natural expiry gate that bounds the ambiguous loop even without the
`last_constrained_turn` fix. Tightening to `<= 1` would break legitimate single-turn
follow-ups. Widening to `<= 3` would extend loop risk. Leave unchanged.

### Ambiguous `shown_products` preservation (fix #3 is correctly scoped to broad only)
Clearing `shown_products` on ambiguous would remove the reference pool the user
is potentially trying to reference during clarification. Fix #3's condition
(`anchorMode === 'broad'`) is exactly right. Do not extend to ambiguous.

### `candidateProducts` fallback in Business Data Resolver
`products.length > 0 ? products : shownProducts` is correct for anchored refinements.
The fix for broad+zero stale products is the Validation write path (fix #3 already applied),
not the resolver's read path.

### `currentInterest` contribution to `selectedProductExists` (unmodified)
This is intentional design for the anchored flow. The anchored path depends on
`currentInterest` being non-null to avoid re-asking users for their product of interest.
Gating it behind `recentOfferContext` would break multi-turn anchored conversations
where the product was offered more than 2 turns ago but is still the valid topic.

### Fix #1 `reply_mode: 'clarify_reference'`
The clarification reply mode is correct for ambiguous. Do not change it back to
`business_resolve` for any reason. The ambiguous path should never call the resolver.

### Fix #2 `recentOfferContext` gating in `selectedProductExists`
The time-gating of `shownProducts` and `product_ids` in `selectedProductExists` is
correct and already applied. Do not re-open or widen.

---

## Summary Table

| Component | Before 3 Fixes | After 3 Fixes | Remaining Risk |
|-----------|---------------|---------------|----------------|
| Ambiguous → Resolver call | Always (wrong) | Never ✅ | None |
| Stale `shown_products` driving anchor mode | Permanent | Time-gated to ≤ 2 turns ✅ | None |
| Stale `shown_products` in candidateProducts (broad+zero) | Always | Cleared ✅ | Minor (product_ids still present) |
| Ambiguous loop length | Potentially infinite | **Max 2 turns** | 1-2 redundant clarifications |
| `current_interest` stale risk | Medium | Low (intentional) | Acceptable |
| Reply AI `has_active_context` stale | Medium | Low (1-turn lag) | Acceptable |
| `last_constrained_turn` during ambiguous | Extends loop | **Still extends** | **Next fix target** |

---

*This report is planning-only. No runtime files were modified.*
