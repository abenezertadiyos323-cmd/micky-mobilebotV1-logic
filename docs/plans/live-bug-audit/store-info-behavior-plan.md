# Store-Info Context Preservation Behavior Plan
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**Mode:** Planning / Audit Only — No code changed

---

## 1. Recommended Behavior Model: "Stateless Detour"

The core behavior model for a location or address request should be a **Stateless Detour**. 

When a user asks "where is the store?" or "how do I come?", this is rarely a completely new business goal. It is almost always a logistical question asked *in the service* of an ongoing goal (usually buying). 

Therefore, answering the location request should deliver the facts without destructively overwriting the session's active flow state.
*   **If user is browsing phones → asks for address → bot gives address.**
*   **Next turn:** The bot should still consider the user to be in the "buy" flow, looking at the last phone discussed.

---

## 2. How Next-Turn Context Should Work After Location Reply

**After a location reply, the next turn should inherit:**
1.  `current_flow`: Should immediately inherit whatever it was *before* the location query (e.g., `buy`), rather than being permanently set to `info`.
2.  `last_topic`: Can safely be `location` or `store_info`, but the macroscopic `current_flow` acts as the anchor.
3.  `conversation_history`: Natural rolling history preserves the string context of what product was asked about.
4.  `flow_context.buy_flow.current_interest`: Remains untouched, so if the user says "Okay, is it available in black?", the bot knows what "it" refers to.

---

## 3. When Conversation History Should Be Preserved

Conversation history should be **always preserved** through a store-info detour. 
Right now, the bot's `conversation_history` array stores the last 12 messages. This works perfectly. 

The real danger is **State Corruption**, where the `Rules Layer` overwrites `session.conversation_state.current_flow` to `'info'`, causing the bot to forget it was selling a phone. 

---

## 4. When the Bot Should Switch to a New Topic

The bot should only switch flows/drop the buy context when:
1.  The user sends an explicit `/start` reset.
2.  The Understanding AI classifies the message as a `fresh_request` with a totally different `business_intent` (e.g., jumping to an `exchange` or `support` question).
3.  The user hasn't messaged in a very long time (though session limits aren't inherently managed by logic here).

A store-info request is categorized as `info_request/store_info`, which is currently treated as a hard state overwrite if `shouldContinueContext` is false.

---

## 5. Best Layer to Own This Decision

**The Rules Layer.**

Specifically, the `session_update` logic block inside the `Rules Layer` for the `store_info` branch. 
*   **Understanding AI:** Correctly identifies the intent (`store_info`).
*   **Rules Layer:** Formulates the Next-Turn State. This is where the context-kill happens.
*   **Validation:** Appends the UI presentation (already planned).

---

## 6. Smallest Safe Implementation Plan

The fix is entirely isolated to one ternary operator in the `Rules Layer`'s `store_info` branch.

**Current (Destructive):**
```javascript
} else if (businessIntent === 'store_info' || understandingTopic === 'store_info' ... ) {
  rules_output = {
    // ...
    session_update: {
      // ...
      flow_stage: shouldContinueContext ? (currentFlow ?? null) : 'info', 
      // BUG: shouldContinueContext is often false for generic info_requests, 
      // destroying currentFlow and forcing 'info'
    },
  };
```

**Proposed Safe Fix:**
Change the `flow_stage` assignment so it always weakly defaults to preserving the `currentFlow`, treating `info` strictly as a fallback for fresh sessions:
```javascript
// DESCRIPTION ONLY:
flow_stage: currentFlow ?? 'info',
```

**Effect:**
If `current_flow` was `buy`, it stays `buy`. The address is served because the resolver is intentionally fed `flow: 'info'` on the *current* turn (`resolver_input: { flow: 'info' }`), but the *next* turn's state (`session_update.flow_stage`) remains safely anchored to `buy`.

---

## 7. What Must NOT Be Touched

*   **Understanding AI:** It is already correctly labeling location requests. Don't force it to invent mixed intents.
*   **Business Data Resolver:** Let it keep returning `result_type: 'store_info'`.
*   **Validation Node Appends:** The CTA plan from previous steps remains 100% valid. Handing out the address works; we just need to ensure the rules layer doesn't panic and forget the sales context afterward. 
*   **Reply AI System Prompt:** Do not try to solve context preservation by adding heavy rules to the AI prompt. Fast, deterministic node state management keeps the flow from shifting unpredictably.
