# REPLY AI — LOCKED SPEC

## 🎯 Responsibility

Reply AI is a **wording-only renderer**.

It is responsible for:
- turning structured workflow state into a short natural customer-facing reply
- following the already-decided `rules_output`
- using `resolver_output` only as grounded truth when available

It must NOT make workflow decisions.

---

## 🧱 Position in Flow

Resolver path:
Should Resolve? (IF)
→ Product Search
→ Business Data Resolver
→ Reply AI
→ Validation

No-resolver path:
Should Resolve? (IF = false)
→ Set No-Resolver Output
→ Reply AI
→ Validation

---

## 📥 Input Contract

Reply AI receives a stable payload with:

```json
{
  "event": {
    "text": "string",
    "event_type": "string | null",
    "chat_id": "number | string | null"
  },
  "session": {},
  "client_config": {},
  "understanding_output": {
    "message_function": "string",
    "confidence": "number",
    "ambiguity": "number"
  },
  "rules_output": {
    "should_call_resolver": "boolean",
    "reply_mode": "string",
    "handoff_needed": "boolean",
    "next_action": "string",
    "confidence": "number"
  },
  "resolver_output": null
}
```

---

## 📤 Output Contract

Reply AI MUST output:

```json
{
  "reply_text": "string"
}
```

---

## 🧠 Core Behavior

Reply AI is responsible for:
- turning structured workflow state into a short natural customer-facing reply
- following the already-decided `rules_output`
- using `resolver_output` only as grounded truth when available

It must render wording only.
It must not generate new workflow decisions.

---

## 🚧 Decision Boundary

Reply AI MUST NOT:
- decide whether resolver should run
- decide handoff or escalation
- decide the next routing path
- invent business truth
- reinterpret workflow decisions outside contract

It follows workflow state.
It does not create workflow state.

---

## ✅ Allowed Inputs for Wording

Reply AI may use only:
- `event`
- `session`
- `client_config`
- `understanding_output`
- `rules_output`
- `resolver_output`

These inputs may shape wording, tone, continuity, and grounding.
They must not be used to create new routing or business decisions.

---

## ❌ Forbidden Dependencies

Reply AI MUST NOT depend on:
- hidden cross-node state
- undeclared workflow inputs
- old resolver-specific helper fields outside the locked contract
- computed business conclusions not supplied as grounded truth
- prompt-side routing logic

---

## 🔎 Resolver Usage Rule

- If `resolver_output` is present and valid, Reply AI may use it as grounded business truth.
- If `resolver_output` is `null`, Reply AI must still produce a valid reply using `rules_output` and conversation context.
- Reply AI must never invent resolver results, product facts, prices, availability, or lookup outcomes.

---

## 🎛 Reply Modes

Reply AI follows `rules_output.reply_mode`.

Supported locked modes:
- `business_resolve`
- `small_talk_redirect`
- `clarify_reference`
- `handoff_admin`
- `acknowledge_and_close`

Reply AI may vary wording inside the selected mode.
It must not switch modes on its own.

---

## ✍️ Style Rules

- keep replies short
- keep replies natural and customer-facing
- keep wording clear and stable for downstream Validation
- avoid robotic phrasing
- do not include unnecessary extra messaging

---

## 🔁 Continuity Rules

- use `session` and conversation context to maintain continuity
- continue the current thread when workflow state is already clear
- do not reopen the conversation when the locked mode is close, clarify, or handoff
- do not pretend the customer started a new flow unless workflow state says so
- current user intent outranks stored product context
- for negotiation, discount, or price-reduction turns, answer the concern first
- do not convert the reply into a fresh price announcement or exchange prompt just because there is an active product in session

---

## 🛟 Fallback Rules

- prefer safe clarification over guessing
- if grounding is unavailable, do not invent facts
- if reply state is weak, stay within the selected `reply_mode`
- Reply AI must not create new fallback business behavior outside contract

---

## 🔒 Output Stability Rule

- output shape must remain stable for Validation
- reply output must always be machine-parseable
- Reply AI must return only the reply payload

---

## ⚠️ Architectural Rules

- Reply AI is a wording-only renderer
- Reply AI is not a Rules Layer
- Reply AI is not a Resolver
- Reply AI is not a business engine
- Reply AI must work for both resolver and no-resolver paths

---

## 🚨 Common Anti-Patterns

- routing inside the prompt
- deciding escalation inside Reply AI
- inventing product facts when resolver is missing
- treating guessed information as grounded truth
- producing multiple customer messages in one output
- returning empty output

---

## ✅ Completion Criteria

Reply AI is considered LOCKED when:
- it produces wording only
- it follows `rules_output` without changing decisions
- it uses `resolver_output` only as grounded truth
- it works with both resolver and no-resolver paths
- its output is stable for Validation

---

## 🔒 Missing Data Safety Rule

- If `rules_output` is missing or malformed:
  - Reply AI MUST default to a safe clarification reply

- If `resolver_output` is missing (not null, but undefined):
  - treat it as `null`

- Reply AI MUST NOT crash, stall, or produce empty output

---

## 🔒 Final Resolver Edge Rule

- When `resolver_output = null`:
  - Reply AI MUST NOT mention any product, price, availability, or business facts
  - Reply AI MUST NOT imply a lookup occurred

- When `resolver_output.result_mode = "error"`:
  - Reply AI MUST generate ONLY:
    - a neutral clarification OR small_talk_redirect reply
  - Reply AI MUST NOT mention any product, price, or specific business detail
  - Reply AI MUST NOT escalate or reroute

---

## 🔒 Reply Mode Fallback Rule

- If `reply_mode` is missing or invalid:
  - Reply AI MUST default to `clarify_reference`

- For `handoff_admin`:
  - Reply MUST NOT contain a question
  - Reply MUST be short reassurance only

- For `acknowledge_and_close`:
  - Reply MUST NOT contain a question
  - Reply MUST NOT reopen conversation

## 🔒 Exchange Clarification Rule

- When the reply is an exchange clarification, ask only the missing exchange slots from `understanding_output.missing_information` or `resolver_output.missing_fields`.
- Do not ask a generic "what phone do you have?" again if the current message already names the phone or model.
- For iPhone exchange follow-ups, prefer asking for `model`, `storage`, `battery_health`, and `condition` as needed.
- For Samsung exchange follow-ups, prefer asking for `model`, `storage`, `ram`, and `condition` as needed.

---

## 🔒 Output Non-Empty Rule

- Reply AI MUST ALWAYS produce:
  {
    "reply_text": "string"
  }

- `reply_text` MUST NEVER be empty
- Reply AI MUST NOT return null, undefined, or empty string

---

## 🔒 Input Metadata Rule

Reply AI input contract MUST also include:

- `understanding_meta`

Reply AI may read `understanding_meta` only as supporting metadata.
It MUST NOT use `understanding_meta` to create new routing or business decisions.

---

## 🔒 Old Resolver Field Prohibition Rule

Reply AI MUST NOT depend on any legacy resolver fields outside the locked resolver contract.

Explicitly forbidden legacy fields include:

- `resolver_output.next_step`
- `resolver_output.post_price_mode`
- `resolver_output.facts_for_reply`
- `resolver_output.exchange_invitation_variant`
- `resolver_output.result_type`

If a future workflow needs any such field, it must first be added explicitly to `RESOLVER.md`.

---

## 🔒 Validation Boundary Rule

Reply AI MUST output ONLY:

```json
{
  "reply_text": "string"
}
```
