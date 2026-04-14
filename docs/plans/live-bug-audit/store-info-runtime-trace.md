# Store-Info Runtime Trace Audit
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**Mode:** Planning / Audit Only — No code changed

---

## 1. EXACT CONDITION REQUIRED FOR STORE_INFO ROUTING
In the **Rules Layer**, `reply_mode = 'business_resolve'` with `flow = 'info'` is triggered if and only if **ANY** of these four conditions match the Understanding AI's output:
1. `businessIntent === 'store_info'`
2. `understandingTopic === 'store_info'`
3. `understandingTopic === 'location'`
4. `messageFunction === 'info_request'` AND (`businessIntent === null` OR `businessIntent === 'store_info'`)

---

## 2. EXACT CONDITION THAT BLOCKS RESOLVER CALL
The `Rules Layer` will completely bypass the resolver (`should_call_resolver: false`) if an earlier branch fires. This happens if:
*   Confidence is low (`confidence < 0.6`).
*   The message is classified purely as `message_function: 'acknowledgment'` or `message_function: 'clarification'`, which divert to simple responses or admin handoff before the `store_info` branch is ever evaluated.

*Note: If the `store_info` logic specifically is entered, `should_call_resolver: true` is hardcoded. There is no branch where it detects store-info but does not call the resolver.*

---

## 3. EXACT CONDITION THAT CAUSES RESOLVER TO RETURN 'NO_MATCH'
Inside the **Business Data Resolver**, `result_type` is initialized to `'no_match'` by default. 

It explicitly changes to `'store_info'` if: 
`else if (resolverInput.flow === 'info')`

It remains `'no_match'` ONLY if:
1. `resolverInput.flow` is NOT `'info'` (e.g., it is `'buy'`).
2. AND there are 0 matched products.
3. AND it is not an exchange, support, or ambiguity flow.

---

## 4. FULL FAILURE PATH STEP-BY-STEP
How a location request mechanically results in the "address not registered" text:

**Scenario A: The Logic/AI Misclassification Path**
1. User says: "Where is the store?"
2. **Understanding AI** hallucination: classifies as `message_function: "fresh_request"` / `business_intent: "product_search"`.
3. **Rules Layer** missed condition: It skips the `store_info` branch because the AI completely missed the `location`/`info` labels. It routes to the `fresh_request` fallback branch setting `flow = 'buy'`.
4. **Resolver**: Executes `flow: 'buy'`, searches the database, finds 0 matching products.
5. **Resolver Output**: Returns `result_type = 'no_match'`.
6. **Reply AI**: Receives `no_match`. It reads the raw user text ("Where is the store?"), realizes the user wants an address, but has no `store_info` facts. It obeys its honesty directive ("if grounded store-info facts are missing... say the detail is not available here") and outputs: *"የሱቃችን አድራሻ ... አልተመዘገበም... "*

**Scenario B: The Stale Environment Path (Mechanically Proven Last Turn)**
1. User says: "Where is the store?"
2. **Understanding AI** correctly outputs `business_intent: "store_info"`.
3. **Rules Layer** correctly sets `flow = 'info'`.
4. **Resolver (Old Code running in live DB)**: Has no `else if (resolverInput.flow === 'info')` block, so it just skips down and defaults to `result_type = 'no_match'`.
5. **Reply AI**: Receives `no_match` and outputs *"የሱቃችን አድራሻ ... አልተመዘገበም... "* just as above.

---

## 5. SINGLE MOST LIKELY ROOT CAUSE
**Stale Live Deployment (Unsaved Code).** 

While Scenario A (AI misclassification) is technically possible on a turn-by-turn basis, we definitively proved in the `/start` node evaluation that the live bot is completely ignoring your current `workflow.json` code. Therefore, the exact reason `store_info` is not reaching Reply AI right now is that the `else if (resolverInput.flow === 'info')` handler simply does not exist in the code currently spinning inside your production n8n execution environment.

---

### WHAT MUST NOT BE PATCHED YET
*   **Do NOT edit Rules Layer routing:** It is perfectly configured to catch `location`, `info_request`, or `store_info` labels. 
*   **Do NOT edit the Resolver:** The condition for converting `flow: 'info'` into `result_type: 'store_info'` is mathematically flawless.
*   **Do NOT add prompt heavy-handedness to Understanding AI:** The rules and outputs are already clean. Do not bloat it to solve a deployment issue.
