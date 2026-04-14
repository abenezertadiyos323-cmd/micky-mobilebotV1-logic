const input = $json ?? {};
const event = input.event && typeof input.event === 'object' ? input.event : {};
const session = input.session && typeof input.session === 'object' ? input.session : {};
const client_config = input.client_config && typeof input.client_config === 'object' ? input.client_config : {};
const understanding_output = input.understanding_output && typeof input.understanding_output === 'object' ? input.understanding_output : {};
const understanding_meta = input.understanding_meta && typeof input.understanding_meta === 'object' ? input.understanding_meta : {};

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizeNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const normalizePositiveNumber = (value) => {
  const numeric = normalizeNullableNumber(value);
  return numeric !== null && numeric > 0 ? numeric : null;
};
const normalizeStringArray = (value) => Array.isArray(value)
  ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
  : [];
const normalizeProduct = (value, index) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    return { id: String(value), brand: null, model: null, storage: null, condition: null, price_etb: null, name: String(value), raw: value, index };
  }
  if (!isRecord(value)) return null;
  const priceValue = value.price_etb ?? value.price ?? value.amount ?? null;
  return {
    id: String(value.id ?? value.product_id ?? value.sku ?? ('product_' + index)),
    brand: normalizeText(value.brand),
    model: normalizeText(value.model ?? value.name ?? value.title),
    storage: normalizeText(value.storage),
    condition: normalizeText(value.condition),
    price_etb: normalizeNullableNumber(priceValue),
    name: [value.brand, value.model].filter(Boolean).join(' ').trim() || normalizeText(value.name ?? value.title),
    raw: value,
    index,
  };
};

const shownProducts = Array.isArray(session.flow_context?.buy_flow?.shown_products)
  ? session.flow_context.buy_flow.shown_products.map(normalizeProduct).filter(Boolean)
  : [];
const currentInterest = normalizeProduct(session.flow_context?.buy_flow?.current_interest, shownProducts.length + 1);
const currentFlow = session.conversation_state?.current_flow ?? null;
const currentTopic = session.conversation_state?.current_topic ?? null;
const existingConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const mergedConstraints = {
  budget_etb: normalizePositiveNumber(existingConstraintsSource.budget_etb),
  brand: normalizeText(existingConstraintsSource.brand ?? currentInterest?.brand ?? null),
  model: normalizeText(existingConstraintsSource.model ?? currentInterest?.model ?? null),
  storage: normalizeText(existingConstraintsSource.storage ?? currentInterest?.storage ?? null),
  condition: normalizeText(existingConstraintsSource.condition ?? currentInterest?.condition ?? null),
};

const referenceSource = isRecord(understanding_output.reference_resolution) ? understanding_output.reference_resolution : {};
const reference_resolution = {
  reference_type: normalizeText(referenceSource.refers_to) ?? 'none',
  resolved: Boolean(normalizeText(referenceSource.resolved_id)),
  resolved_product_id: normalizeText(referenceSource.resolved_id),
  resolved_product_name: null,
};
const resolveProductById = (id) => shownProducts.find((item) => item.id === id) ?? (currentInterest?.id === id ? currentInterest : null) ?? null;
const resolvedProduct = reference_resolution.resolved && reference_resolution.resolved_product_id
  ? resolveProductById(reference_resolution.resolved_product_id)
  : null;

const businessIntent = normalizeText(understanding_output.business_intent);
const messageFunction = normalizeText(understanding_output.message_function) ?? 'clarification';
const understandingTopic = normalizeText(understanding_output.topic);
const confidence = typeof understanding_output.confidence === 'number' ? understanding_output.confidence : 0;
const missingInformation = normalizeStringArray(understanding_output.missing_information);
const requestedLastAskedKey = normalizeText(understanding_output.last_asked_key);
const hasActiveContext = Boolean(
  currentFlow
  || currentTopic
  || shownProducts.length > 0
  || currentInterest
  || Object.values(mergedConstraints).some((value) => value !== null)
  || (Array.isArray(session.conversation_history) && session.conversation_history.length > 0)
);
const intentFlow = {
  product_search: 'buy',
  pricing: 'buy',
  exchange: 'exchange',
  store_info: 'info',
  support: 'support',
}[businessIntent ?? ''] ?? null;
const sameFlowIntent = Boolean(
  (currentFlow === 'buy' && ['product_search', 'pricing'].includes(businessIntent ?? ''))
  || (currentFlow === 'exchange' && businessIntent === 'exchange')
  || (currentFlow === 'info' && businessIntent === 'store_info')
  || (currentFlow === 'support' && businessIntent === 'support')
);
const extractModelFromText = (text) => {
  if (typeof text !== 'string') return null;
  const m = text.match(/\b(?:iphone\s*\d+(?:\s*(?:pro\s*max|pro|max|plus|mini))?|samsung\s*[a-z0-9]+(?:\s+[a-z0-9]+)?|pixel\s*[a-z0-9]+|redmi\s*[a-z0-9]+)\b/i);
  return m ? m[0].trim().toLowerCase() : null;
};
const rawTextModel = extractModelFromText(event.text ?? '');
const sessionModelLower = (currentInterest?.model ?? mergedConstraints.model ?? '').toLowerCase() || null;
const isModelSwitch = Boolean(
  rawTextModel
  && sessionModelLower
  && !rawTextModel.includes(sessionModelLower)
  && !sessionModelLower.includes(rawTextModel)
);
const shouldContinueContext = Boolean(
  hasActiveContext && !isModelSwitch && (
    ['refinement', 'negotiation'].includes(messageFunction)
    || reference_resolution.reference_type !== 'none'
    || sameFlowIntent
  )
);
const effectiveFlow = intentFlow ?? currentFlow ?? null;
const effectiveTopic = understandingTopic ?? (shouldContinueContext ? currentTopic ?? null : null);
const hasKnownBudget = mergedConstraints.budget_etb !== null;
const hasKnownBrand = Boolean(mergedConstraints.brand);
const hasKnownModel = Boolean(mergedConstraints.model);
const hasProductContext = Boolean(
  resolvedProduct
  || currentInterest
  || shownProducts.length > 0
  || hasKnownBudget
  || hasKnownBrand
  || hasKnownModel
);

const computedMissingFields = [];
if (effectiveFlow === 'buy' && missingInformation.length === 0) {
  const needFreshProductAnchor = !hasProductContext && !shouldContinueContext;
  if (needFreshProductAnchor) {
    if (hasKnownBrand && !hasKnownModel) computedMissingFields.push('model');
    else if (!hasKnownBrand && !hasKnownModel) computedMissingFields.push('brand_or_model');
  }
}
if (effectiveFlow === 'exchange' && missingInformation.length === 0) {
  const needProductAnchor = !currentInterest && shownProducts.length === 0;
  if (needProductAnchor) {
    if (hasKnownBrand && !hasKnownModel) computedMissingFields.push('model');
    else if (!hasKnownBrand && !hasKnownModel) computedMissingFields.push('brand_or_model');
  }
  if (!mergedConstraints.condition) computedMissingFields.push('condition');
}
const missing_fields = missingInformation.length > 0 ? missingInformation.slice() : computedMissingFields;
if (effectiveFlow === 'exchange' && !mergedConstraints.condition && !missing_fields.includes('condition')) {
  missing_fields.push('condition');
}
if (effectiveFlow === 'exchange' && missing_fields.length > 2) {
  missing_fields.length = 2;
}
const last_asked_key = requestedLastAskedKey ?? missing_fields[0] ?? null;

const productContext = {
  brand: mergedConstraints.brand,
  model: mergedConstraints.model,
  storage: mergedConstraints.storage,
  condition: mergedConstraints.condition,
  budget_etb: mergedConstraints.budget_etb,
  current_interest: currentInterest ? currentInterest.raw : null,
  current_topic: currentTopic,
  current_flow: currentFlow,
};

let rules_output = {
  reply_mode: shouldContinueContext ? 'resume_previous_flow' : 'off_topic_redirect',
  should_call_resolver: false,
  resolver_input: {
    flow: effectiveFlow,
    product_context: productContext,
    missing_fields,
    resolved_reference: resolvedProduct ? { id: resolvedProduct.id, raw: resolvedProduct.raw } : null,
    resolved_product_name: resolvedProduct?.name ?? null,
  },
  session_update: {
    last_topic: effectiveTopic,
    flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : effectiveFlow,
    ambiguous_reference: reference_resolution.reference_type !== 'none' ? reference_resolution.reference_type : null,
    resolved_ambiguity: reference_resolution.resolved,
    collected_constraints: mergedConstraints,
    last_asked_key,
  },
  confidence,
  reasoning: shouldContinueContext ? 'default_resume_previous_flow' : 'default_off_topic_redirect',
};

if (event.event_type === 'start_reset') {
  rules_output = {
    ...rules_output,
    reply_mode: 'small_talk_redirect',
    should_call_resolver: false,
    session_update: {
      ...rules_output.session_update,
      last_topic: null,
      flow_stage: null,
      ambiguous_reference: null,
      resolved_ambiguity: false,
      last_asked_key: null,
    },
    reasoning: 'start_reset_welcome',
  };
} else if (event.event_type === 'deep_link_start') {
  rules_output = {
    ...rules_output,
    reply_mode: 'business_resolve',
    should_call_resolver: true,
    resolver_input: {
      ...rules_output.resolver_input,
      flow: 'buy',
      missing_fields: [],
    },
    session_update: {
      ...rules_output.session_update,
      last_topic: 'product',
      flow_stage: 'buy',
      last_asked_key: null,
    },
    reasoning: 'deep_link_start_business_entry',
  };
} else if (!Number.isFinite(confidence) || confidence < 0.6) {
  rules_output = {
    ...rules_output,
    reply_mode: shouldContinueContext && currentFlow ? 'resume_previous_flow' : 'handoff_admin',
    should_call_resolver: Boolean(shouldContinueContext && currentFlow),
    reasoning: shouldContinueContext && currentFlow ? 'low_confidence_but_context_preserved' : 'low_understanding_confidence',
  };
} else if (messageFunction === 'acknowledgment') {
  const shouldOpenLightConversation = Boolean(
    Number(session.message_count ?? 0) === 0
    && !currentFlow
    && !currentTopic
    && shownProducts.length === 0
    && !currentInterest
    && !Object.values(mergedConstraints).some((value) => value !== null)
  );
  rules_output = {
    ...rules_output,
    reply_mode: shouldOpenLightConversation ? 'small_talk_redirect' : 'acknowledge_and_close',
    should_call_resolver: false,
    reasoning: shouldOpenLightConversation ? 'acknowledgment_first_turn_redirect' : 'acknowledgment_detected',
  };
} else if (messageFunction === 'clarification') {
  rules_output = {
    ...rules_output,
    reply_mode: hasActiveContext ? 'clarify_reference' : 'handoff_admin',
    should_call_resolver: false,
    reasoning: hasActiveContext ? 'clarification_with_existing_context' : 'clarification_without_context',
  };
} else if (businessIntent === 'store_info' || understandingTopic === 'store_info' || understandingTopic === 'location' || (messageFunction === 'info_request' && (businessIntent === null || businessIntent === 'store_info'))) {
  rules_output = {
    ...rules_output,
    reply_mode: 'business_resolve',
    should_call_resolver: true,
    resolver_input: {
      ...rules_output.resolver_input,
      flow: 'info',
      missing_fields: [],
    },
    session_update: {
      ...rules_output.session_update,
      last_topic: understandingTopic ?? 'store_info',
      flow_stage: shouldContinueContext ? (currentFlow ?? null) : 'info',
      last_asked_key: null,
    },
    reasoning: 'store_info_bypasses_product_flow',
  };
} else if (businessIntent === 'support') {
  rules_output = {
    ...rules_output,
    reply_mode: shouldContinueContext && currentFlow ? 'resume_previous_flow' : 'business_resolve',
    should_call_resolver: true,
    resolver_input: {
      ...rules_output.resolver_input,
      flow: 'support',
      missing_fields: [],
    },
    session_update: {
      ...rules_output.session_update,
      last_topic: understandingTopic ?? 'support',
      flow_stage: shouldContinueContext ? (currentFlow ?? 'support') : 'support',
      last_asked_key: null,
    },
    reasoning: 'support_request_routed',
  };
} else if (messageFunction === 'negotiation') {
  const negotiationFlow = currentFlow === 'exchange' ? 'exchange' : (intentFlow ?? currentFlow ?? 'buy');
  const hasAnchoredContext = Boolean(
    session.flow_context?.buy_flow?.current_interest
  );
  rules_output = {
    ...rules_output,
    reply_mode: hasAnchoredContext ? 'resume_previous_flow' : 'business_resolve',
    should_call_resolver: hasAnchoredContext ? false : true,
    resolver_input: {
      ...rules_output.resolver_input,
      flow: negotiationFlow,
      missing_fields: [],
    },
    session_update: {
      ...rules_output.session_update,
      flow_stage: negotiationFlow,
      last_asked_key: null,
    },
    reasoning: hasAnchoredContext
      ? 'negotiation_anchored_to_existing_interest'
      : (hasProductContext || hasActiveContext ? 'negotiation_business_resolve_with_context' : 'negotiation_business_resolve_without_context'),
  };
} else if (messageFunction === 'refinement') {
  if (!shouldContinueContext) {
    rules_output.resolver_input.product_context = { budget_etb: mergedConstraints.budget_etb, brand: null, model: null, storage: null, condition: null, current_interest: null, current_topic: null, current_flow: null };
    rules_output.session_update.collected_constraints = { budget_etb: mergedConstraints.budget_etb, brand: null, model: null, storage: null, condition: null };
    rules_output.resolver_input.resolved_reference = null;
  }
  rules_output = {
    ...rules_output,
    reply_mode: shouldContinueContext ? 'resume_previous_flow' : 'business_resolve',
    should_call_resolver: true,
    session_update: {
      ...rules_output.session_update,
      flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : effectiveFlow,
      last_asked_key,
    },
    reasoning: shouldContinueContext ? 'refinement_reuses_session_context' : 'refinement_with_model_switch',
  };
} else if (messageFunction === 'fresh_request') {
  const isBusiness = businessIntent !== null;
  if (isBusiness) {
    rules_output.resolver_input.product_context = { budget_etb: null, brand: null, model: null, storage: null, condition: null, current_interest: null, current_topic: null, current_flow: null };
    rules_output.session_update.collected_constraints = { budget_etb: null, brand: null, model: null, storage: null, condition: null };
    rules_output.resolver_input.resolved_reference = null;
  }

  // GUARD: Ask which phone if intent is buy/pricing but no product info collected
  const hasProductContext = Boolean(
    mergedConstraints.brand ||
    mergedConstraints.model ||
    mergedConstraints.phoneType ||
    productContext.brand ||
    productContext.model ||
    productContext.phoneType ||
    resolvedProduct
  );
  const isBuyOrPricingIntent = isBusiness && (intentFlow === 'buy' || effectiveFlow === 'buy' || businessIntent === 'pricing');

  if (isBuyOrPricingIntent && !hasProductContext && missing_fields.length === 0) {
    rules_output = {
      ...rules_output,
      reply_mode: 'clarify_reference',
      should_call_resolver: false,
      resolver_input: {
        ...rules_output.resolver_input,
        flow: intentFlow ?? effectiveFlow,
        missing_fields: ['phoneType'],
      },
      session_update: {
        ...rules_output.session_update,
        flow_stage: intentFlow ?? effectiveFlow,
        last_asked_key: 'phoneType',
      },
      reasoning: 'no_product_context_needs_clarification',
    };
  } else {
    rules_output = {
      ...rules_output,
      reply_mode: isBusiness ? 'business_resolve' : 'off_topic_redirect',
      should_call_resolver: isBusiness,
      resolver_input: {
        ...rules_output.resolver_input,
        flow: intentFlow ?? effectiveFlow,
      },
      session_update: {
        ...rules_output.session_update,
        flow_stage: intentFlow ?? effectiveFlow,
        last_asked_key,
      },
      reasoning: isBusiness ? 'fresh_business_request' : 'fresh_non_business_message',
    };
  }
}

return [{ json: { event, session, client_config, understanding_output, understanding_meta, rules_output } }];