# Rules Layer

## Purpose
- this layer is deterministic
- it comes after Understanding AI + validation
- it converts meaning into safe system decisions
- it does not generate natural language
- it must stay simple and not become a spider-web

## Position in v2 Flow
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

## Responsibilities
- handle callback/deep-link/start events deterministically
- apply progressive locking
- preserve short follow-up continuity
- prevent repeated questions using last_asked_key
- detect FAQ/support overrides
- trigger handoff when needed
- trigger notify when needed
- decide whether resolver is required
- decide reply_mode
- never generate natural language
- never query business data directly
- never act like AI

## Rule Priority
1. deterministic events (callback, start, deep-link)
2. invalid or weak understanding → clarification fallback
3. short refinement → inherit existing context
4. clear FAQ/support → direct answer mode
5. strong signals → soft route
6. repeated evidence → hard lock flow
7. repeated question prevention
8. handoff trigger
9. notify trigger
10. default → exploratory

## Output Schema
```json
{
  "event_type": "text_message" | "callback_action" | "start_reset" | "deep_link_start",
  "resolved_flow": "buy" | "exchange" | "faq" | "support" | "none",
  "tentative_flow": "buy_soft" | "exchange_soft" | "faq" | "support" | "none",
  "route_locked": true | false,
  "next_action": "clarify" | "ask_one_thing" | "suggest_options" | "answer_direct" | "push_to_mini_app" | "handoff" | "notify_me",
  "reply_mode": "neutral_clarify" | "exploratory_question" | "direct_answer" | "suggest_options" | "confirm_selection" | "handoff_notice" | "notify_confirmation",
  "handoff_triggered": true | false,
  "notify_triggered": true | false,
  "resolver_needed": true | false,
  "selected_option": "string" | null,
  "last_asked_key": "budget_etb" | "model" | "condition" | "storage" | "old_phone_details" | null,
  "decision_reason": "string"
}
```

## Implementation Rules
- implement as one single Code node
- use flat sequential if/else logic
- no nested branching chaos
- always set decision_reason
- reply model must not override these decisions

## Notes
- keep max ~10 rule blocks
- use this layer as decision bridge, not text generator
- keep it debuggable
- if unclear, fall back safely
