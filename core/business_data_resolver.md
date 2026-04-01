# Business Data Resolver

## Purpose
- This layer runs after the Rules Layer
- It fetches and prepares business facts
- It never generates natural language
- It never changes routing or decisions
- It returns structured data only for the Reply AI and Side Effects layers

## Position in V2 Flow
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

## Input Contract
```json
{
  "rules_output": {
    "resolved_flow": "buy" | "exchange" | "faq" | "support" | "none",
    "tentative_flow": "...",
    "next_action": "...",
    "reply_mode": "...",
    "resolver_needed": true | false,
    "selected_option": "string" | null
  },
  "understanding_output": { 
    "user_need": "exploration" | "recommendation" | "clarification" | "transaction" | "info_request" | "post_sale" | "exchange_inquiry",
    "next_action": "clarify" | "ask_one_thing" | "suggest_options" | "answer_direct" | "push_to_mini_app" | "handoff" | "notify_me",
    "tentative_flow": "buy_soft" | "exchange_soft" | "faq" | "support" | "none",
    "confidence": 0.0-1.0,
    "ambiguity": 0.0-1.0,
    "missing_information": ["budget_etb"] | ["model"] | ["condition"] | ["storage"] | ["old_phone_details"] | [],
    "route_recommendation": "stay_exploratory" | "soft_buy" | "soft_exchange" | "strong_faq" | "strong_support",
    "evidence_accumulated": 0-5,
    "reference_resolution": {
      "refers_to": "last_shown_option" | "cheaper_option" | "previous_selection" | null,
      "resolved_id": "string" | null,
      "resolved_entity": { "brand": "string", "model": "string", "storage": "string" } | null
    },
    "last_asked_key": "budget_etb" | "model" | "condition" | "storage" | "old_phone_details" | null
  },
  "session": {
    "shown_options": ["prod_id1", "prod_id2"],
    "selected_option": { ... } | null,
    "collected_fields": { "budget_etb": 25000, "brand": "Samsung", ... },
    "active_product_id": "string" | null,
    "deep_link_context": { ... } | null
  },
  "constraints": {
    "brand": "string" | null,
    "model": "string" | null,
    "budget_etb": number | null,
    "storage": "string" | null,
    "condition": "string" | null
  }
}
```

## Output Schema
```json
{
  "result_mode": "single_match" | "two_options" | "alternatives" | "no_match_yet" | "notify_path" | "out_of_stock",
  "products": [
    {
      "id": "string",
      "brand": "string",
      "model": "string",
      "price_etb": number,
      "storage": "string",
      "ram": "string",
      "condition": "string",
      "stock_status": "in_stock" | "low_stock" | "out_of_stock"
    }
  ],
  "ranked_options": {
    "shown_options": ["id1", "id2", "id3"],
    "ranking_order": ["id1", "id2"],
    "cheaper_option_id": "string" | null
  },
  "selected_option_resolved": { ...full product object from above... } | null,
  "store_facts": {
    "location": "string",
    "hours": "string",
    "payment": "string",
    "warranty": "string",
    "delivery": "string",
    "policy": "string"
  },
  "exchange_validation": {
    "is_complete": true | false,
    "missing_fields": ["old_brand", "old_model", "condition"] | []
  },
  "notify_prepared": true | false,
  "handoff_prepared": true | false,
  "reference_applied": true | false,
  "resolver_reason": "string"
}
```

## Result Modes
- **single_match**: Exactly one product matches all constraints.
- **two_options**: Multiple products match; top two are prioritized for selection.
- **alternatives**: No direct match, but products with similar specs or slightly different price/storage are found.
- **no_match_yet**: Not enough constraints provided to perform a meaningful search.
- **notify_path**: No stock available for requested model; path prepared for notification signup.
- **out_of_stock**: Request specifically for out-of-stock items or confirmed inventory gap.

## Reference Resolution Logic
- use understanding reference_resolution + session shown_options
- resolve in this priority:
  - cheaper_option
  - last_shown_option
  - previous_selection
  - second one by ranking_order
- use exact IDs only
- no fuzzy matching
- if unresolved → reference_applied = false

## Exchange Validation
- required fields:
  - old_brand
  - old_model
  - condition
- storage optional
- is_complete only when required fields exist
- missing_fields should be deterministic

## Never Do
- never generate natural language
- never change route or next_action
- never hallucinate product data
- never trigger side effects directly
- never mutate session directly

## Notes
- keep resolver deterministic
- use Convex data only
- keep product ranking logic easy to debug
- return facts only, never reply text
- resolver_reason must always be set
