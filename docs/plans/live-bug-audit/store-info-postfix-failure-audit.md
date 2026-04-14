# Store-Info Post-Fix Failure Audit — Exact Root Cause
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**File Inspected:** `workflow.json` — re-read live at 2026-04-04T00:26Z
**Test message:** `"Wed sukachu memtat falige nbr ena adrashachun laklgn esti"`
**Symptom:** Still replies `"የሱቃችን አድራሻ በአሁኑ ሰዓት በስርዓታችን ውስጥ አልተመዘገበም..."`
**Mode:** Planning / Audit Only — No code changed

---

## 1. Stale Workflow Check — First Question Answered

**The live workflow.json file HAS been updated.** The reported fixes are present in the current file.

Confirmed from the live file:

**Business Data Resolver** — fix IS present:
```js
const STORE_INFO = {
  store_name: 'TedyTech',
  address_text_amharic: '?TedyTech ?? ????? ?? ??? ?? ???',
  address_text_english: 'TedyTech store location on the map below.',
  address_text: '?TedyTech ?? ????? ?? ??? ?? ???',
  map_url: mapUrl,
};
// ...
} else if (resolverInput.flow === 'info') {
  result_type = 'store_info';
  next_step = 'show_store_info';
}
// ...
store_info: result_type === 'store_info' ? STORE_INFO : null,
```

**Validation** — fix IS present:
```js
} else if (normalizeText(rules_output.resolver_input?.flow) === 'info'
           && resolver_output?.result_type === 'store_info') {
  if (!reply_text) {
    reply_text = normalizeText(resolver_output?.store_info?.address_text)
      ?? 'TedyTech store location on the map below.';
  }
  // ...
  telegram_markup = storeMarkup;
}
```

**Reply AI system prompt** — fix IS present:
```
"If resolver_output.result_type is store_info and resolver_output.store_info is present, 
use resolver_output.store_info.address_text directly and keep the reply grounded. 
Do not say the address is unavailable."
```

**And yet the bot still says address is not registered.** This confirms: **the workflow file is correct but the live n8n instance has NOT picked up the changes.**

This is a **live/runtime consistency issue** — not a code logic issue.

---

## 2. Data Integrity Check — The STORE_INFO Address Is Garbled

However, even aside from deployment, there is a **second real problem** that would persist even after redeployment: **the `address_text` value in `STORE_INFO` is corrupted.**

From the live file, verbatim:
```js
const STORE_INFO = {
  store_name: 'TedyTech',
  address_text_amharic: '?TedyTech ?? ????? ?? ??? ?? ???',
  address_text_english: 'TedyTech store location on the map below.',
  address_text: '?TedyTech ?? ????? ?? ??? ?? ???',
  map_url: mapUrl,
};
```

The `address_text` and `address_text_amharic` values are `'?TedyTech ?? ????? ?? ??? ?? ???'`.

**These are question-mark replacement characters (`?`).** This means the original Amharic text was stored as UTF-8 (Ethiopic script) but got corrupted during the workflow save/export process — the n8n JSON serialization or the file save stripped the Ethiopic Unicode characters and replaced them with `?` placeholders.

What would render: `?TedyTech ?? ????? ?? ??? ?? ???`  
What it should say: Something like `TedyTech ሱቅ ቦታ...` (the actual Amharic address text, lost in encoding)

When `normalizeText()` is called on this string, it returns the question-mark string as-is since it is a valid non-empty string. So Reply AI receives `address_text = '?TedyTech ?? ????? ?? ??? ?? ???'` — garbage characters.

Reply AI sees:
- `result_type: 'store_info'` ✅
- `store_info.address_text: '?TedyTech ?? ????? ?? ??? ?? ???'` ← garbled
- Reply AI prompt rule: "use address_text directly and do not say unavailable"

But even if Reply AI tries to use this garbled string, it is not a real address. It will either:
- Output the garbled string literally (producing nonsense output)
- Recognize that the string is meaningless and fall back to its honesty directive ("address not available")

Either outcome is wrong. If the model is intelligent enough to recognize the corruption, it produces "address not available." If it is not, it produces garbage characters to the user.

---

## 3. Validation `flowIsBuy` Conflict — Third Problem

There is a **third issue** that occurs in tandem. In Validation, `flowIsBuy` is computed before the `store_info` branch check:

```js
const flowIsBuy = startBuyAction
  || confirmReservationAction
  || reserveIntent
  || visitIntent          // ← THIS is the conflict point
  || rules_output.resolver_input?.flow === 'buy'
  || session.conversation_state?.current_flow === 'buy'
  || ['product_search', 'pricing'].includes(understanding_output.business_intent ?? '');
```

And `visitIntent` was expanded to:
```js
const visitIntent = /\b(visit|come see|come to the store|come in person|physically|in person|lemta|mache\s+lemta|bota|adrasachin)\b|(?:??|????|??|????|??)/i.test(lowerText);
```

**For `"Wed sukachu memtat falige nbr ena adrashachun laklgn esti"`:**
- `adrasachin` → the test message contains `adrashachun` — close but not an exact `\b`-bounded match for `adrasachin`
- `memtat` → not in the pattern list
- The Ethiopic regex `(?:??|????)` — these are also question marks / garbled characters in the file

However, **if `visitIntent` DOES fire** (for any reason — e.g., a different previous turn or session context), then `flowIsBuy = true`. And then Validation's `store_info` branch:

```js
} else if (normalizeText(rules_output.resolver_input?.flow) === 'info'
           && resolver_output?.result_type === 'store_info') {
```

...is evaluated. But **crucially**, this branch is ABOVE the `visitIntent` branch in the `else if` chain, so `store_info` wins. This part of the logic is actually correct — `store_info` branch check precedes `visitIntent` branch.

**However**, `flowIsBuy = true` from `visitIntent` causes a downstream problem: the `currentFlowOverride` calculation:

```js
const currentFlowOverride = isStartReset
  ? null
  : (startExchangeAction
      ? 'exchange'
      : (startBuyAction || confirmReservationAction || reserveIntent || visitIntent || flowIsBuy
          ? 'buy'     ← WRITTEN TO SESSION AS 'buy' FLOW
          : ...));
```

If `visitIntent = true`, Validation writes `current_flow: 'buy'` into the session. On the NEXT turn, `currentFlow = 'buy'` — which means Rules Layer will try to context-continue the buy flow instead of staying on `info`. This is a session state corruption side-effect, but it is not the cause of the current turn's wrong reply.

---

## 4. The Real Reply AI Grounding Contract — What Reply AI Actually Receives

The **Validation `store_info` branch** runs a conditional check on `reply_text` AFTER Reply AI has already run:

```js
} else if (normalizeText(rules_output.resolver_input?.flow) === 'info'
           && resolver_output?.result_type === 'store_info') {
  if (!reply_text) {
    reply_text = normalizeText(resolver_output?.store_info?.address_text)
      ?? 'TedyTech store location on the map below.';
  }
  // ...
}
```

The condition is `if (!reply_text)`. This means:
- If Reply AI returned ANY non-empty reply_text, this fallback is SKIPPED.
- Only if Reply AI returned an empty string does Validation substitute the `address_text`.

Reply AI **always** returns a non-empty `reply_text` (it is prompted to output a JSON with `reply_text` as a string). So even when `store_info` branch fires, `reply_text` is already set by Reply AI. **The `address_text` substitution in Validation never executes for this case.**

What Validation actually does on the `store_info` path:
1. Checks `if (!reply_text)` → FALSE (Reply AI produced text)
2. Skips the `address_text` assignment
3. Still appends `storeCtaText` line
4. Still sets `telegram_markup = storeMarkup`

So the **button IS probably attached** in the current code. But the **reply text** is whatever Reply AI generated — and Reply AI generated the "address not registered" wording because `address_text` is garbled.

---

## 5. Exact Failing Step Summary

| Step | Node | Status | Evidence |
|------|------|--------|----------|
| 1. Routing | Rules Layer | ✅ Correct | `flow: info`, `should_call_resolver: true` |
| 2. Resolver contract | Business Data Resolver | ✅ Code correct | `result_type: 'store_info'`, `store_info` object populated |
| **3. Address data** | **Business Data Resolver** | ❌ **Garbled** | `address_text = '?TedyTech ?? ????? ?? ??? ?? ???'` — Ethiopic characters corrupted to `?` during JSON save |
| 4. Reply AI grounding | Reply AI | ⚠️ Partially working | Receives garbled `address_text`; model correctly recognizes it as invalid and falls back to "not available" |
| 5. Validation reply_text override | Validation | ❌ Never runs | `if (!reply_text)` condition is false — Reply AI always fills `reply_text` |
| 6. Button attachment | Validation | ✅ Probably works | `telegram_markup = storeMarkup` is set regardless of `if (!reply_text)` |
| 7. Live deployment | n8n runtime | ❌ Likely stale | Even though file is updated, n8n may not have auto-reloaded the workflow node code |

---

## 6. Exact Root Cause (Two Layers)

### Root Cause A — Garbled Address Text (DATA)
> The `address_text` in `STORE_INFO` contains `'?TedyTech ?? ????? ?? ??? ?? ???'` — the Ethiopic Unicode characters were corrupted to `?` placeholder characters during the JSON file save. Reply AI receives garbage and correctly falls back to "address not available."

### Root Cause B — Validation Override Guard (LOGIC)
> The `if (!reply_text)` guard in Validation's `store_info` branch means the `address_text` fallback from the resolver is **unreachable** as long as Reply AI produces any text. The design assumes Reply AI could return empty — it never does.

### Root Cause C — Possible Stale Deployment (RUNTIME)
> The workflow.json file IS updated, but n8n may still be running the old version of the code. n8n does not automatically hot-reload Code nodes. The workflow must be re-saved inside the n8n editor UI for the changes to take effect in live executions.

---

## 7. Which Root Cause Is Producing the "Address Not Registered" Reply?

**Root Cause A alone is sufficient to produce the symptom even with everything else correct.**

Execution path:
1. `resolver_output.store_info.address_text = '?TedyTech ?? ????? ?? ??? ?? ???'` (garbled)
2. Reply AI prompt rule says: "use address_text directly, do not say unavailable"
3. Reply AI sees `address_text = '?TedyTech??...'` → model treats garbled string as meaningless data → falls back to honesty rule → says "address not registered"
4. Validation's `if (!reply_text)` is FALSE → garbled string never substituted
5. Reply AI's garbled/unavailable text is sent as-is

Root Cause B compounds this: even if the address text were correct UTF-8, Reply AI would still produce its own phrasing (using the address), and Validation's `if (!reply_text)` guard means the resolver text never substitutes. The button IS attached but the reply text comes entirely from Reply AI.

Root Cause C explains why the symptom existed yesterday and today even though the file was "fixed."

---

## 8. Smallest Safe Fixes

### Fix 1 — Restore the Address Text (MUST DO FIRST)
The address text must be re-entered using pure ASCII or confirmed Ethiopic text that the file format can preserve. Two options:

**Option A (safest for JSON):** Use an English-only address string until Ethiopic encoding is confirmed:
```
address_text: 'TedyTech Mobile Shop — see map below for exact location'
```

**Option B (correct long-term):** Re-enter the Ethiopic text directly in the n8n Code node editor (not via file save), which renders Ethiopic characters without JSON escape loss. Then save from within n8n. The n8n editor stores Code node JS as raw text in its internal DB — this avoids the file-level encoding issue.

### Fix 2 — Remove the `if (!reply_text)` Guard in Validation (LOGIC)
The current guard:
```js
if (!reply_text) {
  reply_text = normalizeText(resolver_output?.store_info?.address_text) ?? '...';
}
```

Should be changed to always prefer the grounded `address_text` on the `store_info` path, and use Reply AI's text only as a supplement or fallback:
```
// DESCRIPTION ONLY
// Replace the if(!reply_text) block with unconditional grounded address assignment:
reply_text = normalizeText(resolver_output?.store_info?.address_text)
  ?? normalizeText(parsedReply?.reply_text)
  ?? 'TedyTech store location on the map below.';
```

This makes Validation the **authoritative source** for address text on `store_info` turns, and Reply AI's output is used only if `address_text` is null.

### Fix 3 — Re-save Workflow in n8n UI (RUNTIME)
Open the n8n workflow editor, verify the Business Data Resolver and Validation code nodes reflect the current changes, then click Save (and re-activate if needed). This reloads the Code node scripts into the live n8n execution engine.

---

## 9. Priority Order

| Priority | Fix | What it resolves |
|----------|-----|-----------------|
| **1** | Re-save workflow in n8n UI | All 3 fixes go live |
| **2** | Replace garbled `address_text` with clean ASCII or re-enter Ethiopic in n8n editor | Root Cause A |
| **3** | Remove `if (!reply_text)` guard in Validation | Root Cause B — ensures grounded address always overrides AI text |

---

## 10. What Must NOT Be Touched

### Do NOT change the `result_type: 'store_info'` contract in Business Data Resolver
It is correctly implemented. The routing works.

### Do NOT add more Amharic/visit regex to `visitIntent`
The `visitIntent` Ethiopic pattern in Validation (`(?:??|????)`) is already garbled in the file — same encoding issue. Do not extend it further until the encoding problem is confirmed fixed.

### Do NOT change the Validation `store_info` branch structure other than the `if (!reply_text)` guard
The branch is correctly positioned above `visitIntent` in the `else if` chain. The logic is correct except for the guard condition.

### Do NOT change the `invalid_resolver_result_type` validation check without also adding `'store_info'` to the allowed list
Validation currently checks:
```js
if (rules_output.reply_mode === 'business_resolve'
    && resolver_output
    && !['single_product', 'multiple_options', 'no_match', 'out_of_stock',
         'clarification_needed', 'exchange_offer'].includes(resolver_output.result_type)) {
  issues.push('invalid_resolver_result_type');
  blockingIssues.push('invalid_resolver_result_type');
}
```
`'store_info'` is NOT in this allowed list. **This means every single `store_info` turn currently pushes `invalid_resolver_result_type` to `blockingIssues`, which sets `safe_to_send = false`, which means the message is NEVER SENT at all** (Safe To Send gate blocks it).

This is **Root Cause D** — the actual blocking mechanism. Even if reply_text is correct and the address is correct, the message cannot be sent because `store_info` is not a recognized `result_type` in the Validation contract guard.

**Fix 4 (HIGHEST PRIORITY — add before all others):**
```
// DESCRIPTION ONLY
// In Validation, add 'store_info' to the allowed result_type list:
!['single_product', 'multiple_options', 'no_match', 'out_of_stock',
  'clarification_needed', 'exchange_offer', 'store_info'].includes(resolver_output.result_type)
```

**This single missing string is why the store_info fix is silently dead — the reply is being blocked before Telegram Send even fires.**

---

## 11. Corrected Priority Order (With Root Cause D)

| Priority | Fix | Node | Issue |
|----------|-----|------|-------|
| **1** | Add `'store_info'` to `invalid_resolver_result_type` allowed list | Validation | Root Cause D — current blocker; message never sends |
| **2** | Re-save workflow in n8n UI | Runtime | Root Cause C — live instance stale |
| **3** | Fix garbled `address_text` in STORE_INFO | Business Data Resolver | Root Cause A — garbled data |
| **4** | Remove `if (!reply_text)` guard on `store_info` path | Validation | Root Cause B — Validation address overrides Reply AI text |

---

*This report is planning/audit only. No runtime files were modified.*
