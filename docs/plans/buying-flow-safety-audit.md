# Safety Audit — Buying Flow Post-Price Continuation
> **Purpose:** Pre-implementation safety verification only. No code changes.
> **Reference:** `buying-flow-close-and-exchange-handoff.md`
> **Date:** 2026-04-05

---

## 1. Safety Verdict

**NOT SAFE YET**

---

## 2. Verified Findings

### 2.1 — `ram` is NOT in the product search return ✅ CONFIRMED GAP
**Source:** `convex/products.ts` lines 66–80

The `.map()` return in `searchBySeller` explicitly lists these fields:
```
_id, sellerId, brand, model, phoneType, price, stockQuantity,
storage, condition, exchangeEnabled, images
```
`ram` is NOT in this return map.

**However:** `ram` IS used in `buildSearchText` (line 41) for filtering purposes. Meaning `ram` exists as a field in the raw product document and is already read by the DB layer — it is simply not mapped into the HTTP response.

**Risk level:** HIGH. Any "more details" or exchange estimation that depends on RAM for Samsung devices will silently receive `null` from the resolver.

---

### 2.2 — `battery_health` is NOT in the product search return ✅ CONFIRMED GAP
**Source:** `convex/products.ts` lines 66–80

`battery_health` does NOT appear in the search return map.

**Unlike `ram`:** `battery_health` is also NOT in `buildSearchText` (lines 33–46). It is not read anywhere in `products.ts` from the raw document at all.

**This means:** It is unknown whether any product records in the Convex `products` table even store a `battery_health` field. The code provides zero evidence either way for target phone records.

**Risk level:** CRITICAL for iPhone more-details flow. Cannot be verified from workspace code alone — requires a live data query or manual Convex dashboard check.

---

### 2.3 — `current_interest` persistence logic ✅ VERIFIED WITH CAVEAT
**Source:** `tmp_nodes_dump.md` lines 1827–1833 (Validation node, session update block)

```javascript
const currentInterest = isStartReset
  ? null
  : (resolverProducts.length === 1
      ? resolverProducts[0]
      : (anchorMode === 'anchored'
          ? (rules_output.resolver_input?.resolved_reference?.raw
              ?? session.flow_context?.buy_flow?.current_interest ?? null)
          : null));
```

**What this means (verified):**
- `current_interest` is set to the single product when exactly one product is returned by the resolver.
- `current_interest` is preserved from the previous session only when `anchorMode === 'anchored'` on the next turn.
- When `anchorMode === 'broad'` (which happens on fresh/new phone requests), `current_interest` is set to `null` — **it is cleared**.

**The caveat (risk):**
If a customer asks "price of iPhone 13", gets a price (current_interest set ✅), then asks "tell me more" or "I want to exchange" in the NEXT message — the next turn's anchor mode determination matters critically.

From Rules Layer analysis (lines 768–772 in nodes dump): anchor mode is `'anchored'` only if the current turn contains a structured product constraint (phone type, brand, storage, RAM) OR it is a likely follow-up. A message like "tell me more" or "I want to exchange" has no structured product constraint and will depend on `currentTurnLikelyFollowUp`. That flag requires `recentOfferContext` (offer within 2 turns) AND `selectedProductExists` AND short message AND no new phone type — all of which should hold for "I want to exchange" type messages.

**Therefore: `current_interest` persists ONLY if the post-price message qualifies as `currentTurnLikelyFollowUp`. This is not guaranteed for all exchange-entry phrases.**

---

### 2.4 — `exchange_details.*` population logic ✅ VERIFIED
**Source:** `tmp_nodes_dump.md` lines 1600–1635 (Validation node)

Exchange fields are populated in the Validation node (not in the Resolver or Rules Layer). The logic is:

```javascript
// brand: reads session first, then detects from raw event text
exchangeBrand = existingExchangeDetails.brand ?? (iphone regex | samsung regex from lowerText)

// model: reads session first, then detects from event text, then falls back to currentInterestModel
exchangeModel = existingExchangeDetails.model ?? detectPhoneModel(eventText) ?? currentInterestModel

// storage: reads session first, then detects from event text, then falls back to currentInterestStorage
exchangeStorage = existingExchangeDetails.storage ?? detectStorage(eventText) ?? currentInterestStorage

// battery_health: reads session first, then regex detects from event text
exchangeBatteryHealth = existingExchangeDetails.battery_health ?? detectBatteryHealth(eventText)

// ram: reads session first, then regex detects from event text
exchangeRam = existingExchangeDetails.ram ?? detectRam(eventText)
```

**Confirmed working behavior:**
- Fields are accumulated from session across turns ✅
- Session-persisted fields take priority over re-detection ✅
- Fields detected from current event text are saved if session fields are null ✅

**Confirmed problem:**
- `exchangeBrand` fallback uses a simple regex: only `iphone` → "iPhone" or `samsung` → "Samsung".
- Any other brand (Pixel, Redmi, Tecno, etc.) will leave `exchangeBrand = null` if not in session.
- When `exchangeBrand` is null, `exchangeDetailsComplete` falls into the generic path (model + any one of storage/condition/price) — which is weaker than the iPhone/Samsung logic.

---

### 2.5 — What sets `details_complete = true` ✅ VERIFIED
**Source:** `tmp_nodes_dump.md` lines 1619–1623 (Validation node)

```javascript
const exchangeDetailsComplete = exchangeBrand === 'iPhone'
  ? Boolean(exchangeModel && exchangeStorage && exchangeBatteryHealth)
  : (exchangeBrand === 'Samsung'
      ? Boolean(exchangeModel && exchangeStorage && exchangeRam)
      : Boolean(exchangeModel && (exchangeStorage || exchangeCondition || exchangeExpectedPriceEtb)));
```

**Verified facts:**
- `details_complete` is set in the **Validation node** (not the Resolver or Business Data Resolver).
- For iPhone: requires `model + storage + battery_health` ✅ Matches the plan's intent.
- For Samsung: requires `model + storage + ram` ✅ Matches the plan's intent.
- For other brands: only requires `model + (storage OR condition OR price)` — a weaker bar.
- This is computed fresh every turn from current + session-persisted fields.
- The value is saved to session via `updatedSession.exchange_details.details_complete` ✅

**Important side effect found:**
Line 1638:
```javascript
const buyState = {
  closed: confirmReservationAction || visitIntent || exchangeDetailsComplete,
  ...
```
**`exchangeDetailsComplete = true` sets `buy_state.closed = true` automatically.** This means as soon as exchange details are complete, the buy state closes. This is expected behavior but must not be broken by any changes to the exchange collection logic.

---

### 2.6 — Resolver/Reply-layer change safety ✅ PARTIALLY VERIFIED
**Source:** Validation node lines 1802–1804 (contract enforcement)

The Validation node enforces that `resolver_output.result_type` must be one of:
```
'single_product' | 'multiple_options' | 'no_match' | 'out_of_stock' |
'clarification_needed' | 'exchange_offer' | 'store_info'
```
Any new `result_type` value added to the resolver output **would fail Validation's contract check** and push a `blocking_issue: 'invalid_resolver_result_type'`, preventing message send.

**This is a critical constraint.** The plan's proposed `post_price_mode` field can be safely added as an additional field alongside existing fields. But any new `result_type` value (e.g., a hypothetical `'price_shown_continuation'`) would break the Validation node's whitelist check.

---

## 3. Unverified Items

| Item | Why Unverified |
|---|---|
| Whether any iPhone product records in the Convex `products` table contain a `battery_health` field at all | `battery_health` is not referenced anywhere in `products.ts`. Convex login is required to query live data. Cannot be determined from workspace code alone. |
| Whether `currentTurnLikelyFollowUp` is true for typical post-price exchange-entry messages (e.g., "I want to exchange", "ልውውጥ") | Depends on runtime anchor evidence values. Not testable without live execution trace. |
| Whether `ram` data exists in the raw product documents stored in Convex (it IS in the search text filter, suggesting it exists in some records, but prevalence is unknown) | Requires live Convex data query. |
| Whether the exchange flow correctly distinguishes "customer's current phone" brand from "target phone" brand when both appear in the same session context | The Validation node's `exchangeBrand` detection uses the current event text — it could theoretically pick up the target phone's brand rather than the exchange phone's brand in edge cases. Not confirmed as a bug, but not confirmed safe either. |

---

## 4. Blocking Risks Before Implementation

### BLOCK 1 — `battery_health` data existence is unknown
**Severity: CRITICAL**
Before adding `battery_health` to the product search response, we must confirm it exists in actual iPhone product records. If the field is absent from all records, exposing it in the API will always return `null` — but more dangerously, any Reply AI logic that keys off `battery_health` being non-null will behave incorrectly for all iPhones.

**Cannot proceed safely without:** Live data verification of iPhone product records.

### BLOCK 2 — Validation node contract whitelist will reject new resolver `result_type` values
**Severity: HIGH**
The Validation node (lines 1802–1804) has a hardcoded whitelist of valid `result_type` values. If the Copilot implementation adds a new `result_type` for post-price continuation (e.g., `'post_price_continuation'`), the Validation node will block every affected message.

**Resolution before Copilot:** Either (a) confirm the plan will NOT add new `result_type` values, or (b) plan the Validation node whitelist update as part of the same implementation batch.

### BLOCK 3 — `current_interest` persistence depends on `anchorMode === 'anchored'`
**Severity: MEDIUM**
The target phone is preserved in the next turn only if the Rules Layer correctly sets `anchorMode = 'anchored'` for exchange-entry messages. Short vague messages like "ልውውጥ" (exchange) may qualify, but this has not been confirmed via live execution. If anchor mode is `'broad'`, `current_interest` is cleared — and the exchange flow loses the target phone context silently.

**Resolution before Copilot:** Either trace one live execution of a post-price exchange-entry message to confirm anchor mode, or add an explicit guard in the Resolver to read `session.flow_context.buy_flow.current_interest` directly as a fallback when starting exchange flow (independent of anchor mode).

### BLOCK 4 — `exchangeDetailsComplete` triggers `buy_state.closed = true`
**Severity: LOW but must be acknowledged**
Any modification to the exchange field collection logic that causes `details_complete` to become `true` earlier than expected will close `buy_state` prematurely. Implementation must match the exact completion criteria in the Validation node, or update both atomically.

---

## 5. Minimum Next Action

**Run one more audit — specifically a live Convex data check.**

Do NOT go to Copilot yet. The single highest-value unblocking step is:

> Query the live Convex `products` table (ownDev deployment) and retrieve 3–5 iPhone records to check what fields are actually stored on them — specifically whether `battery_health` and `ram` are present as document fields.

This single query resolves Block 1 and partially resolves the `ram` uncertainty, which together account for the most critical data gaps identified in the plan.

After that one query, confirm Block 2 (Validation whitelist intent) and Block 3 (anchor mode), and the audit can be closed.

---

## 6. Follow-Up Audit Prompt (for next step if needed)

Paste this verbatim as the next prompt:

---

```
Continue from the current workspace.

We are NOT implementing yet.
We are doing ONE focused data verification only.

GOAL:
Verify the contents of actual product records in the live Convex `products` table.

STRICT SCOPE:
1. Query the ownDev Convex deployment for the `products` table.
2. Retrieve at minimum 3 iPhone product records and 3 Samsung product records (or as many as available).
3. For each record, report EXACTLY which fields are present on the raw document:
   - Does `battery_health` exist as a field? What value? (null / a string / absent entirely?)
   - Does `ram` exist as a field? What value? (null / a string / absent entirely?)
   - Does `storage` exist? What value?
   - Does `condition` exist? What value?
   - Does `model` exist? What value?
   - Does `brand` exist? What value?
4. Report the exact raw structure of each sampled record (truncated if necessary).

DO NOT:
- Make any code changes.
- Make any schema changes.
- Redesign anything.
- Draw conclusions about implementation.
- Only verify and report the raw data.

OUTPUT FORMAT:
## iPhone records found (N)
List field presence for each sample record.

## Samsung records found (N)
List field presence for each sample record.

## key findings
- battery_health: PRESENT/ABSENT/PARTIAL
- ram: PRESENT/ABSENT/PARTIAL
- Any other unexpected gaps

## Verdict
SAFE TO PROCEED or STILL BLOCKED on data gaps.
```
