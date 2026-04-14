# Understanding Flow (LOCKED)

## Purpose
Defines how a user message is processed through the Understanding layer.

---

## Full Flow

User Message  
→ Session Bootstrap  
→ Understanding AI  
→ Understanding JSON Guard  
→ Merge Node  
→ Rules Layer  

---

## Step-by-Step Explanation

### 1. Session Bootstrap
- Receives incoming Telegram message
- Attaches:
  - event
  - session
  - client_config
- Acts as the base state for the workflow

---

### 2. Understanding AI
- Reads:
  - current message
  - session
  - short history
- Applies meaning-first logic
- Outputs structured JSON (raw AI output)

---

### 3. Understanding JSON Guard
- Validates AI output
- Ensures schema correctness
- Applies fallback if invalid

Output:
- understanding_output
- understanding_meta

Important:
- No business logic
- No state modification
- Pure validation only

---

### 4. Merge Node (CRITICAL)

Purpose:
Restore full workflow state after Guard

Why needed:
Guard returns ONLY:
- understanding_output
- understanding_meta

So we must merge back:
- event
- session
- client_config

---

### Merge Configuration

Inputs:
- Input 1 → Session Bootstrap
- Input 2 → Understanding JSON Guard

Mode:
- Merge by position

**Important:**
The Merge node must always preserve the latest session state.
If session is updated before this step, ensure the newest version is merged.

---

### After Merge Output

```json
{
  "event": {...},
  "session": {...},
  "client_config": {...},
  "understanding_output": {...},
  "understanding_meta": {...}
}
```

---

## Database Layer (Convex)

After the Merge Node, a database layer is applied.

See:
docs/abenier/database/DATABASE_FLOW.md

Purpose:
- store user intention
- retrieve past behavior
- support decision layer

Important:
Database is NOT used in Understanding.
Database is used only after Merge, before Rules Layer.
