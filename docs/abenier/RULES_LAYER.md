# RULES LAYER — LOCKED SPEC

## 🎯 Responsibility

The Rules Layer is a **pure decision engine**.

It determines:
- whether business data is needed (resolver)
- how the bot should respond (reply mode)
- whether to escalate to human (handoff)
- what the next action is

It does **NOT** perform business logic or data processing.

---

## 📥 Input Contract

The Rules Layer receives:

```json
{
  "understanding_output": {
    "message_function": "string",
    "business_intent": "string | null",
    "confidence": number,
    "ambiguity": number,
    "missing_information": [],
    "reference_resolution": {}
  },
  "session": {},
  "event": {}
}
```

Allowed inputs:

* understanding_output
* session
* event (optional)

The Rules Layer may also use:
- `understanding_output.business_intent`
- `understanding_output.missing_information`
- `understanding_output.reference_resolution`
- `event.event_type`

---

## 📤 Output Contract

The Rules Layer MUST output:

```js
return [{
  json: {
    rules_output: {
      should_call_resolver: true,
      reply_mode: "string",
      handoff_needed: false,
      next_action: "string",
      confidence: 0.0
    }
  }
}];
```

### Field Definitions

* should_call_resolver (boolean)
  → true if business data is required (Convex)

* reply_mode (string)
  → defines response style
  examples:

  * business_resolve
  * small_talk_redirect
  * clarify_reference
  * handoff_admin

* handoff_needed (boolean)
  → true if conversation should go to human/admin

* next_action (string)
  → describes system intention
  examples:

  * provide_info
  * ask_clarification
  * redirect_to_business
  * escalate_to_human

* confidence (number)
  → passed from understanding layer

---

## 🧠 Decision Rules (Simplified)

| Condition                            | Output          |
| ------------------------------------ | --------------- |
| low confidence OR high ambiguity     | clarify         |
| info request / product question      | resolver = true |
| refinement / negotiation             | resolver = true |
| greeting / thanks                    | no resolver     |
| off-topic                            | redirect        |
| very low confidence + high ambiguity | handoff         |

---

## ❌ What Rules Layer MUST NOT Do

* No product filtering
* No price calculation
* No stock checking
* No regex extraction
* No product ID resolving
* No resolver_input creation
* No session_update / memory writing
* No reply text generation
* No external API calls

---

## ⚠️ Architectural Rules

* Rules Layer is the ONLY node that decides:

  * should_call_resolver
  * handoff_needed

* Output must always be:

  * stable
  * complete
  * boolean-safe (no hidden logic in strings)

---

## 🔄 Flow Position

Merge Node
→ Rules Layer
→ Should Resolve? (IF)

---

## ✅ Completion Criteria

Rules Layer is considered LOCKED when:

* outputs match contract exactly
* contains no business logic
* contains no data mutation
* produces stable decisions for all message types

## 🔒 Output Stability Rule

- `rules_output` MUST always exist as a top-level key
- It MUST always include all fields:
  - should_call_resolver
  - reply_mode
  - handoff_needed
  - next_action
  - confidence
- If any value is missing, default values MUST be applied

---

## 🧠 Decision Rules (Explicit Mapping)

- message_function === 'acknowledgment'
  → reply_mode = small_talk_redirect
  → should_call_resolver = false
  → next_action = greet_or_redirect

- event.event_type === 'start_reset' OR 'deep_link_start'
  → reply_mode = small_talk_redirect
  → should_call_resolver = false
  → next_action = greet_or_redirect

- message_function === 'clarification'
  → reply_mode = clarify_reference
  → should_call_resolver = false
  → next_action = ask_clarification

- message_function === 'info_request'
  → reply_mode = business_resolve
  → should_call_resolver = true
  → next_action = provide_info

- message_function === 'negotiation'
  → reply_mode = business_resolve
  → should_call_resolver = true
  → next_action = handle_negotiation
  → current product context may support grounding, but it must not override the current negotiation concern or force a fresh price announcement

- message_function === 'refinement' OR 'fresh_request'
  → reply_mode = business_resolve
  → should_call_resolver = true
  → next_action = process_request

- business_intent === 'exchange' AND missing_information is not empty
  → reply_mode = clarify_reference
  → should_call_resolver = false
  → next_action = ask_clarification

- If `message_function` is `fresh_request` or `refinement`
  AND `business_intent === "product_search"`
  AND core product fields are still missing
  AND there is no resolved reference
  AND there is no active product in session
  → reply_mode = clarify_reference
  → should_call_resolver = false
  → next_action = ask_clarification

- message_function === 'off_topic'
  → reply_mode = small_talk_redirect
  → should_call_resolver = false
  → next_action = redirect_to_business

---

## ⚠️ Guard Fallback Rule

- If ambiguity is high AND confidence is low
- OR message_function === 'clarification'

THEN:
- reply_mode = clarify_reference
- should_call_resolver = false
- next_action = ask_clarification

---

## 🚨 Handoff Rule

- If confidence < 0.3 AND ambiguity > 0.8

THEN:
- handoff_needed = true
- reply_mode = handoff_admin
- should_call_resolver = false
- next_action = escalate_to_human
