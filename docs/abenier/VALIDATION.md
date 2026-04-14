# VALIDATION — LOCKED SPEC

## 🎯 Purpose

Validation is a **final safety gate before sending a message to the customer**.

It is responsible for:
- verifying Reply AI output is valid
- ensuring `reply_text` exists and is safe to send
- normalizing `reply_text` if needed

It must NOT perform business logic or workflow decisions.

---

## 🧱 Position in Flow

Reply AI
→ Validation
→ Safe To Send
→ Telegram Send
→ Session Save

---

## 📥 Input Contract

Validation MUST receive a clean payload from upstream:

```json
{
  "event": {
    "text": "string",
    "chat_id": "number | string"
  },
  "session": {},
  "rules_output": {},
  "resolver_output": {},
  "reply_text": "string"
}
```

Rules:
- `reply_text` MUST already be extracted from Reply AI output before Validation runs
- `resolver_output` may be an object or `null` depending on workflow path
- Validation MUST NOT parse provider-specific raw model envelopes

---

## 📤 Output Contract

Validation MUST output a stable downstream payload:

```json
{
  "event": {
    "text": "string",
    "chat_id": "number | string"
  },
  "session": {},
  "rules_output": {},
  "resolver_output": {},
  "chat_id": "number | string | null",
  "reply_text": "string",
  "safe_to_send": "boolean",
  "used_fallback": "boolean"
}
```

Rules:
- `reply_text` MUST be the final send-ready text
- `safe_to_send` MUST reflect the final validation result
- `used_fallback` MUST indicate whether Validation replaced the incoming `reply_text`

---

## 🧠 Core Behavior

Validation is responsible for:
- verifying `reply_text` is present and valid
- normalizing `reply_text` into a safe final string
- checking that the message is sendable
- emitting a stable payload for downstream nodes

Validation must validate.
It must not decide workflow.

---

## 🚧 Decision Boundary

Validation MUST NOT:
- decide whether resolver should run
- decide handoff or escalation
- decide the next routing path
- reinterpret business truth
- change `rules_output`
- change `resolver_output`
- create new workflow state

It follows workflow state.
It does not create workflow state.

---

## ✅ Allowed Validation Actions

Validation may:
- trim surrounding whitespace
- normalize line breaks
- reject missing, non-string, or empty `reply_text`
- apply one static neutral fallback reply when required
- set `safe_to_send`
- preserve upstream context fields unchanged

---

## ❌ Forbidden Responsibilities

Validation MUST NOT:
- perform business logic
- perform routing logic
- parse raw provider envelopes such as `choices[0].message.content`
- depend on OpenRouter-specific response structure
- generate business fallback content
- mutate `session`
- append conversation history
- update counters or timestamps
- prepare session-save payloads
- build Telegram transport payloads
- act like Memory Update

---

## 🔎 Reply Text Rule

- Validation MUST read only the clean upstream `reply_text`
- `reply_text` MUST be a string after normalization
- `reply_text` MUST NOT be empty
- `reply_text` MUST be a single customer-facing message
- Validation MUST NOT add business content that was not already decided upstream

---

## 🔒 Fallback Rule

- If `reply_text` is missing, non-string, or empty after normalization, Validation MUST replace it with one static neutral fallback reply
- That fallback reply MUST be generic
- That fallback reply MUST NOT mention product, price, availability, resolver results, or business claims
- Validation MUST NOT generate dynamic fallback wording
- When fallback is used, `used_fallback = true`

---

## 🔒 Send Safety Rule

- `safe_to_send = true` only when:
  - `chat_id` is present
  - final `reply_text` is a non-empty string

- Otherwise:
  - `safe_to_send = false`

- Validation MUST NOT force `safe_to_send = true` when required send data is missing

---

## 🔒 Output Stability Rule

- output shape must remain stable for downstream nodes
- Validation MUST return only the locked validation payload
- Validation MUST NOT leak raw provider output into downstream contract
- Validation MUST NOT add unrelated transport or database fields

---

## ⚠️ Architectural Rules

- Validation is a final safety gate
- Validation is not Reply AI
- Validation is not a Rules Layer
- Validation is not a Resolver
- Validation is not a memory/session mutation layer
- Validation must be provider-agnostic
- Validation must work for both resolver and no-resolver paths

---

## 🚨 Common Anti-Patterns

- parsing OpenRouter response envelopes inside Validation
- depending on `choices[0].message.content`
- depending on provider fields like `output_text` or `text`
- replacing valid replies too aggressively
- generating business fallback replies
- mutating session history inside Validation
- building `session_update_payload`
- building `telegram_payload`
- always setting `safe_to_send = true`

---

## ✅ Completion Criteria

Validation is considered LOCKED when:
- it receives a clean `reply_text`
- it validates and normalizes only
- it does not perform business logic
- it does not perform routing logic
- it does not mutate session or memory
- it does not depend on provider envelope shape
- it produces a stable send-ready payload with `safe_to_send`

---

## 🔒 Chat ID Safety Rule

- If `chat_id` is null, undefined, or missing:
  - Validation MUST set `safe_to_send = false`
  - Validation MUST NOT attempt to send the message downstream
  - Validation MUST NOT fabricate or recover chat_id from other nodes

---

## 🔒 Strict Fallback Definition

- Fallback MUST be a single static neutral message
- Fallback MUST NOT be dynamic
- Fallback MUST NOT include:
  - product names
  - prices
  - availability
  - business-specific claims

- Example fallback style (reference only, not enforced wording):
  - "Sorry, I didn’t understand that clearly. Please try again."

- When fallback is used:
  - `used_fallback = true`

---

## 🔒 Data Isolation Rule

- Validation MUST use ONLY `$json` input
- Validation MUST NOT use:
  - `$node[...]`
  - cross-node references
  - hidden state recovery

- Validation MUST be fully deterministic based only on its direct input payload

---

## 🔒 Upstream Malformed Data Rule

- If `rules_output` is missing or malformed:
  - Validation MUST set `safe_to_send = false`
  - Validation MUST use the static neutral fallback
  - Validation MUST NOT invent or infer missing business/workflow meaning

- If `resolver_output` is missing or malformed:
  - Validation MUST treat it as invalid upstream state
  - Validation MUST set `safe_to_send = false`
  - Validation MUST use the static neutral fallback

---

## 🔒 Strict Send Safety Rule

- If `reply_text` is empty after normalization:
  - `safe_to_send` MUST be `false`

- If `chat_id` is missing, null, or undefined:
  - `safe_to_send` MUST be `false`

- Validation MUST NOT force `safe_to_send = true` when required send data is missing or invalid

---

## 🔒 Absolute Data Isolation Rule

- Validation MUST use ONLY `$json`
- Validation MUST NOT use `$node[...]` under any circumstances
- Validation MUST NOT use any cross-node references
- Validation MUST NOT recover state from hidden or indirect node access

---

## 🔒 Reply Preservation Rule

- If incoming `reply_text` is already valid:
  - Validation MUST preserve it
  - Validation MUST NOT replace it unnecessarily
  - Validation MUST NOT over-normalize it into a different message

- Validation may only replace `reply_text` when it is:
  - missing
  - non-string
  - empty after normalization
  - clearly invalid for sending
