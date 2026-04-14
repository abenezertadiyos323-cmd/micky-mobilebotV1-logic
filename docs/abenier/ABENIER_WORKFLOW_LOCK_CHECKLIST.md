# ABENIER_WORKFLOW_LOCK_CHECKLIST.md

## Purpose

This checklist is used before declaring an n8n workflow **locked** for Abenier.

A workflow is **NOT locked** just because it works once.
It is locked only when it is:

* stable
* cloneable
* safe to edit
* aligned with Abenier architecture rules

---

# 1. CLIENT CONFIG LOCK

## Must be true

* No hardcoded store name inside workflow logic
* No hardcoded bot name inside workflow logic
* No hardcoded sellerId inside workflow logic
* Client-specific config comes from:

  * Convex config
  * environment variables
  * trigger/session payload

## Fail if

* `TedyTech`, `Micky`, or any client name appears directly inside Code nodes, prompts, or workflow-specific logic

---

# 2. STATE MANAGEMENT LOCK

## Must be true

* n8n does NOT own session state
* Convex is the only source of truth
* n8n only passes state forward
* No multi-node mutation of session object

## Fail if

* session is edited in multiple code nodes
* local `$session` becomes the real source of truth
* workflow can continue with stale state after crash

---

# 3. CODE NODE LOCK

## Must be true

* Every Code node is small and readable
* No Code node contains business logic
* No Code node contains reusable pricing/filtering/classification rules
* Code nodes are used only for:

  * normalization
  * shaping
  * simple transformation

## Fail if

* Code node becomes a mini backend
* pricing logic lives in n8n
* product matching logic lives in n8n
* classification logic lives in n8n

---

# 4. NODE DEPENDENCY LOCK

## Must be true

* `$node["..."]` is minimized
* Any `$node["..."]` reference is safe and guaranteed
* Prefer `$json` passing whenever possible
* Renaming one node should not silently break downstream logic

## Fail if

* skipping one node breaks another branch
* renaming a node breaks execution
* one node depends on hidden path assumptions

---

# 5. INPUT STANDARDIZATION LOCK

## Must be true

* All incoming Telegram data is converted to one consistent object
* Downstream nodes use the same input structure
* No repeated re-parsing of the same raw input in multiple nodes

## Fail if

* text is reinterpreted in many places
* normalization happens in 3–4 different nodes
* one branch uses different payload shape from another

---

# 6. AI USAGE LOCK

## Must be true

* AI only does:

  * intent extraction
  * entity extraction
  * reply generation
* AI does NOT make final business decisions
* AI does NOT invent facts
* AI output is validated before sensitive use

## Fail if

* AI decides pricing
* AI decides product truth
* AI replaces deterministic business rules
* prompts contain too much hidden business logic

---

# 7. CONVEX CONTRACT LOCK

## Must be true

* Convex responses are consistent
* Session load/save shape is stable
* Deterministic logic lives in Convex
* Workflow does not need giant fallback parsing to understand Convex response

## Fail if

* Convex returns messy/dynamic shapes
* Session Bootstrap has 100+ lines of fallback assignment
* n8n has to guess Convex structure

---

# 8. ERROR HANDLING LOCK

## Must be true

* AI nodes have retry/fallback
* Convex calls have retry/fallback
* User always gets a safe reply on failure
* Silent failure is impossible

## Fail if

* API timeout kills workflow silently
* user sees no response
* fallback path is undefined
* retry behavior is inconsistent

---

# 9. OBSERVABILITY LOCK

## Must be true

* System can log:

  * AI fallback rate
  * clarification rate
  * low-confidence rate
  * handoff rate
* Failures can be traced later
* Debugging does not depend only on memory

## Fail if

* you cannot tell where users get stuck
* you cannot measure fallback frequency
* production errors are invisible

---

# 10. CLONING LOCK

## Must be true

* Workflow can be reused for another seller without architecture changes
* Only these should change:

  * sellerId
  * branding
  * product/config data

## Fail if

* new client requires editing core workflow logic
* prompts mention old client directly
* code contains phone-store-specific hardcoding

---

# 11. PROMPT LOCK

## Must be true

* Prompts are versioned
* Prompts are not hardcoded dangerously in workflow
* Prompt changes do not require risky workflow surgery
* Prompt role is limited to language behavior

## Fail if

* changing prompt means editing fragile workflow JSON everywhere
* prompt updates can break unrelated nodes
* prompts encode business logic that should be deterministic

---

# 12. RATE & COST LOCK

## Must be true

* AI calls are limited per user
* Spam abuse cannot burn budget
* Retry settings do not create runaway cost

## Fail if

* one user can spam unlimited AI calls
* retries multiply cost dangerously
* no cost guard exists

---

# 13. TEST LOCK

## Must be true

Test these before locking:

### Basic tests

* greeting
* product inquiry
* price question
* exchange intent
* unclear user message

### Failure tests

* AI temporary failure
* Convex failure
* timeout scenario

### Clone tests

* replace seller config
* confirm no old client name leaks
* confirm flow still works

## Fail if

* only happy path was tested
* no fallback scenario tested
* clone test was skipped

---

# 14. LOCK DECISION RULE

A workflow is LOCKED only when:

* no critical hardcoding remains
* no critical hidden node fragility remains
* no critical state mutation remains in n8n
* fallback behavior is defined
* clone-readiness is confirmed
* tests passed

If any of the above fail:
**the workflow is not locked yet**

---

# FINAL RULE

Do NOT say:
“the bot works”

Say:
“the workflow passed the lock checklist”

That is the Abenier standard.
