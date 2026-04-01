# Rules Layer Code Node

## Purpose
- This is the implementation of the Deterministic Rules Layer in n8n
- It runs after Understanding AI and validation
- It converts structured meaning into a safe decision object
- It does NOT generate natural language

## Usage
- This code is meant to be pasted into an n8n Code node
- Input:
  - $json (understanding output)
  - $json.session (session data)
  - $json.event_type, $json.message, $json.callback_query
- Output:
  - rules_decision object added to $json

## Code
```javascript
const input = $json;
const session = input.session || {};
const eventType = input.event_type || "text_message";
const message = input.message || {};
const callbackQuery = input.callback_query || null;
const deepLink = input.deep_link || null;

// Understanding output lives at root $json
const understanding = {
  user_need: input.user_need ?? "clarification",
  next_action: input.next_action ?? "clarify",
  tentative_flow: input.tentative_flow ?? "none",
  confidence: typeof input.confidence === "number" ? input.confidence : 0,
  ambiguity: typeof input.ambiguity === "number" ? input.ambiguity : 1,
  missing_information: Array.isArray(input.missing_information) ? input.missing_information : [],
  route_recommendation: input.route_recommendation ?? "stay_exploratory",
  evidence_accumulated: Number.isInteger(input.evidence_accumulated) ? input.evidence_accumulated : 0,
  reference_resolution: input.reference_resolution || {
    refers_to: null,
    resolved_id: null,
    resolved_entity: null,
  },
  last_asked_key: input.last_asked_key ?? null,
};

const text = (message.text || "").trim().toLowerCase();
const sessionResolvedFlow = session.resolved_flow || "none";
const sessionTentativeFlow = session.tentative_flow || "none";
const sessionSelectedOption = session.selected_option || null;
const shownOptions = Array.isArray(session.shown_options) ? session.shown_options : [];
const sessionLastAskedKey = session.last_asked_key || null;
const sessionEvidence = Number.isInteger(session.evidence_accumulated) ? session.evidence_accumulated : 0;
const errorCount = Number.isInteger(session.error_count) ? session.error_count : 0;

// Output shell
let decision = {
  event_type: eventType,
  resolved_flow: sessionResolvedFlow,
  tentative_flow: understanding.tentative_flow || sessionTentativeFlow || "none",
  route_locked: sessionResolvedFlow !== "none",
  next_action: understanding.next_action || "clarify",
  reply_mode: "exploratory_question",
  handoff_triggered: false,
  notify_triggered: false,
  resolver_needed: true,
  selected_option: sessionSelectedOption ? sessionSelectedOption.id || sessionSelectedOption : null,
  last_asked_key: understanding.last_asked_key || sessionLastAskedKey || null,
  decision_reason: "default_initialization",
};

// Helpers
const hasStrongBuySignal = () => {
  const buyWords = ["buy", "new phone", "adis", "phone felige", "slk falige", "iphone", "samsung"];
  return buyWords.some(w => text.includes(w));
};

const hasStrongExchangeSignal = () => {
  const exchangeWords = ["exchange", "swap", "trade in", "ልውውጥ", "ቀይረ", "ቀያየር"];
  return exchangeWords.some(w => text.includes(w)) || understanding.user_need === "exchange_inquiry";
};

const hasFaqSignal = () => {
  const faqWords = [
    "where", "location", "address", "yet", "agegnachu",
    "warranty", "delivery", "payment", "hours", "policy",
    "አድራሻ", "የት", "ዋስትና", "ክፍያ", "ዴሊቨሪ"
  ];
  return faqWords.some(w => text.includes(w)) || understanding.tentative_flow === "faq";
};

const hasSupportSignal = () => {
  const supportWords = [
    "problem", "issue", "order", "delayed", "help",
    "ችግር", "order", "support"
  ];
  return supportWords.some(w => text.includes(w)) || understanding.tentative_flow === "support";
};

const isShortRefinement = () => {
  const refinementWords = [
    "128gb", "8/128", "8gb", "black", "last price", "cheaper",
    "that one", "second one", "first one", "version",
    "ጥቁር", "ያ", "ሁለተኛ", "ዋጋ"
  ];
  return (
    text.length > 0 &&
    (
      refinementWords.some(w => text.includes(w)) ||
      understanding.reference_resolution?.refers_to !== null
    )
  );
};

const wantsHuman = () => {
  const words = ["human", "admin", "owner", "person", "talk to", "ሰው", "አድሚን"];
  return words.some(w => text.includes(w));
};

// 1. Deterministic events first
if (eventType === "start_reset") {
  decision = {
    ...decision,
    resolved_flow: "none",
    tentative_flow: "none",
    route_locked: false,
    next_action: "clarify",
    reply_mode: "neutral_clarify",
    resolver_needed: false,
    selected_option: null,
    last_asked_key: null,
    decision_reason: "start_reset_event",
  };
}
else if (eventType === "deep_link_start") {
  decision = {
    ...decision,
    resolved_flow: "buy",
    tentative_flow: "buy_soft",
    route_locked: false,
    next_action: "suggest_options",
    reply_mode: "suggest_options",
    resolver_needed: true,
    decision_reason: "deep_link_start_event",
  };
}
else if (eventType === "callback_action") {
  const action = callbackQuery?.data || callbackQuery?.action || "unknown_callback";

  if (String(action).includes("select_option")) {
    decision = {
      ...decision,
      resolved_flow: sessionResolvedFlow === "none" ? "buy" : sessionResolvedFlow,
      tentative_flow: "buy_soft",
      route_locked: true,
      next_action: "suggest_options",
      reply_mode: "confirm_selection",
      resolver_needed: true,
      decision_reason: "callback_select_option",
    };
  } else if (String(action).includes("confirm_order")) {
    decision = {
      ...decision,
      resolved_flow: "buy",
      tentative_flow: "buy_soft",
      route_locked: true,
      next_action: "answer_direct",
      reply_mode: "confirm_selection",
      resolver_needed: true,
      decision_reason: "callback_confirm_order",
    };
  } else if (String(action).includes("change_option")) {
    decision = {
      ...decision,
      resolved_flow: "buy",
      tentative_flow: "buy_soft",
      route_locked: true,
      next_action: "suggest_options",
      reply_mode: "suggest_options",
      resolver_needed: true,
      decision_reason: "callback_change_option",
    };
  } else if (String(action).includes("notify")) {
    decision = {
      ...decision,
      notify_triggered: true,
      next_action: "notify_me",
      reply_mode: "notify_confirmation",
      resolver_needed: false,
      decision_reason: "callback_notify_me",
    };
  } else if (String(action).includes("admin") || String(action).includes("handoff")) {
    decision = {
      ...decision,
      handoff_triggered: true,
      next_action: "handoff",
      reply_mode: "handoff_notice",
      resolver_needed: false,
      decision_reason: "callback_admin_handoff",
    };
  } else {
    decision = {
      ...decision,
      next_action: "clarify",
      reply_mode: "neutral_clarify",
      resolver_needed: false,
      decision_reason: "callback_unknown_safe_fallback",
    };
  }
}

// 2. Invalid or weak understanding fallback
else if (understanding.confidence < 0.7 || understanding.ambiguity > 0.4) {
  decision = {
    ...decision,
    resolved_flow: "none",
    tentative_flow: "none",
    route_locked: false,
    next_action: "clarify",
    reply_mode: "neutral_clarify",
    resolver_needed: false,
    last_asked_key: null,
    decision_reason: "weak_understanding_fallback",
  };
}

// 3. Short refinement inherits existing context
else if (isShortRefinement() && sessionResolvedFlow === "buy") {
  decision = {
    ...decision,
    resolved_flow: "buy",
    tentative_flow: "buy_soft",
    route_locked: true,
    next_action: understanding.next_action === "answer_direct" ? "answer_direct" : "suggest_options",
    reply_mode: "suggest_options",
    resolver_needed: true,
    selected_option: understanding.reference_resolution?.resolved_id || decision.selected_option,
    decision_reason: "short_buy_refinement_inherited",
  };
}
else if (isShortRefinement() && sessionResolvedFlow === "exchange") {
  decision = {
    ...decision,
    resolved_flow: "exchange",
    tentative_flow: "exchange_soft",
    route_locked: true,
    next_action: "ask_one_thing",
    reply_mode: "exploratory_question",
    resolver_needed: true,
    decision_reason: "short_exchange_refinement_inherited",
  };
}

// 4. FAQ/support override
else if (hasFaqSignal()) {
  decision = {
    ...decision,
    resolved_flow: "faq",
    tentative_flow: "faq",
    route_locked: true,
    next_action: "answer_direct",
    reply_mode: "direct_answer",
    resolver_needed: true,
    last_asked_key: null,
    decision_reason: "faq_override",
  };
}
else if (hasSupportSignal()) {
  decision = {
    ...decision,
    resolved_flow: "support",
    tentative_flow: "support",
    route_locked: true,
    next_action: "answer_direct",
    reply_mode: "direct_answer",
    resolver_needed: true,
    last_asked_key: null,
    decision_reason: "support_override",
  };
}

// 5. Strong signals → soft route
else if (hasStrongExchangeSignal()) {
  decision = {
    ...decision,
    resolved_flow: "none",
    tentative_flow: "exchange_soft",
    route_locked: false,
    next_action: understanding.next_action || "ask_one_thing",
    reply_mode: "exploratory_question",
    resolver_needed: true,
    decision_reason: "strong_exchange_soft_route",
  };
}
else if (hasStrongBuySignal() || understanding.tentative_flow === "buy_soft") {
  decision = {
    ...decision,
    resolved_flow: "none",
    tentative_flow: "buy_soft",
    route_locked: false,
    next_action: understanding.next_action || "ask_one_thing",
    reply_mode: understanding.next_action === "suggest_options" ? "suggest_options" : "exploratory_question",
    resolver_needed: true,
    decision_reason: "strong_buy_soft_route",
  };
}

// 6. Repeated evidence → hard lock
if (
  decision.resolved_flow === "none" &&
  understanding.confidence >= 0.85 &&
  understanding.ambiguity <= 0.25 &&
  (understanding.evidence_accumulated >= 2 || sessionEvidence >= 2)
) {
  if (decision.tentative_flow === "buy_soft") {
    decision.resolved_flow = "buy";
    decision.route_locked = true;
    decision.decision_reason = "hard_lock_buy_by_evidence";
  } else if (decision.tentative_flow === "exchange_soft") {
    decision.resolved_flow = "exchange";
    decision.route_locked = true;
    decision.decision_reason = "hard_lock_exchange_by_evidence";
  } else if (decision.tentative_flow === "faq") {
    decision.resolved_flow = "faq";
    decision.route_locked = true;
    decision.decision_reason = "hard_lock_faq_by_evidence";
  } else if (decision.tentative_flow === "support") {
    decision.resolved_flow = "support";
    decision.route_locked = true;
    decision.decision_reason = "hard_lock_support_by_evidence";
  }
}

// 7. Repeated question prevention
if (
  decision.next_action === "ask_one_thing" &&
  decision.last_asked_key &&
  sessionLastAskedKey &&
  decision.last_asked_key === sessionLastAskedKey &&
  understanding.missing_information.length === 0
) {
  decision.next_action = "clarify";
  decision.reply_mode = "neutral_clarify";
  decision.last_asked_key = null;
  decision.decision_reason = "prevent_repeated_question";
}

// 8. Handoff trigger
if (wantsHuman() || errorCount >= 3) {
  decision.handoff_triggered = true;
  decision.next_action = "handoff";
  decision.reply_mode = "handoff_notice";
  decision.resolver_needed = false;
  decision.decision_reason = wantsHuman() ? "explicit_handoff_request" : "error_threshold_handoff";
}

// 9. Notify trigger
if (decision.next_action === "notify_me") {
  decision.notify_triggered = true;
  decision.reply_mode = "notify_confirmation";
  decision.resolver_needed = false;
  decision.decision_reason = "notify_triggered_by_decision";
}

// 10. Default exploratory fallback
if (!decision.decision_reason || decision.decision_reason === "default_initialization") {
  decision = {
    ...decision,
    resolved_flow: "none",
    tentative_flow: "none",
    route_locked: false,
    next_action: "clarify",
    reply_mode: "neutral_clarify",
    resolver_needed: false,
    decision_reason: "default_exploratory_fallback",
  };
}

return [{ json: { ...input, rules_decision: decision } }];
```

## Notes
- Keep logic flat (no nested complexity)
- Always set decision_reason
- This node must not generate text
- Reply AI must follow this decision strictly
- This is the core decision engine of the bot
