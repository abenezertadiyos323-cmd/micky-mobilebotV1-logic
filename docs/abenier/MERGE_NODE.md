# Merge Node (LOCKED)

## Purpose

Restores full workflow payload after Understanding JSON Guard.

The Guard returns only:

* understanding_output
* understanding_meta

Merge must recombine this with:

* event
* session
* client_config

---

## Position in Flow

Understanding JSON Guard
→ Merge Node
→ Rules Layer

---

## Inputs

### Input 1 (Base State)

From: Session Bootstrap
Contains:

* event
* session
* client_config

### Input 2 (Validated Output)

From: Understanding JSON Guard
Contains:

* understanding_output
* understanding_meta

---

## Output (STRICT)

The Merge Node MUST output:

{
"event": {...},
"session": {...},
"client_config": {...},
"understanding_output": {...},
"understanding_meta": {...}
}

---

## Rules

* Input 1 MUST come from Session Bootstrap and must contain the latest session state (not stale or earlier node data)
* Do NOT remove any field from base state
* Do NOT rename keys
* Do NOT nest under additional layers
* Do NOT alter understanding_output
* Output must be flat and consistent
* Merge must be an explicit payload builder, NOT a generic deep merge
* Input 1 contributes ONLY: event, session, client_config
* Input 2 contributes ONLY: understanding_output, understanding_meta
* No input is allowed to overwrite unrelated top-level keys
* Output MUST always contain exactly these 5 top-level keys
* Both inputs MUST exist before executing Merge
* If any input is missing, Merge must fail safely and must NOT silently continue
* Merge must always use the latest session state from Session Bootstrap
* understanding_output may be normal or fallback, but must always exist
* understanding_meta must always exist (fallback allowed if missing)

---

## Why This Is Critical

* Prevents cross-node `$node[...]` hacks
* Ensures Rules Layer receives complete state
* Stabilizes Reply AI inputs
* Eliminates payload inconsistency bugs

---

## Failure Risk

If Merge is incorrect:

* Rules Layer receives incomplete data
* Reply AI breaks or hallucinates
* Workflow crashes on missing node references
* Missing input can lead to silent context corruption
* Stale Session Bootstrap data can cause wrong product context and repeated questions
* Guard fallback must still produce a complete payload for downstream nodes

---

## FINAL CHECK

* Confirm all fields exist in output
* Confirm no nesting like data.event or payload.event
* Confirm Rules Layer reads from $json directly
* Confirm both inputs are present before execution
* Confirm session comes from Session Bootstrap (latest state)
* Confirm understanding_output exists (normal or fallback)
* Confirm understanding_meta exists
* Confirm output has exactly 5 top-level keys
