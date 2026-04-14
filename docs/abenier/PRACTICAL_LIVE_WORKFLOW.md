# Practical Live Workflow (LOCKED)

## Purpose

Defines the exact real execution flow of the bot in n8n.
This is the single source of truth for aligning the live workflow.

---

## Main Flow

Telegram Input
→ Event Normalizer
→ Session Load
→ Session Bootstrap
→ Callback Action? (bypass check)
→ Understanding AI
→ Understanding JSON Guard
→ Merge Node
→ Rules Layer
→ Should Resolve? (IF)
→ Yes: Product Search → Business Data Resolver / Convex truth
→ No: skip resolver
→ Reply AI
→ Prepare Keyboard (if needed)
→ Validation
→ Safe To Send
→ Telegram Send
→ Session Save
→ Memory / Intention Update

---

## Callback Flow (Handoff Confirmation)

Callback Action? (IF)
→ Callback Action Handler
→ Confirmed Handoff IF
→ Yes: Admin Notification → Callback Telegram Send → Callback Session Save
→ No: Callback Telegram Send → Callback Session Save

---

## Core Rules

* Session context must exist before Understanding AI
* Understanding AI is meaning-only (no business logic)
* JSON Guard is validation-only
* Merge Node restores full payload after Guard
* Rules Layer decides routing
* Resolver runs ONLY on Should Resolve = TRUE
* Admin notification ONLY after confirmed callback
* Inline buttons are part of reply (not routing)
* Memory update happens AFTER Session Save
* Validation and Safe To Send nodes are mandatory production safety layers and must never be removed or bypassed during refactor

---

## Architecture Principle

* n8n = orchestration
* Convex = truth + business logic
* AI = understanding + language

---
