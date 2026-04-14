# Live Execution Trace Plan: Proving the Deployment Mismatch
**Project:** Abenier Bot Logic (TedyTech Telegram Sales Bot)
**Mode:** Planning / Audit Only — No code changed

---

## 1. Logical Impossibility Confirmation

Based on the current `workflow.json` file, the live bot's behavior is **mechanically impossible**:

**1. The `/start` mixed reply:**
*   **Live symptom:** "እንኳን ወደ TedyTech በደህና መጡ። የሱቃችን አድራሻ ... አልተመዘገበም..." (Welcome + address unavailable)
*   **File truth:** Impossible. The file contains a hard-override at the top of the Validation `else-if` chain: `if (isStartReset) { reply_text = 'እንኳን ወደ ...'; }`. This guarantees the exact hardcoded string is sent, completely overwriting whatever Reply AI generated. The live output proves this `if` block did not execute.

**2. The address-unavailable reply:**
*   **Live symptom:** "የሱቃችን አድራሻ ... አልተመዘገበም..."
*   **File truth:** Impossible. The file's Business Data Resolver returns `result_type: 'store_info'` and an ASCII `address_text`. The Validation node specifically intercepts `store_info` and sets `reply_text = groundedStoreInfoText`. The live output phrasing is Reply AI's standard hallucination guard when it receives a `no_match` response for an address query. 

**Conclusion:** The live webhook is executing older logic.

---

## 2. Live Execution Trace Plan

To prove this without guessing, you must inspect the raw execution data inside the live n8n instance.

1.  Open your browser and log in to your **live n8n dashboard**.
2.  Send a test message to the bot on Telegram (e.g., `/start` or `"Wed sukachu memtat falige..."`).
3.  In n8n, navigate to the **Executions** tab for the active workflow.
4.  Click on the most recent "Success" execution that corresponds to your test message.
5.  The execution view maps the exact data flowing through each node at runtime.

---

## 3. Validation Node Check

Click on the **Validation** (Side-Effects) node in the execution graph and check its executed code and input data.

**Signals proving the node is running OLD code:**
*   **Missing Override:** Look at the `else-if` chain in the code editor window. If `if (isStartReset)` is missing from the top, it's stale code.
*   **Missing Whitelist:** Check the `invalid_resolver_result_type` check block. If `'store_info'` is missing from the allowed array, it's stale code.
*   **Missing Grounded Logic:** If the `} else if (normalizeText(rules_output.resolver_input?.flow) === 'info' && resolver_output?.result_type === 'store_info') {` branch is missing, it's stale code.

---

## 4. Resolver Check

Click on the **Business Data Resolver** node in the execution graph and check the `Output Data` (JSON payload) it passed down the line.

**Values proving the new logic is NOT active:**
*   Check the root JSON data object.
*   Is `result_type === "no_match"` instead of `"store_info"`?
*   Is the `store_info` object completely missing from the `resolver_output` payload?
*   (If you sent an address request and the answer to both is yes, the resolver is running old code).

---

## 5. Webhook / Workflow Check 

If the Executions panel reveals old code is running, the mismatch is caused by one of these infrastructure issues:

1.  **Unsaved Editor State:** You imported or edited the workflow locally or in a dev environment, but never pasted the updated code blocks into the production n8n UI, or never clicked the global "Save" button in the active n8n instance.
2.  **Inactive vs Active Workflow:** You might be editing a Draft/Inactive workflow in the n8n UI, while the Webhook is tied to a different, Active workflow ID.
3.  **Duplicate Versions:** You might have two workflows with the same Telegram credentials. The older one is intercepting the webhook events before the newer one sees them.

---

## 6. ONE Single Proof Action

**Open Executions → click Validation node → read the code in the editor view to see if `if (isStartReset)` exists.**

If it doesn't exist, you know with 100% certainty you are looking at stale deployment code.

---

## 7. What Must NOT Be Changed Yet
*   **Do NOT edit `workflow.json`.** The logic in the file is already correct.
*   **Do NOT propose new JavaScript logic fixes.** You cannot fix a stale deployment by writing more code in a disconnected JSON file. 
*   **Do NOT touch Understanding AI or the routing prompts.** This is purely an environment sync issue.
