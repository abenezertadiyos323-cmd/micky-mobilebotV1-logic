# Phase 1 — Skeleton

## Purpose
- This phase builds the foundation of the workflow
- It ensures every incoming Telegram message is normalized and linked to a session
- No business logic or AI decisions happen here
- Output must be clean, predictable, and ready for the brain layer

## Nodes Covered
1. Telegram Input
2. Event Normalizer
3. Session Load
4. Session Bootstrap

## Node 1 — Telegram Input

### Type
Telegram Trigger

### Purpose
- Receive incoming messages from Telegram
- Start the workflow execution

### Input
- Raw Telegram update

### Output
- Full Telegram payload (unchanged)

### Required Fields to Extract Later
- message.text
- message.chat.id
- message.from.id
- message.message_id

### Notes
- Do NOT modify data here
- Just pass through

### Test Case
- Send `/start`
- Confirm workflow triggers

---

## Node 2 — Event Normalizer

### Type
Code Node

### Purpose
- Convert Telegram payload into a clean, consistent event object
- Remove Telegram-specific nesting

### Input
- Telegram raw payload from Node 1

### Output (STRICT STRUCTURE)
```json
{
  "event": {
    "event_type": "text_message" | "callback_action" | "start_reset" | "deep_link_start",
    "text": "string",
    "chatId": "string",
    "userId": "string",
    "messageId": "string",
    "timestamp": "number",
    "callback_query": { "data": "string" } | null,
    "deep_link": "string" | null
  }
}
```

### Code Behavior
- Safely read message.text
- Convert chat.id to string
- Convert from.id to string
- Add timestamp (Date.now())
- Handle missing text safely (empty string fallback)
- Detect event_type: `/start` or deep link → start_reset or deep_link_start; callback_query present → callback_action; else → text_message
- Extract callback_query.data if present
- Extract deep_link parameter from /start if present

### Notes
- No AI
- No business logic
- Pure transformation only

### Test Case
- Send "Hi"
- Confirm normalized structure is correct

---

## Node 3 — Session Load

### Type
HTTP Request → Convex HTTP Action

### Purpose
- Load existing session for this user
- Determine if user is new or returning

### Input
- event.userId

### Request
POST to Convex HTTP action endpoint

Body:
```json
{
  "userId": "{{ $json.event.userId }}"
}
```

> **Note**: This is a Convex HTTP action call. The endpoint URL is configured in the n8n credential or environment variable.

### Output
```json
{
  "session": {
    "exists": true|false,
    "data": { ... } | null
  }
}
```

### Notes
- If no session found → exists = false
- Do NOT create session here

### Test Case
- First message → exists = false
- Second message → exists = true

---

## Node 4 — Session Bootstrap

### Type
Code Node

### Purpose
- Ensure a valid session object always exists
- Create default session if not found

### Input
- event
- session (from Node 3)

### Output (STRICT STRUCTURE)

Must align with the v2 session schema defined in `v2_architecture.md`.

```json
{
  "event": { ... },
  "session": {
    "isNew": true|false,
    "session_version": 2,
    "chat_id": "string",
    "seller_id": "string",  // sourced from workflow env/config — not inferred from message
    "language": null,         // Phase 1 must NOT detect language — set by Understanding AI in Phase 2
    "stage": "idle",
    "resolved_flow": "none",
    "tentative_flow": "none",
    "next_action": null,
    "route_recommendation": "stay_exploratory",
    "followup_round": 0,
    "last_asked_key": null,
    "collected_fields": {},
    "missing_information": [],
    "evidence_accumulated": 0,
    "message_history": [],
    "last_understanding_output": null,
    "last_rule_decision": null,
    "last_resolver_output": null,
    "shown_options": [],
    "selected_option": null,
    "ranking_order": [],
    "cheaper_option": null,
    "active_product_id": null,
    "deep_link_context": null,
    "callback_context": null,
    "lead_state": null,
    "notify_state": null,
    "handoff_state": null,
    "recovery_state": null,
    "error_count": 0,
    "updated_at": number
  }
}
```

### Logic
IF session.exists == false:
- create new session with defaults

IF session.exists == true:
- pass existing session.data
- set isNew = false

Always:
- update updatedAt

### Notes
- No AI
- No decisions
- Only session safety
- `seller_id` must be read from n8n workflow env variable (e.g. `SELLER_ID`) — never inferred
- `language` must always default to `null` — Phase 1 must NOT infer language
- Phase 1 must NOT infer business flow, intent, or routing

### Test Case
- New user → isNew = true
- Returning user → isNew = false

---

## Phase 1 Final Output Contract

After Node 4, workflow MUST produce both of these root-level keys — no more, no less. This is the ONLY input allowed into Phase 2.

```json
{
  "event": {
    "event_type": "text_message" | "callback_action" | "start_reset" | "deep_link_start",
    "text": "string",
    "chatId": "string",
    "userId": "string",
    "messageId": "string",
    "timestamp": number,
    "callback_query": { "data": "string" } | null,
    "deep_link": "string" | null
  },
  "session": {
    "isNew": true|false,
    "session_version": 2,
    "chat_id": "string",
    "resolved_flow": "none",
    "tentative_flow": "none",
    "stage": "idle",
    "message_history": [],
    "error_count": 0,
    "updated_at": number
    // ... all other v2 session fields initialized to defaults
  }
}
```

> Phase 2 (Understanding AI) reads `event.text`, `event.event_type`, and `session.message_history` as its primary inputs.

---

## Build Notes
- Build this as a separate workflow (v2)
- Keep old workflow unchanged
- Test each node before moving forward
- Do NOT skip validation
- Ensure output shape is EXACT (no extra fields)
