# `shown_products` Lifecycle Audit
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**File Inspected:** `workflow.json`
**Date:** 2026-04-03
**Scope:** `shown_products`, `selectedProductExists`, stale product context
**Mode:** Planning / Audit Only — No code changed

---

## 1. Complete `shown_products` Lifecycle

### 1.1 How It Enters the Pipeline (Session Bootstrap)

**Node:** `session-bootstrap` (id: `session-bootstrap`)

```
const shownProducts = Array.isArray(existing.flow_context?.buy_flow?.shown_products)
  ? existing.flow_context.buy_flow.shown_products
  : (Array.isArray(existing.shown_options) ? existing.shown_options : []);
```

**What happens:**
- Reads raw array from remote Convex session storage
- Falls back to legacy `shown_options` field if present
- If neither exists: defaults to `[]`
- No validation, no cap, no age check on the contents
- Passed into `session.flow_context.buy_flow.shown_products` for all downstream nodes

**Turn it touches:** Every turn, unconditionally.

---

### 1.2 Where It Is Read (All Nodes)

#### Node 1: Understanding AI (`understanding-ai`)
```
shown_products: Array.isArray($json.session?.flow_context?.buy_flow?.shown_products)
  ? $json.session.flow_context.buy_flow.shown_products.slice(0, 5)
  : [],
```
**Effect:** Injects up to 5 shown products into the LLM prompt as session context.
**Stale risk:** LLM receives old products as "current context". If shown_products is
stale (3 turns old, different topic), the Understanding AI is primed with irrelevant
product context. This affects `reference_resolution` — the AI may resolve references
like "that one" or "the cheaper one" against outdated product IDs.

---

#### Node 2: Rules Layer (`rules-layer`)

Three separate boolean derivations, all reading `shownProducts`:

**Derivation A — `selectedProductExists`:**
```
const selectedProductExists = Boolean(
  resolvedProduct
  || currentInterest
  || shownProducts.length > 0           ← direct dependency
  || lastOfferContext.product_ids.length > 0
);
```

**Derivation B — `hasProductContext`:**
```
const hasProductContext = Boolean(
  resolvedProduct
  || currentInterest
  || shownProducts.length > 0           ← direct dependency
  || hasKnownBudget
  || hasKnownBrand
  || hasKnownModel
);
```

**Derivation C — `hasActiveContext`:**
```
const hasActiveContext = Boolean(
  currentFlow
  || currentTopic
  || shownProducts.length > 0           ← direct dependency
  || currentInterest
  || Object.values(mergedConstraints).some(v => v !== null)
  || session.conversation_history.length > 0
);
```

**Downstream effects of these three flags:**

| Flag | Used In | Effect When True |
|------|---------|-----------------|
| `selectedProductExists` | `currentTurnLikelyFollowUp` (AND condition) | Enables follow-up detection |
| `selectedProductExists` | `anchorMode = 'ambiguous'` (AND condition) | Can trigger clarification mode |
| `hasProductContext` | Buy-flow `computedMissingFields` negation | Suppresses brand_or_model prompt |
| `hasActiveContext` | `shouldContinueContext` (AND condition) | Keeps current flow alive |
| `hasActiveContext` | `reply_mode` for clarification path | Routes to `clarify_reference` vs `handoff_admin` |

**Summary:** A non-empty `shownProducts` keeps `hasActiveContext = true` regardless
of whether the products are relevant. This is the root cause of persistent false
active context after topic drift or broad resets.

---

#### Node 3: Business Data Resolver (`business-data-resolver`)

```
const shownProducts = Array.isArray(session.flow_context?.buy_flow?.shown_products)
  ? session.flow_context.buy_flow.shown_products.map(normalizeProduct).filter(Boolean)
  : [];

const candidateProducts = products.length > 0 ? products : shownProducts;
```

**This is the most dangerous stale-state read point.**

`candidateProducts` is the product pool used for:
- Constraint matching (brand/model/storage/condition filter)
- Budget matching and sorting
- `selectedWithinBudget` selection
- `replyProducts` assembly (what gets sent to the user)
- `selectedProduct` resolution by resolved reference ID

When Product Search API returns zero results (`products.length === 0`), the resolver
**falls back to the old `shownProducts` as the candidate pool**. This means:

> Stale products can silently re-surface in the reply — with no signal to Reply AI
> that these are old, not fresh results.

**Concrete example:**
```
T1: Show iPhone 13 (128GB, 38000 ETB) and iPhone 13 Pro
    → shown_products = [iPhone13-128, iPhone13-Pro]

T3: User: "anything with Samsung around 40000?" → broad search
    Product Search finds no Samsung → returns []
    Business Data Resolver: candidateProducts = shownProducts  ← iPhone 13 data
    Budget constraint: 40000 → iPhone 13 Pro at 39000 matches!
    → Bot shows iPhone 13 Pro to a user who asked for Samsung around 40000
```

Also:
```js
const currentInterest = normalizeProduct(
  session.flow_context?.buy_flow?.current_interest,
  shownProducts.length + 10   ← index offset only, no stale guard
);
```
The `currentInterest` from session is used directly in resolver for anchored matching,
with `shownProducts.length` only as an index offset — not a staleness gate.

---

#### Node 4: Reply AI (`reply-ai`)

Reply AI reads `shown_products` indirectly via the `has_active_context` field:
```
has_active_context: Boolean(
  ($json.session?.conversation_state?.current_flow ?? null)
  || ($json.session?.conversation_state?.current_topic ?? null)
  || (Array.isArray($json.session?.conversation_history) && ...)
  || (Array.isArray($json.session?.flow_context?.buy_flow?.shown_products)
      && $json.session.flow_context.buy_flow.shown_products.length > 0)  ← here
  || $json.session?.flow_context?.buy_flow?.current_interest
),
```

**Effect:** If `shown_products` is non-empty, Reply AI is told `has_active_context = true`.
Per the system prompt rules:
> "If reply_context.has_active_context is true, continue that context instead of
>  asking a generic buying-or-exchange question."

This means Reply AI suppresses its greeting/re-opening behavior and tries to continue
a context that may be completely irrelevant to the current message.

---

### 1.3 Where `shown_products` Is Written / Updated

**Node:** `side-effects` / `Validation`

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

**Written to session as:**
```js
flow_context: {
  buy_flow: {
    shown_products: isStartReset ? [] : shownProducts,
    ...
  },
},
```

**Full truth table of what gets written:**

| Condition | `shown_products` Written |
|-----------|------------------------|
| `isStartReset = true` | `[]` (always cleared) |
| `resolver_output.products.length > 0` | New products (replace) |
| `resolver_output.products.length === 0` AND existing non-empty | **Preserved unchanged** ← stale |
| `resolver_output = null` (no resolver called) | **Preserved unchanged** ← stale |
| `should_call_resolver = false` | **Preserved unchanged** ← stale |

**Key insight:** `shown_products` is preserved (stale) on every turn where:
- The resolver is not called (`should_call_resolver = false`): acknowledgments,
  clarifications, off-topic messages, store-info queries, admin handoffs
- The resolver is called but API returns zero products

There is no time-based expiry. There is no topic-drift clear. The only clearing
mechanism is `/start`.

---

## 2. Dependencies on `shown_products`

### Direct Dependencies

```
shown_products
  ├── selectedProductExists (Rules Layer)
  │     ├── currentTurnLikelyFollowUp  ← gates anchored mode
  │     └── anchorMode = 'ambiguous'   ← condition in ambiguous check
  ├── hasProductContext (Rules Layer)
  │     └── computedMissingFields      ← suppresses brand/model prompting
  ├── hasActiveContext (Rules Layer)
  │     ├── shouldContinueContext      ← keeps flow alive
  │     └── clarify_reference vs handoff_admin routing
  ├── candidateProducts (Business Data Resolver)  ← API fallback pool
  │     ├── selectedProduct            ← what bot anchors on
  │     ├── replyProducts              ← what bot shows user
  │     └── price_range, budget_match
  └── has_active_context (Reply AI prompt)
        └── suppresses greeting, forces context continuation
```

### Indirect Dependencies

```
shown_products → selectedProductExists → [ambiguous] → last_constrained_turn update
shown_products → candidateProducts → replyProducts → nextLastOfferContext (turn_index set)
shown_products → has_active_context → Reply AI behavior
```

The `nextLastOfferContext.turn_index` write path means a stale candidateProducts
match causes `last_offer_context` to be updated with the *current* turn index —
making it appear as if a fresh offer was made this turn when it was actually stale data.
This extends `recentOfferContext` into the next turn.

---

## 3. Risks of Stale State

### Risk A — False `selectedProductExists` (HIGH)

After any product offer, `shownProducts.length > 0` = true for the rest of the
session. Every future turn evaluates `selectedProductExists = true`, regardless of:
- Topic changes
- Time elapsed (turn distance, not wall-clock time)
- Explicit budget resets
- User saying they want something different

This is the primary driver of unwanted `ambiguous` triggering and of `shouldContinueContext`
staying true when it should not.

### Risk B — Stale Products in Reply (HIGH)

`candidateProducts = products.length > 0 ? products : shownProducts`

When any search returns empty (no match), the user's next reply will be answered
using old product data. The bot says nothing about relevance — it simply presents
those products as if they match the current query. No warning, no fallback label.

This is especially dangerous after a broad budget reset where:
1. New budget doesn't match any product → `products = []`
2. Old shown_products become candidates → constraint filtering runs on them
3. If any old product matches the new budget → bot surfaces it as a new result

### Risk C — Reply AI Context Contamination (MEDIUM)

`has_active_context = true` when `shown_products.length > 0`. Reply AI:
- Will not offer a re-opening greeting even when the user has clearly changed topic
- Will try to continue a dead thread
- Will suppress the "what are you looking for?" question even when appropriate

### Risk D — `last_offer_context` Re-Stamping (MEDIUM)

When stale candidateProducts produce a match:
- `replyProducts` is non-empty
- Validation writes `nextLastOfferContext.turn_index = currentTurnIndex`
- `last_offer_context` is now updated to the CURRENT turn with OLD products

On the NEXT turn: `lastOfferTurnDistance = 1` → `recentOfferContext = true`
This re-arms the ambiguous trigger even though the offer was based on stale data.
The cycle becomes self-perpetuating.

### Risk E — Understanding AI Reference Confusion (LOW-MEDIUM)

Up to 5 `shown_products` are injected into Understanding AI. If stale:
- AI may resolve "that one" to an old product ID that no longer applies
- `reference_resolution.resolved_id` will point to a stale product
- Rules Layer will flag `currentTurnHasStructuredProductConstraint = true` (reference resolved)
- Mode is forced to `anchored` — to a product the user no longer cares about

---

## 4. Answering the Specific Questions

### Q1: Is stale `shown_products` the real reason product context can stay falsely active?

**Yes — it is the primary driver, with a secondary amplifier.**

Primary: `shown_products.length > 0` directly sets `hasActiveContext = true`,
`hasProductContext = true`, and `selectedProductExists = true` for the entire session
after the first product offer.

Secondary amplifier: The `candidateProducts` fallback in Business Data Resolver
can silently re-surface stale products in a new context, which then re-stamps
`last_offer_context.turn_index` → re-arming `recentOfferContext` → self-perpetuating loop.

`lastOfferContext.product_ids` is a weaker driver because it IS behind the
`recentOfferContext` time gate (`lastOfferTurnDistance <= 2`). It expires naturally.
But `shown_products` has no expiry at all.

---

### Q2: Should `shown_products` be cleared — and when?

#### On broad reset: **YES**
A broad reset means the user is no longer constrained to any prior products.
Clearing ensures:
- `selectedProductExists` reflects only the NEW broad search results (or nothing)
- `candidateProducts` in the resolver uses only fresh API results
- `hasActiveContext` cannot stay true from stale data
- New shown_products will be populated by the broad search result

**Edge case:** If the broad search returns zero products, clearing `shown_products`
means the resolver has nothing to fall back on. This is the CORRECT behavior —
the bot should say "no match" and ask a follow-up, not present stale irrelevant products.

#### On ambiguous: **NO (preserve for clarification)**
During ambiguous:
- The bot just asked "did you mean X or a new search?"
- `shown_products` is what the user is potentially referencing
- Clearing it now means if they say "yes, that one", the context is already gone
- Understanding AI would also lose the reference pool for the next turn

**The rule:** Clear on broad. Preserve on ambiguous. Anchored already replaces or
inherits correctly depending on resolver results.

#### On topic drift (non-buy flow): **PARTIALLY**
When `intentFlow = 'info'` or `'support'`, `should_call_resolver = true` but
`resolver_output.products` will be empty (info/support flows don't touch product search).
Shown_products is preserved. This is acceptable for 1-2 turns. The risk is only
material if the user stays on non-buy topics for many turns and then sends a short
budget signal — same stale-context problem, lower frequency.

No clearing needed here unless a counter shows > N consecutive non-buy turns.

---

### Q3: Would clearing `shown_products` on broad break legitimate follow-ups?

**No — for the turn immediately following a broad reset, it is safe.**

After a broad search:
- If products ARE found: Validation already replaces `shown_products` with new ones.
  Explicit clearing changes nothing — the result is the same.
- If products are NOT found: The bot replies "no match". There is nothing to follow up
  on product-wise. The user's next message is either a refinement (which will re-search)
  or something else (handled by other modes).

**The only scenario where clearing could hurt:**
If a broad search returns results AND the user wants to ask a quick follow-up about
one of those new products. But since Validation already REPLACES `shown_products` with
the new results when `products.length > 0`, clearing only adds an effect when
`products.length === 0`. In that case there is nothing to follow up on.

**Verdict:** Safe to clear on broad. No legitimate follow-up is broken.

---

### Q4: Is there a safer narrower field for selected-product continuity?

**Yes: `lastOfferContext` (specifically `last_offer_context.product_ids` + turn distance)
is the better field for continuity gating.**

It already has:
- `turn_index`: enables distance calculation → natural time expiry
- `offer_type`: knows if it was single or multi offer
- `product_ids`: up to 3 explicit IDs

The problem is that `selectedProductExists` uses `lastOfferContext.product_ids.length > 0`
WITHOUT the turn distance gate. The distance gate (`recentOfferContext`) is only
applied to the `ambiguous` branch condition.

**Recommended pattern for continuity:**
Instead of `selectedProductExists` relying on `shownProducts.length > 0` (timeless),
it should rely on `recentOfferContext` (time-bounded with the ≤ 2 window):

```
selectedProductExists should be:
  resolvedProduct
  || currentInterest
  || (recentOfferContext && lastOfferContext.product_ids.length > 0)
```

This automatically expires when no product has been offered in the last 2 turns —
the definition of "selected product still in play."

`hasActiveContext` should NOT include `shownProducts.length > 0` at all.
`currentInterest` already covers the single-product anchor case.
`lastOfferContext` + `recentOfferContext` already covers the recent-offer case.

`shownProducts` should remain available to the resolver as a fallback pool
(when the API returns nothing for an anchored search), but it should NOT
feed into any boolean context flags.

---

### Q5: What Is the Smallest Safe Next Change?

**Target: One change in Validation, one change in Rules Layer.**

#### Change 1 — Validation: Clear `shown_products` When `anchorMode === 'broad'` and resolver returns no new products

Currently:
```
const shownProducts = isStartReset
  ? []
  : (resolver_output && resolver_output.products.length > 0
      ? resolver_output.products        ← replaced
      : session.flow_context.buy_flow.shown_products);  ← preserved
```

Proposed behavior (description only):
```
- If isStartReset: clear always (no change)
- If anchorMode === 'broad' AND resolver_output.products.length > 0: replace (no change)
- If anchorMode === 'broad' AND resolver_output.products.length === 0: clear to []
- If anchorMode === 'anchored' OR 'ambiguous' AND resolver_output.products.length === 0:
  preserve (no change — anchored legitimately falls back to old pool)
```

This is a **one-condition addition**. It does not touch the anchored or ambiguous paths.
It does not change any data model fields. It only affects the write path when broad
queries return empty results.

**Scope:** 3-4 lines in one node (Validation / side-effects).

#### Change 2 — Rules Layer: Narrow `selectedProductExists` to Use Time-Gated Signal

Currently:
```js
const selectedProductExists = Boolean(
  resolvedProduct
  || currentInterest
  || shownProducts.length > 0                          ← timeless
  || lastOfferContext.product_ids.length > 0           ← timeless
);
```

Proposed behavior (description only):
```
Replace shownProducts.length > 0 with:
  recentOfferContext && shownProducts.length > 0

Replace lastOfferContext.product_ids.length > 0 with:
  recentOfferContext && lastOfferContext.product_ids.length > 0

Or more precisely, merge into:
  recentOfferContext && (shownProducts.length > 0 || lastOfferContext.product_ids.length > 0)
```

**Effect:** `selectedProductExists` is now false when `lastOfferTurnDistance > 2`
or when the offer turn is unknown — i.e., when the offer is no longer "recent".
The `recentOfferContext` flag already exists in scope when `selectedProductExists` is computed.

**Scope:** 2 lines changed in Rules Layer. No new variables needed.
`recentOfferContext` is already defined at the same scope before `selectedProductExists`.

**Risk:** Very low. This tightens the condition — it can only suppress false-positive
context, never create a false-negative where the user loses a genuinely active product.
The only case where a real product context expires is when 3+ turns have passed since
the last offer — by then, the user has changed subject.

#### Priority Order
1. **Change 2 first** (Rules Layer, `selectedProductExists`): Lowest risk, highest impact.
   Fixes the root input to all three flags (`selectedProductExists`, indirectly `hasProductContext`,
   indirectly ambiguous gating) with a two-line narrowing.

2. **Change 1 second** (Validation, clear on broad+empty): Fixes the `candidateProducts`
   fallback contamination. Slightly more behavior-affecting — do this after Change 2
   is verified stable.

---

## 5. Exact Layer / Node Ownership

| Fix | Node | Node ID | Scope |
|-----|------|---------|-------|
| Narrow `selectedProductExists` to use `recentOfferContext` | Rules Layer | `rules-layer` | 2 lines |
| Clear `shown_products` on broad + zero results | Validation | `side-effects` | 3-4 lines |
| (Optional) Remove `shownProducts.length > 0` from `hasActiveContext` | Rules Layer | `rules-layer` | 1 line |
| (Optional) Remove `shown_products` from `has_active_context` in Reply AI prompt | Reply AI | `reply-ai` | 1 line |

---

## 6. What Must NOT Be Touched

### Do NOT change the `candidateProducts` fallback in Business Data Resolver

```js
const candidateProducts = products.length > 0 ? products : shownProducts;
```

This fallback is **correct for anchored follow-ups** where:
- The user already selected a product
- They are asking a refinement question
- The resolver re-runs but the API returns nothing new
- Using old shown_products lets the resolver re-anchor correctly

The solution to the stale contamination for broad is to ensure shown_products is
already cleared by the time the resolver runs — handled in the Validation fix above.
Do not change the resolver's fallback logic.

### Do NOT remove `shown_products` from the Business Data Resolver pool

The resolve-by-ID path depends on finding a product in candidateProducts:
```js
selectedProduct = candidateProducts.find(p => p.id === resolverInput.resolved_reference.id)
```
If `candidateProducts` is empty and the user says "the first one", the resolver
cannot resolve the reference. `shownProducts` as the pool is correct — just gate it.

### Do NOT change the `recentOfferContext` window (`<= 2`)

This is the calibration point. Changing it would affect both anchored and ambiguous
consistently and would require re-testing all conversation patterns.

### Do NOT touch `currentInterest` clearing logic in Validation

`currentInterest` is a separate, more precise signal from `shown_products`. It was
already reviewed in the main audit. Do not merge or conflate these.

### Do NOT change Session Bootstrap normalization of `shown_products`

Bootstrap correctly reads and passes the raw session data. The fix belongs in
Validation (write path) and Rules Layer (read-interpretation), not in the read path.

---

## 7. Summary Verdict

| Question | Answer |
|----------|--------|
| Is stale `shown_products` the real root cause? | **Yes** — primary driver + secondary amplifier via candidateProducts |
| Should it clear on broad? | **Yes** — when broad returns zero results |
| Should it clear on ambiguous? | **No** — needed for clarification context |
| Does clearing break follow-ups? | **No** — follow-ups are protected by the anchored path |
| Better field for continuity? | **`recentOfferContext` + `lastOfferContext`** (already time-gated) |
| Smallest next change? | Narrow `selectedProductExists` in Rules Layer (2 lines) |
| Biggest risk of not fixing? | Stale products re-surface in broad searches; ambiguous loop re-arms itself |

---

*This report is planning-only. No runtime files were modified.*
