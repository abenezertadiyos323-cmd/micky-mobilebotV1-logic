# RESOLVER — LOCKED SPEC

## 🎯 Responsibility

The Resolver is a **thin bridge between n8n and Convex**.

It is responsible for:
- sending structured queries to Convex
- receiving verified business data (truth)
- mapping/formatting that data for Reply AI

It must NOT perform business logic.

---

## 🧱 Position in Flow

Should Resolve? (IF)
→ Product Search (Convex call)
→ Business Data Resolver
→ Reply AI

---

## 📥 Input Contract

Resolver receives:

```json
{
  "rules_output": {
    "should_call_resolver": boolean,
    "reply_mode": "string",
    "handoff_needed": boolean,
    "next_action": "string",
    "confidence": number
  },
  "understanding_output": {
    "message_function": "string",
    "entities": {},
    "constraints": {},
    "raw_text": "string"
  },
  "session": {}
}
```

---

## 📤 Output Contract

Resolver MUST output:

```js
return [{
  json: {
    resolver_output: {
      result_mode: "found | not_found | need_more_info",
      products: [],
      metadata: {},
      missing_fields: [],
      source: "convex"
    }
  }
}];
```

---

## 🧠 Core Rules

### 1. Convex is the source of truth

* ALL business logic must live in Convex
* Resolver MUST NOT:

  * filter products
  * calculate prices
  * decide stock availability
  * score exchange values
  * enforce constraints

---

### 2. Product Search (Convex Call)

Product Search node must:

* send structured input ONLY:

  * extracted entities from Understanding
  * constraints
  * session hints
  * resolved product reference when available

* MUST NOT:

  * use regex on raw text
  * guess product names
  * override understanding_output

Additional safety:

* If Understanding already provides a resolved reference, Product Search MUST prefer that grounded reference over the raw customer sentence.
* If core product fields are still missing and there is no resolved reference or active product context, the workflow should avoid resolver search and ask clarification instead of sending an underspecified search.
* For exchange flows, keep the exchange follow-up slot set consistent with the phone being discussed:
  * iPhone: `model`, `storage`, `battery_health`, `condition`
  * Samsung: `model`, `storage`, `ram`, `condition`
  * other brands: `model`, `storage`, `condition`

---

### 3. Business Data Resolver

This node must ONLY:

* normalize Convex response
* map fields into a clean structure
* prepare safe output for Reply AI

It MUST NOT:

* apply business rules
* filter results
* modify pricing logic
* generate decisions (no next_action, no routing)
* mutate session

---

### 4. Reply AI Boundary

Reply AI must receive:

* clean resolver_output
* clean rules_output

Resolver MUST NOT send:

* pre-written replies
* decision flags like "next_step"
* business conclusions

---

### 5. No-Resolver Path

If should_call_resolver = false:

* Reply AI MUST still receive:

  * rules_output
  * resolver_output = null

This ensures:

* stable input shape
* no conditional chaos
* zero format ambiguity

---

## ❌ What Resolver MUST NOT Do

* No regex extraction
* No product matching logic
* No filtering
* No sorting logic
* No price logic
* No stock logic
* No session_update
* No resolver_input duplication
* No decision-making (belongs to Rules Layer)

---

## ⚠️ Architectural Rules

* Resolver is NOT a second Rules Layer
* Resolver is NOT a database
* Resolver is NOT a business engine

It is ONLY:
→ Convex bridge + formatter

---

## 🔒 Output Stability Rule

* resolver_output MUST always exist when resolver runs
* structure must be stable
* fields must not change shape between executions

---

## 🚨 Common Anti-Patterns (Forbidden)

* embedding regex inside Product Search
* using $node[...] cross references
* building large nested state objects
* calculating missing fields locally
* duplicating business rules from Convex

---

## ✅ Completion Criteria

Resolver is considered LOCKED when:

* no business logic exists in n8n
* Convex handles all truth decisions
* Product Search is clean and simple
* Business Data Resolver is thin and stateless
* Reply AI receives consistent structured input

## 🔒 No-Resolver Output Rule

If `rules_output.should_call_resolver = false`, Reply AI MUST still receive a stable resolver shape.

Required shape:

```js
return [{
  json: {
    resolver_output: null
  }
}];
```

Allowed alternative only if used consistently everywhere:

```js
return [{
  json: {
    resolver_output: {
      result_mode: "skipped",
      products: [],
      metadata: {},
      missing_fields: [],
      source: "none"
    }
  }
}];
```

The workflow MUST choose one format and use it consistently.

---

## 🚨 Error Contract

If Convex call fails, times out, or returns invalid structure:

* Resolver MUST NOT invent business facts
* Resolver MUST NOT silently continue with guessed values
* Resolver MUST return a safe structured failure shape

Required failure shape:

```js
return [{
  json: {
    resolver_output: {
      result_mode: "error",
      products: [],
      metadata: {
        error_source: "convex"
      },
      missing_fields: [],
      source: "convex"
    }
  }
}];
```

---

## 🧱 Data Flow Rule

Resolver nodes must use data passed through `$json` only.

Forbidden:

* `$node[...]`
* hidden cross-node references
* re-reading raw Telegram text when structured understanding data already exists

Allowed:

* `rules_output`
* `understanding_output`
* `session`
* Convex response passed through normal workflow data

---

## 🚫 No Computed Business Fields Rule

Business Data Resolver MUST NOT create computed business fields such as:

* affordability decisions
* stock decisions
* exchange scores
* ranking logic
* product eligibility
* pricing conclusions

If such fields are needed, they must come directly from Convex.

Resolver may only:

* rename fields
* normalize structure
* safely pass through Convex truth

---

## 🔁 Resolver Output Stability Rule

`resolver_output` must use one stable schema across:

* resolver-run path
* resolver-skipped path
* resolver-error path
* future client clones

Field names and structure must not drift between flows.

## 🔒 Strict No-Resolver Output Contract

When `rules_output.should_call_resolver = false`, Resolver MUST explicitly return:

```js
return [{
  json: {
    resolver_output: null
  }
}];
```

Rules:

* `resolver_output` MUST exist
* It MUST be `null`
* It MUST NOT be omitted
* It MUST NOT vary between executions

---

## 🚨 Strict Error Output Contract

If Convex fails, times out, or returns invalid data:

Resolver MUST return EXACTLY:

```js
return [{
  json: {
    resolver_output: {
      result_mode: "error",
      products: [],
      metadata: {
        error_source: "convex"
      },
      missing_fields: [],
      source: "convex"
    }
  }
}];
```

Rules:

* No fallback guessing
* No silent recovery
* No business logic execution

---

## 🚫 Strict Definition of Computed Business Fields

The following are FORBIDDEN inside Resolver:

* is_affordable
* stock_status
* availability decisions
* exchange_score
* price comparisons
* ranking logic
* product eligibility filtering

If needed, they MUST come directly from Convex.

---

## 🧱 Strict Data Flow Rule

Resolver MUST use ONLY `$json`.

STRICTLY FORBIDDEN:

* `$node[...]`
* cross-node references
* re-parsing raw Telegram input

ALLOWED:

* `$json.rules_output`
* `$json.understanding_output`
* `$json.session`
* Convex response

---

## 🔁 Reply AI Input Guarantee

Reply AI MUST ALWAYS receive:

```js
{
  rules_output: {...},
  resolver_output: {...} OR null
}
```

This MUST be consistent for:

* resolver-run
* resolver-skipped
* resolver-error

## 🔒 Resolver Decision Safety Rule

If `rules_output.should_call_resolver` is missing or undefined:

- It MUST default to:
  → false

Resolver MUST behave as:

```js
return [{
  json: {
    resolver_output: null
  }
}];
```

No Convex call should be triggered.

---

## 🔒 Single No-Resolver Format Rule

The system MUST use ONLY ONE format for skipped resolver:

```js
return [{
  json: {
    resolver_output: null
  }
}];
```

The alternative object format is DEPRECATED and MUST NOT be used.

This ensures:

* consistent Reply AI behavior
* zero ambiguity
* stable downstream logic

## 🔒 Rules Output Safety Rule

If `rules_output` is missing, malformed, or does not contain a valid boolean `should_call_resolver`:

- Resolver MUST default to the safe no-resolver path
- Resolver MUST NOT call Convex
- Resolver MUST return:

```js
return [{
  json: {
    resolver_output: null
  }
}];
```

This protects the workflow from upstream contract failure.
