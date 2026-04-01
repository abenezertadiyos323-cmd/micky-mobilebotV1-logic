# V2 Architecture

## Purpose
- this document defines the full v2 workflow structure
- it connects understanding, rules, resolver, reply, side effects, and session save
- it is the reference for building the new workflow JSON

## Final V2 Flow
Telegram Input
→ Event Normalizer
→ Session Load
→ Session Bootstrap
→ Understanding AI
→ Validation Node
→ Rules Layer
→ Business Data Resolver
→ Reply AI
→ Side Effects
→ Telegram Send
→ Session Save

## Event Types
- text_message
- callback_action
- start_reset
- deep_link_start

### Callback Actions
- select_option
- confirm_order
- change_option
- notify_me
- admin_handoff

## Session Schema
- **session_version**
- **chat_id**
- **seller_id**
- **language**
- **stage**
- **resolved_flow**
- **tentative_flow**
- **next_action**
- **route_recommendation**
- **followup_round**
- **last_asked_key**
- **collected_fields**
- **missing_information**
- **evidence_accumulated**
- **message_history**
- **last_understanding_output**
- **last_rule_decision**
- **last_resolver_output**
- **shown_options**
- **selected_option**
- **ranking_order**
- **cheaper_option**
- **active_product_id**
- **deep_link_context**
- **callback_context**
- **lead_state**
- **notify_state**
- **handoff_state**
- **recovery_state**
- **error_count**
- **updated_at**

## Business Data Resolver Responsibilities
- product search from constraints
- deterministic product ranking
- result modes:
  - single_match
  - two_options
  - alternatives
  - no_match_yet
  - notify_path
  - out_of_stock
- shown_options / ranking_order / cheaper_option
- reference support for:
  - that one
  - second one
  - cheaper one
  - 128gb version
- selected product resolution
- store facts:
  - location
  - hours
  - payment
  - warranty
  - delivery
  - policy
- exchange completeness validation
- notify-me payload preparation
- handoff payload preparation
- facts only, never reply text

## Side Effects
- always-on lead capture
- notify-me save
- admin/handoff save
- owner/admin alert trigger

## Build Principles
- keep workflow linear
- no spider-web branching
- one understanding AI
- one reply AI
- deterministic middle
- reply AI cannot change decisions
- validate AI output before rules
- use versioned session save if possible

## Notes
- current workflow remains backup
- v2 is the new core
- build in parallel, then test before switch
