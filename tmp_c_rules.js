const input = $json ?? {};
const understanding = input.understanding_output && typeof input.understanding_output === 'object' ? input.understanding_output : {};
const event = input.event && typeof input.event === 'object' ? input.event : {};
const session = input.session && typeof input.session === 'object' ? input.session : {};

const messageFunction = typeof understanding.message_function === 'string' ? understanding.message_function : 'off_topic';
const businessIntent = typeof understanding.business_intent === 'string' ? understanding.business_intent : null;
const confidence = typeof understanding.confidence === 'number' ? understanding.confidence : 0;
const ambiguity = typeof understanding.ambiguity === 'number' ? understanding.ambiguity : 0;
const missingInformation = Array.isArray(understanding.missing_information)
  ? understanding.missing_information.filter((value) => typeof value === 'string').map((value) => value.trim().toLowerCase()).filter(Boolean)
  : [];
const referenceResolution = understanding.reference_resolution && typeof understanding.reference_resolution === 'object'
  ? understanding.reference_resolution
  : {};
const hasResolvedReference = Boolean(
  (typeof referenceResolution.resolved_id === 'string' && referenceResolution.resolved_id.trim())
  || (typeof referenceResolution.refers_to === 'string' && referenceResolution.refers_to.trim())
);
const currentInterest = session.flow_context?.buy_flow?.current_interest ?? null;
const hasActiveProductContext = Boolean(
  currentInterest && (typeof currentInterest !== 'object' || currentInterest.id || currentInterest.model || currentInterest.phoneType || currentInterest.brand)
);
const isStartEvent = event.event_type === 'start_reset' || event.event_type === 'deep_link_start';
const coreProductFieldsMissing = missingInformation.includes('model') || missingInformation.includes('brand');
const shouldClarifyUnderspecifiedProduct =
  businessIntent === 'product_search'
  && ['fresh_request', 'refinement'].includes(messageFunction)
  && coreProductFieldsMissing
  && !hasResolvedReference
  && !hasActiveProductContext;
const shouldClarifyUnderspecifiedExchange =
  businessIntent === 'exchange'
  && missingInformation.length > 0;

const isStoreInfoRequest = messageFunction === 'info_request' && businessIntent === 'store_info';
let should_call_resolver = false;
let reply_mode = 'small_talk_redirect';
let next_action = 'redirect_to_business';
let handoff_needed = false;

if (isStoreInfoRequest) {
  reply_mode = 'business_resolve';
  should_call_resolver = false;
  next_action = 'provide_info';
} else if (isStartEvent) {
  reply_mode = 'small_talk_redirect';
  should_call_resolver = false;
  next_action = 'greet_or_redirect';
} else if (messageFunction === 'acknowledgment') {
  reply_mode = 'small_talk_redirect';
  should_call_resolver = false;
  next_action = 'greet_or_redirect';
} else if (messageFunction === 'info_request') {
  reply_mode = 'business_resolve';
  should_call_resolver = true;
  next_action = 'provide_info';
} else if (messageFunction === 'negotiation') {
  reply_mode = 'business_resolve';
  should_call_resolver = true;
  next_action = 'handle_negotiation';
} else if (messageFunction === 'refinement' || messageFunction === 'fresh_request') {
  reply_mode = 'business_resolve';
  should_call_resolver = true;
  next_action = 'process_request';
} else {
  reply_mode = 'small_talk_redirect';
  should_call_resolver = false;
  next_action = 'redirect_to_business';
}

if ((ambiguity > 0.5 && confidence < 0.5) || messageFunction === 'clarification' || shouldClarifyUnderspecifiedProduct || shouldClarifyUnderspecifiedExchange) {
  reply_mode = 'clarify_reference';
  should_call_resolver = false;
  next_action = 'ask_clarification';
}

if (confidence < 0.3 && ambiguity > 0.8) {
  handoff_needed = true;
  reply_mode = 'handoff_admin';
  should_call_resolver = false;
  next_action = 'escalate_to_human';
}

const referredTo = typeof referenceResolution.refers_to === 'string' && referenceResolution.refers_to.trim()
  ? referenceResolution.refers_to.trim()
  : null;

const newConstraints = understandingOutput.constraints || {};\nconst sessionConstraints = session.collected_constraints || {};\nconst product_context = {\n  brand: newConstraints.brand ?? sessionConstraints.brand ?? null,\n  model: referredTo ?? newConstraints.model ?? sessionConstraints.model ?? null,\n  storage: newConstraints.storage ?? sessionConstraints.storage ?? null,\n  condition: newConstraints.condition ?? sessionConstraints.condition ?? null,\n  budget_etb: newConstraints.budget_etb ?? sessionConstraints.budget_etb ?? null,\n};

const resolver_input = should_call_resolver ? {
  product_context,
  missing_fields: missingInformation,
} : null;

const rules_output = {
  should_call_resolver,
  reply_mode,
  handoff_needed,
  next_action,
  confidence,
  resolver_input,
};

return [{
  json: {
    ...input,
    rules_output,
  },
}];