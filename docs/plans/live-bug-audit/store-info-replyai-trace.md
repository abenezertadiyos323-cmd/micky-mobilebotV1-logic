# Store-Info Reply AI Data Trace
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**Mode:** Planning / Audit Only — No code changed

---

## STEP 1 — RESOLVER OUTPUT

1. **Exact structure of `resolver_output` sent to Reply AI:**
   The `Business Data Resolver` passes an object containing: `result_mode`, `result_type`, `products`, `exchange_context`, `store_info`, `next_step`, `anchor_mode`, `search_scope`, `anchor_evidence`, and `facts_for_reply`.
2. **Does it always include `result_type` and `store_info`?**
   In the current file code, yes. The keys are always present.
3. **Under what condition is `store_info` missing or null?**
   `store_info` is explicitly set to `null` if `result_type !== 'store_info'`. If the executing node is stale, the `store_info` key might be entirely absent.

---

## STEP 2 — REPLY AI INPUT

1. **Exact fields included in the prompt input:**
   The JSON injected into the `user` message role contains: `customer_text`, `understanding_output`, `rules_output`, `resolver_output`, `reply_context`, `last_messages`, and `client_config`.
2. **Is `resolver_output.store_info` actually injected into the prompt?**
   Yes. The entire `$json.resolver_output` object is stringified and passed in.
3. **Is `address_text` visible inside the prompt input?**
   Yes, but *only* if it exists inside the `resolver_output.store_info` or `resolver_output.facts_for_reply` objects passed from the previous node.

---

## STEP 3 — PROMPT LOGIC

1. **What condition triggers the "address not available" message?**
   The Reply AI System Prompt contains this exact rule:
   `"If grounded store-info facts are missing, do not invent address, location, hours, or contact details. Say briefly that the exact store detail is not available here right now."`
2. **Does that condition check absence of `store_info` OR absence of `address_text`?**
   It checks the absence of grounded facts (i.e., it checks if `resolver_output.store_info` is missing or null).
3. **Could that condition trigger even when `store_info` exists?**
   If `store_info` existed but contained garbled characters (like the encoding issue identified in earlier audits) or empty values, the AI might treat the facts as "missing" or invalid and still trigger the fallback. But if a valid ASCII string arrives, this condition will not trigger.

---

## STEP 4 — FAILURE IDENTIFICATION

**Final Root Cause:**  
**A. store_info never reaches Reply AI**

**ONE sentence explanation of failure:**  
Because the live n8n instance is running stale code, the Business Data Resolver fails to populate and send the `store_info` object, forcing Reply AI to fallback to its "facts are missing" instruction.

---
*Note: No logic was modified or proposed. This is strictly a data trace identifying the payload omission.*
