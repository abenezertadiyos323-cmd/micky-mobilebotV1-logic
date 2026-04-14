# Validation Branch Priority Audit — store_info vs visitIntent
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**File read:** 2026-04-03T21:37:54Z (114,927 bytes confirmed)
**Mode:** Planning / Audit Only — No code changed

---

## 1. Exact Claim vs. Actual Current File State

**User's stated problem:** "visitIntent is evaluated before store_info, so store_info path is skipped"

**Actual current file state:**

The `else-if` branch order in Validation is:

```
Position 1:  if (isStartReset)
Position 2:  else if (startBuyAction)
Position 3:  else if (startExchangeAction)
Position 4:  else if (confirmReservationAction)
Position 5:  else if (flowIsExchange)
Position 6:  else if (flow === 'info' && result_type === 'store_info')  ← store_info
Position 7:  else if (!flowIsExchange && visitIntent)                   ← visitIntent
Position 8:  else if (!flowIsExchange && photoRequest)
Position 9:  else if (flowIsBuy && reserveIntent && !confirmReservationAction)
Position 10: else if (flowIsBuy && hasProductReply)
Position 11: else if (flowIsBuy && !reply_text.includes(storeCtaText) && ...)
```

**In the current file, store_info (position 6) is BEFORE visitIntent (position 7).**

The primary `else-if` chain ordering is correct. If `flow === 'info'` AND `result_type === 'store_info'`, the store_info branch wins and visitIntent is never evaluated.

This means: for the file-level code, there is NO direct branch ordering bug.

**However — there is a real conflict, just not where the user described it.**

---

## 2. Exact Root Cause — The `flowIsBuy` and `currentFlowOverride` Contamination

The real conflict is not inside the `else-if` chain. It is in the **pre-chain variable computations** that run before any branch is evaluated:

### Problem A — `flowIsBuy` computed with `visitIntent` as a direct input

```js
const flowIsBuy = startBuyAction
  || confirmReservationAction
  || reserveIntent
  || visitIntent          // ← when visitIntent = true, flowIsBuy = true
  || rules_output.resolver_input?.flow === 'buy'
  || session.conversation_state?.current_flow === 'buy'
  || ['product_search', 'pricing'].includes(understanding_output.business_intent ?? '');
```

When a message triggers `visitIntent = true` (e.g., user says "lemta", "mache lemta", "bota", or any pattern in the regex):
- `flowIsBuy = true`

`flowIsBuy = true` is passed into the **post-chain line-trimmer** and into `closeQuestion`:

```js
const closeQuestion = flowIsBuy && hasProductReply && !pricingFollowUp
  ? 'Do you want to reserve it or come see it in person?'
  : null;
```

For a pure store_info turn, `hasProductReply = false`, so `closeQuestion = null`. **This specific sub-issue is harmless** because it requires `hasProductReply`. Score: ⚠️ low risk.

---

### Problem B — `currentFlowOverride` writes 'buy' into the session when visitIntent fires

This is the actual harmful conflict:

```js
const currentFlowOverride = isStartReset
  ? null
  : (startExchangeAction
      ? 'exchange'
      : (startBuyAction || confirmReservationAction || reserveIntent || visitIntent || flowIsBuy
          ? 'buy'               // ← writes 'buy' if ANY of these is true
          : (flowIsExchange
              ? 'exchange'
              : (rules_output.resolver_input?.flow
                  ?? session.conversation_state?.current_flow
                  ?? null))));
```

**When `visitIntent = true`, `currentFlowOverride = 'buy'` — unconditionally.**

This `currentFlowOverride` is then written to the session:
```js
conversation_state: {
  current_flow: isStartReset ? null : flow,
  ...
}
// where:
const flow = isStartReset ? null : (currentFlowOverride ?? rules_output.resolver_input?.flow ?? ...);
```

**Final effect:** After a store_info turn where `visitIntent = true`:
- Reply is correct: store_info branch fires, correct address text, correct button ✅
- Session is corrupted: `current_flow = 'buy'` written to Convex ❌

On the **next turn**, the session has `current_flow = 'buy'`:
- Rules Layer reads `current_flow = 'buy'`
- `sameFlowIntent = false` (next message is probably different)
- `hasActiveContext = true` (because `currentFlow = 'buy'`)
- `shouldContinueContext` may eval to true for certain message types
- Rules Layer may route the next turn into the buy flow even if user sends another store_info request
- This produces buy-flow replies on turns that are not buy requests → session context corruption cascade

---

### Problem C — The `visitIntent` branch fires for some messages that ARE store_info requests

The `visitIntent` regex:
```js
const visitIntent = /\b(visit|come see|come to the store|come in person|physically|in person|lemta|mache\s+lemta|bota|adrasachin)\b|(?:??|????|??|????|??)/i.test(lowerText);
```

A user can send: `"lemta yimetal? adrasha min new"` (Can I come? What's the address?).

For this:
- `visitIntent = true` (because `lemta` matches)
- Rules Layer correctly sets `flow: info`, `result_type: store_info`
- **But also:** `flowIsBuy = true`, `currentFlowOverride = 'buy'`
- Store_info branch fires correctly (position 6 wins)
- BUT session `current_flow = 'buy'` is saved

The branch order is correct. The side-effect is wrong.

---

### Problem D — The `flowIsExchange` guard position (minor but real)

If `session.conversation_state.current_flow === 'exchange'` (user was in middle of exchange), then:
- `flowIsExchange = true`
- `flowIsExchange` branch at position 5 fires
- store_info branch at position 6 is **never reached**

If a user asks for an address WHILE in an exchange flow, the bot handles it as exchange continuation instead of giving the address. This is a potential UX issue but a separate one from the visitIntent conflict.

---

## 3. Branch Priority Issue — Precise Location

The `else-if` chain ordering is NOT the bug in the current file.

The **exact conflict point** is:

```
Line: const currentFlowOverride = ...
         (... || visitIntent || flowIsBuy
             ? 'buy'                        ← BUG: no exemption for store_info path
             : ...)
```

`currentFlowOverride = 'buy'` is written to the session whenever `visitIntent = true`, regardless of whether the actual turn was handled as `store_info`. This overwrites `current_flow: 'info'` → `current_flow: 'buy'`, corrupting the session state for the next turn.

**Secondary conflict (pre-chain, non-harmful for reply but confusing for admin signals):**

```
Line: const adminType = flowIsExchange ? 'exchange' : (flowIsBuy || ... ? 'buy' : 'general');
Line: const adminStatus = ... (confirmReservationAction || visitIntent || ... ? 'hot' : ...)
Line: const adminIntent = ... (visitIntent ? 'visit_intent' : ...)
```

When `visitIntent = true` on a pure store_info turn, admin signals are classified as `type: 'buy'`, `intent: 'visit_intent'`. The user's request was for an address — not a buy signal. The admin lead is incorrectly marked as a buy lead.

---

## 4. Smallest Safe Fix — Description Only

### Fix Target: `currentFlowOverride` — one condition addition

**Current (incorrect for store_info turns):**
```js
(startBuyAction || confirmReservationAction || reserveIntent || visitIntent || flowIsBuy
    ? 'buy'
    : ...)
```

**Proposed (guard visitIntent's 'buy' override when resolver returned store_info):**
```
// DESCRIPTION ONLY — no code patch

Add a condition:
  const resolverIsStoreInfo = resolver_output?.result_type === 'store_info';

Then in currentFlowOverride:
  ((startBuyAction || confirmReservationAction || reserveIntent || (visitIntent && !resolverIsStoreInfo) || (flowIsBuy && !resolverIsStoreInfo))
      ? 'buy'
      : ...)

Result:
  - When resolver returned store_info, visitIntent no longer forces currentFlowOverride to 'buy'
  - currentFlowOverride falls through to: rules_output.resolver_input?.flow → 'info'
  - Session saves current_flow = 'info' correctly
  - On the next turn, session has correct flow context
```

### Fix Target: `adminType` / `adminStatus` — guard for store_info

**Proposed (description only):**
```
// When resolverIsStoreInfo is true, do not classify this as a buy lead.
// Admin intent should be 'store_info_request', not 'visit_intent'.
// Guard: (visitIntent && !resolverIsStoreInfo) in adminType and adminStatus calculations.
```

These are separate, single-condition additions.

---

## 5. What Must NOT Be Touched

### Do NOT change the `else-if` branch ordering
The current ordering (store_info at position 6, visitIntent at position 7) is correct. The claim that "visitIntent is evaluated before store_info" is not accurate in the current file. Do not invert or rearrange these branches.

### Do NOT remove `visitIntent` from `flowIsBuy`
`flowIsBuy` is used for admin lead tracking and the `buyState.closed` calculation. When a user genuinely says "I want to come visit" in the middle of a buy inquiry, `flowIsBuy = true` is correct. Remove `visitIntent` only from `currentFlowOverride`, not from `flowIsBuy`.

### Do NOT change the `visitIntent` regex
This is a keyword expansion — explicitly out of scope.

### Do NOT remove the `visitIntent` branch at position 7
This branch is the fallback for visit-intent messages that are NOT routed through the store_info resolver path (e.g., a message during a buy flow where the user says "I'll just come in person"). It is a valid use case.

### Do NOT touch the `flowIsExchange` branch or its position
Moving it would risk exchange-flow breakage. It is intentionally high-priority.

### Do NOT change the `else-if` chain condition for store_info
```js
normalizeText(rules_output.resolver_input?.flow) === 'info'
&& resolver_output?.result_type === 'store_info'
```
Both conditions together form the correct guard. Do not weaken it.

---

## 6. Summary Table

| Issue | Where | Impact | Fix |
|-------|-------|--------|-----|
| `else-if` order | CORRECT in current file | None | No change needed |
| `currentFlowOverride = 'buy'` when `visitIntent` fires on store_info turn | `currentFlowOverride` computation | Session `current_flow` corrupted to `'buy'` after store_info replies | Add `&& !resolverIsStoreInfo` guard |
| Admin lead type/intent incorrectly set to `'buy'`/`'visit_intent'` | admin signal computations | Admin panel shows wrong lead type for address requests | Add `&& !resolverIsStoreInfo` guard |
| `flowIsExchange` at position 5 blocks store_info when in exchange flow | `else-if` position 5 | Address requests during exchange flow get exchange reply | Separate issue, out of scope |

---

## 7. Exact Single-Line Change Description (Each Fix)

**Fix 1 — `currentFlowOverride`:**
```
In the condition: (startBuyAction || confirmReservationAction || reserveIntent || visitIntent || flowIsBuy)
Change to:        (startBuyAction || confirmReservationAction || reserveIntent || (visitIntent && !resolverIsStoreInfo) || (flowIsBuy && !resolverIsStoreInfo))
Where:            const resolverIsStoreInfo = resolver_output?.result_type === 'store_info';
```

**Fix 2 — `adminType`:**
```
In: flowIsBuy || priceShown || reserveIntent || visitIntent || startActionSelected ? 'buy' : 'general'
Change visitIntent to: (visitIntent && !resolverIsStoreInfo)
```

**Fix 3 — `adminStatus`:**
```
In: confirmReservationAction || visitIntent || /...buy now.../...
Change visitIntent to: (visitIntent && !resolverIsStoreInfo)
```

**Fix 4 — `adminIntent`:**
```
In: visitIntent ? 'visit_intent' : ...
Change to: (visitIntent && !resolverIsStoreInfo) ? 'visit_intent' : ...
```

All four use the same `resolverIsStoreInfo` boolean — define it once near the top of Validation, reuse everywhere.

---

*This report is planning/audit only. No runtime files were modified.*
