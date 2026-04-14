# Codex Prompt — Sync workflow.json to Live n8n Instance

Paste this directly into Codex:

---

## Context

I have a Telegram sales bot running on n8n. The workflow file `workflow.json` contains the correct, updated logic for handling store location/address requests (`store_info` routing). However, the live n8n instance is still running OLD code from its internal database. The file was edited locally but never synced back into n8n.

The bot currently replies with "የሱቃችን ትክክለኛ አድራሻ በአሁኑ ሰዓት እዚህ አልተመዘገበም" (address not registered) because the live code nodes don't have the store_info logic.

## Root Cause

Three code nodes in the live n8n workflow are stale — they do not contain the updated JavaScript that exists in workflow.json:

1. **Rules Layer** — missing the `isStoreInfoTurn` variable and the `store_info` routing branch that sets `flow: 'info'` and `should_call_resolver: true`
2. **Business Data Resolver** — missing the `else if (resolverInput.flow === 'info')` handler that returns `result_type: 'store_info'` with the `STORE_INFO` object
3. **Validation** — missing the `resolverIsStoreInfo` guard, the `store_info` whitelist entry, and the `store_info` branch that prefers grounded `address_text` and attaches `storeMarkup`

Because all three are stale, the resolver returns `no_match`, Reply AI receives no store facts, and its honesty directive generates "address not registered."

## Task

Use the n8n API to update the live workflow so that it matches the current `workflow.json` file exactly.

### Option A — Full Workflow Import (Recommended)

Use the n8n REST API to import/update the entire workflow from `workflow.json`:

```
PUT /api/v1/workflows/{workflowId}
Content-Type: application/json
Authorization: Bearer {N8N_API_KEY}

Body: contents of workflow.json
```

The workflow ID can be found by listing workflows:
```
GET /api/v1/workflows
```

Look for the workflow named "Abenier Bot Logic Base".

After updating, activate the workflow if it's not already active:
```
PATCH /api/v1/workflows/{workflowId}
Body: { "active": true }
```

### Option B — Node-by-Node Update

If full import is not possible, update only the three stale code nodes by their IDs:

| Node Name | Node ID | What changed |
|-----------|---------|-------------|
| Rules Layer | `rules-layer` | Added `isStoreInfoTurn` detection and `store_info` routing branch |
| Business Data Resolver | `business-data-resolver` | Added `flow === 'info'` → `result_type: 'store_info'` with `STORE_INFO` object |
| Validation | `side-effects` | Added `resolverIsStoreInfo` guard, `store_info` whitelist, grounded address branch |

Use:
```
PATCH /api/v1/workflows/{workflowId}
Body: { "nodes": [ ...updated nodes from workflow.json... ] }
```

### What NOT to change

- Do NOT modify the Understanding AI node or its prompt
- Do NOT modify the Reply AI node or its prompt  
- Do NOT change the webhook configuration or Telegram credentials
- Do NOT change the Convex session endpoints
- Do NOT add keyword workarounds or regex patches

### Verification

After syncing, send this test message to the Telegram bot:
```
Wed sukachu memtat falige nbr ena adrashachun laklgn esti
```

Expected behavior:
- Bot replies with location text (NOT "address not registered")
- Bot attaches a "Visit Store" inline button linking to Google Maps
- No "አልተመዘገበም" in the reply

Also test `/start`:
- Bot should reply with exactly: "እንኳን ወደ TedyTech በደህና መጡ።\nBuy phone ወይም Exchange phone ይምረጡ።"
- Bot should show Buy phone / Exchange phone inline buttons
- Bot should NOT mention any previously discussed phone

### Environment

- n8n API base URL: check your n8n instance configuration
- API key: check your n8n credentials/environment
- Workflow file: `workflow.json` in the project root

---
