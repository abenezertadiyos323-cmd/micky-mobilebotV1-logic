# Session Persistence & State Reuse Audit
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**Mode:** Planning / Audit Only — No code changed

---

## STEP 1 — SESSION LOAD

**Inspect M3 Load Convex Session (`Session Load`):**
*   **Fields loaded:** The node makes an HTTP POST payload for Convex and replaces the entire `$json` structure with whatever Convex returns (the `session.data` remote envelope).
*   **Condition forcing fresh session:** None. The node blindly requests the session associated with `userId`/`chatId`.
*   **Reuse behavior:** It always pulls the existing remote session, if one exists.

---

## STEP 2 — SESSION BOOTSTRAP

**Inspect `Session Bootstrap` Reset Logic:**
*   **Fields cleared:** `conversation_state`, `flow_context`, `collected_constraints`, `conversation_history`, `last_offer_context`, `last_constrained_turn`, and `last_asked_key`.
*   **Timing:** They are cleared *by overriding* the populated `session` object inside a ternary operator: `event.event_type === "start_reset" ? { ...session, conversation_history: [], ... } : session;`.
*   **Old data bleed:** Yes. Fields like `exchange_details`, `buy_state`, and `admin_lead` are completely missing from this reset block and bleed downstream verbatim. However, that is the *least* of the problems here as the entire block never triggers (see Failure Path).

---

## STEP 3 — SESSION MERGE LOGIC

**Identify how session merges:**
*   **Preserving old values:** If the ternary evaluated correctly, the destructuring (`...session`) ensures all unmentioned fields survive, while explicitly defined fields (`current_topic: null`) successfully overwrite old values with null.
*   **Override bypass:** Because of the root cause identified below, the reset values *never execute*, leaving the old values to override completely.

---

## STEP 4 — SESSION SAVE

**Inspect X1 Update Convex Session (`Session Save`):**
*   **Exact fields written:** It takes `$item(0).$node['Validation'].json.session_update_payload` and HTTP POSTs the entire object.
*   **Write style:** It sends a **full replacement** of the `session` object back to the database.

---

## STEP 5 — FAILURE PATH

**How this happens:**
1. User sends `/start`.
2. `Event Normalizer` creates `event: { event_type: 'start_reset', text: '/start' }`.
3. `Session Load` (an HTTP node) replaces the entire JSON payload with the Convex backend response. The `event` object is wiped out from the moving JSON.
4. `Session Bootstrap` attempts to recover the lost `event` object using a try/catch block.
5. In the try/catch block, it specifically asks for `$item(0).$node['Session Bootstrap'].json.event`.
6. Since a node cannot reference its own output while it is still executing, this instantly throws an error.
7. The `catch` block fires, hard-setting `event = {}`.
8. The reset ternary evaluates: `if (event.event_type === "start_reset")`. Since `event` is `{}`, `event_type` is undefined. The condition is `false`.
9. The ternary defaults to the old session data, skipping all resets.
10. `Validation` node also receives `event = {}`, meaning `isStartReset = false`, completely skipping the hardcoded `/start` menu string override.
11. The dirty session is fully saved back to Convex, locking the user into their old flow permanently.

---

## FINAL OUTPUT

1. **Exact node causing persistence:** `Session Bootstrap`
2. **Exact field not resetting:** `event.event_type` (which causes all session fields to fail to reset)
3. **Exact merge behavior causing issue:** The ternary operator evaluating whether to zero out the session defaults to the dirty `{ ...session }` branch because the routing signal was dropped.
4. **ONE Root Cause:** A cyclical typo in `Session Bootstrap` targeting its own node (`$node['Session Bootstrap']`) instead of the previous node (`$node['Event Normalizer']`) to recover the dropped `event` object.
5. **One-sentence explanation:** Because the Session Bootstrap node tries to read data from itself before it finishes computing, it catastrophically drops the `event` payload, blinding all downstream nodes to the `/start` signal and forcing the workflow to recycle the previous session context indefinitely.

---
*Note: No logic was modified or proposed. This is strictly a data trace identifying the payload omission.*
