# ABENIER_ARCHITECTURE_RULES.md (FINAL LOCKED VERSION)

## Purpose

These rules define the **core architecture of the Abenier System**.

They ensure:

* stability (no workflow breakage)
* scalability (multi-client support)
* fast cloning (TedyTech → Micky Mobile → others)
* low debugging time

These rules must be followed by:

* Bena
* Claude, Codex, Gemini, Grok
* any future AI tools

---

# 1. CORE PRINCIPLE (NON-NEGOTIABLE)

* **n8n = Orchestration (Router)**
* **Convex = Business Logic + State (Brain)**
* **AI = Language Layer**

No layer may violate its responsibility.

---

# 2. n8n RULES (ORCHESTRATION ONLY)

### Allowed

* Webhook / Telegram input
* Event normalization
* Calling AI (Understanding + Reply)
* Calling Convex endpoints
* Basic routing (IF / Switch)
* Sending Telegram messages

### Allowed (Light Only)

* Small data shaping (Event Normalizer, Session Bootstrap)

### NOT Allowed

* Business logic (pricing, filtering, classification)
* Deep decision-making
* Reusable rules
* Complex regex parsing
* Multi-step state mutation

---

# 3. CONVEX RULES (SOURCE OF TRUTH)

Convex MUST handle:

* Session state (ONLY here)
* Lead classification (hot / warm / cold)
* Product filtering / matching
* Exchange logic
* Seller configuration
* Deterministic rules

### Requirements

* TypeScript only
* Testable independently
* Reusable across clients

---

# 4. AI RULES (LANGUAGE ONLY)

### Allowed

* Intent extraction
* Entity extraction
* Natural reply generation (Amharic-first)

### NOT Allowed

* Business decisions
* Overriding Convex results
* Inventing product/store facts

---

# 5. STATE MANAGEMENT (CRITICAL)

* ALL state lives in Convex
* n8n must be stateless
* No duplicated session logic anywhere else
* n8n only carries state, never owns or mutates it

---

# 6. API CONTRACT (STRICT)

All Convex responses MUST follow:

```json
{
  "status": "success",
  "intent": "optional_ui_intent",
  "data": {},
  "message": "optional"
}
```

* No dynamic structures
* No inconsistent shapes

---

# 7. CODE NODE RULE

* Max **~40 lines**
* Must remain readable
* No business logic
* No complex parsing

If code grows → move to Convex

---

# 8. NODE DEPENDENCY SAFETY

* Minimize `$node["..."]` usage
* Use ONLY when node execution is guaranteed
* Prefer passing data through `$json`

Goal:

* Safe renaming
* Safe branching
* No NodeOperationError

---

# 9. INPUT STANDARDIZATION

All incoming data MUST be normalized into ONE format:

```json
{
  "user_id": "...",
  "text": "...",
  "attachments": [],
  "source": "telegram"
}
```

No multiple formats downstream.

---

# 10. CLIENT CONFIG (NO HARDCODING)

NEVER hardcode:

* store name
* bot name
* product categories
* **sellerId**

sellerId MUST:

* come from trigger, session, environment variables, or Convex config
* never be embedded inside workflow logic

---

# 11. CLONING RULE (CORE BUSINESS)

System must support multi-client:

Only change:

* sellerId
* branding
* product data

DO NOT change:

* workflow logic
* architecture
* core flows

---

# 12. PROMPT MANAGEMENT

* Prompts must NOT be hardcoded in n8n
* Store in Convex or config layer
* Use **prompt_version**
* Use caching or env variables for frequently used prompts

---

# 13. ERROR & FALLBACK HANDLING

System MUST handle:

### AI failure

→ retry
→ fallback message

### Convex failure

→ safe fallback message

### Timeout

→ retry or graceful response

User must NEVER experience silent failure.

---

# 14. RETRY & TIMEOUT RULE (STRICT)

* AI calls → max **2 retries**
* Convex calls → max **2 retries**
* Must not fail silently
* Always provide fallback response

---

# 15. OBSERVABILITY (REQUIRED)

Track in Convex:

* AI calls
* AI fallback rate
* low-confidence rate
* clarification rate
* handoff rate
* user drop points

Goal:

* improve system over time
* detect failures early

---

# 16. RATE LIMITING (COST CONTROL)

* Limit AI calls per user
* Prevent spam abuse
* Protect API budget

---

# 17. VERSIONING (MULTI-CLIENT SAFETY)

Track:

* prompt_version
* rules_version

Goal:

* safe updates
* no breaking old clients

---

# 18. WHAT NOT TO DO (STRICT)

* Do NOT move logic into n8n
* Do NOT duplicate state logic
* Do NOT hardcode client data
* Do NOT let AI control business decisions
* Do NOT edit workflow ignoring these rules

---

# FINAL PRINCIPLE

Abenier is NOT a bot.
It is a **scalable, cloneable system**.

---

# LOCK STATEMENT

After this file is accepted:

* Architecture must NOT be changed frequently
* Improvements must respect these rules
* Focus shifts from “fixing workflow” → “building system”
