# Database Flow (LOCKED)

## Purpose

Defines where the database layer is placed in the workflow and how it supports decision-making.

---

## Position in Workflow

User Message
→ Session Bootstrap
→ Understanding AI
→ Understanding JSON Guard
→ Merge Node
→ Database Layer (Convex)
→ Rules Layer
→ Reply Layer

---

## Why Database Comes After Merge

The database layer must come after the Merge node because at that point the workflow has:

* event
* session
* client_config
* understanding_output
* understanding_meta

This is the minimum clean package needed for safe save/fetch behavior.

---

## Save Flow

After the Merge node, the workflow may save the current interpreted message to the `intentions` table.

Saved data:

* user_id
* seller_id
* message_text
* message_function
* business_intent
* topic
* confidence
* ambiguity
* missing_information
* last_asked_key
* timestamp

Important:

* every interpreted message is logged
* this supports analysis and future improvement

---

## Fetch Flow

Before the Rules Layer, the workflow may fetch current customer memory from the `users` table.

Fetched data may include:

* last_intent
* last_topic
* last_asked_key
* last_active_product_id
* preferred_brand
* preferred_model
* budget_range
* negotiation_tendency
* exchange_interest

Important:

* fetched memory supports decision
* fetched memory must not replace current message meaning

---

## Flow Rule

The database layer supports continuity, but does not control understanding.

Rule:

* current natural message first
* database memory second
* use memory only when it clearly fits the current message

---

## Final Rule

Understanding remains stateless.
Database remains stateful.
Rules Layer uses both carefully.
