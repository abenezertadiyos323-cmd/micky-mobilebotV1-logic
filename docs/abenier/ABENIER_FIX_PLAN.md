# ABENIER_FIX_PLAN.md

## Purpose

Step-by-step fixes to align current workflow with Abenier Architecture Rules.

---

# STATUS LEGEND

* [ ] Not started
* [~] In progress
* [x] Completed

> [!IMPORTANT]
> **LOCKED:** This workflow is approved as **ABENIER_PHONE_SELLER_TEMPLATE_v1**.
> It is stable and clone-ready for same-industry phone sellers.
> It is not yet approved as a cross-industry or general retail template.

---

# PHASE 1 — CRITICAL BLOCKERS (MUST FIX BEFORE LOCK)

## 1. Remove Hardcoded Client Config

* [x] Remove "TedyTech" from Session Bootstrap
* [x] Move store_name to env or Convex
* [x] Ensure sellerId is dynamic

---

## 2. Fix $node Fragility

* [x] Identify all `$node[...]` usage
* [x] Replace with `$json` where possible
* [x] Ensure safe execution order

---

## 3. Add AI Retry + Fallback

* [x] Add retry (max 2) to Understanding AI
* [x] Add retry (max 2) to Reply AI
* [x] Add fallback message path

---

## 4. Stop State Mutation in n8n

* [x] Identify where `$session` is modified
* [x] Reduce to single pass-through
* [x] Prepare to move logic to Convex

---

# PHASE 2 — ARCHITECTURE ALIGNMENT

## 5. Reduce Rules Layer Complexity

* [x] Identify business logic inside Rules Layer
* [x] Mark parts to move to Convex

---

## 6. Clean Input Normalization

* [x] Ensure one input format
* [x] Remove duplicate parsing

---

## 7. Stabilize Convex Contract

* [x] Ensure consistent JSON response
* [x] Reduce fallback parsing in Session Bootstrap

---

# PHASE 3 — SAFETY + SCALING

## 8. Observability

* [x] Add logging for AI fallback rate
* [x] Add logging for unclear intent

---

## 9. Rate Limiting

* [x] Define per-user AI limits

---

## 10. Clone Test

* [x] Replace sellerId
* [x] Confirm no TedyTech references
* [x] Validate workflow still runs

---

# FINAL STEP

## LOCK

* [x] All checklist items reviewed
* [x] Workflow passes lock checklist
* [x] Architecture respected

---

### ABENIER_PHONE_SELLER_TEMPLATE_v1 — LOCK NOTE
- **Stability:** High (Phase 1, 2, 3 complete).
- **Clone Readiness:** Same-industry Phone Sellers (Success).
- **External Requirements:** 6 Telegram nodes (credentials) must be manually updated during deployment.
- **Environment Variables:** `SELLER_ID`, `STORE_NAME`, `BOT_NAME`, `DEFAULT_LANG`.
- **Future Scope:** Cross-industry support requires Rules Layer refactoring.

---
