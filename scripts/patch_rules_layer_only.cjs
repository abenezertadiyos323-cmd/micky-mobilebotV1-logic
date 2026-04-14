const fs = require("fs");

const workflowPath = "workflow.json";
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
const node = workflow.nodes.find((item) => item.name === "Rules Layer");

if (!node) {
  throw new Error("Rules Layer not found");
}

node.parameters.jsCode = `const input = $json ?? {};
const event = input.event && typeof input.event === 'object' ? input.event : {};
const session = input.session && typeof input.session === 'object' ? input.session : {};
const client_config = input.client_config && typeof input.client_config === 'object' ? input.client_config : {};
const understanding_output = input.understanding_output && typeof input.understanding_output === 'object' ? input.understanding_output : {};
const understanding_meta = input.understanding_meta && typeof understanding_meta === 'object' ? input.understanding_meta : {};

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizeNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
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
const existingConstraints = {
  budget_etb: normalizeNullableNumber(existingConstraintsSource.budget_etb),
  brand: normalizeText(existingConstraintsSource.brand ?? currentInterest?.brand ?? null),
  model: normalizeText(existingConstraintsSource.model ?? currentInterest?.model ?? null),
  storage: normalizeText(existingConstraintsSource.storage ?? currentInterest?.storage ?? null),
  condition: normalizeText(existingConstraintsSource.condition ?? currentInterest?.condition ?? null),
};

const constraintsUpdateSource = isRecord(understanding_output.constraints_update) ? understanding_output.constraints_update : {};
const constraints_update = {
  budget_etb: normalizeNullableNumber(constraintsUpdateSource.budget_etb),
  brand: normalizeText(constraintsUpdateSource.brand),
  model: normalizeText(constraintsUpdateSource.model),
  storage: normalizeText(constraintsUpdateSource.storage),
  condition: normalizeText(constraintsUpdateSource.condition),
};
const mergedConstraints = {
  budget_etb: constraints_update.budget_etb ?? existingConstraints.budget_etb,
  brand: constraints_update.brand ?? existingConstraints.brand,
  model: constraints_update.model ?? existingConstraints.model,
  storage: constraints_update.storage ?? existingConstraints.storage,
  condition: constraints_update.condition ?? existingConstraints.condition,
};

const referenceSource = isRecord(understanding_output.reference_resolution) ? understanding_output.reference_resolution : {};
const reference_resolution = {
  reference_type: normalizeText(referenceSource.reference_type) ?? 'none',
  resolved: Boolean(referenceSource.resolved),
  resolved_product_id: normalizeText(referenceSource.resolved_product_id),
  resolved_product_name: normalizeText(referenceSource.resolved_product_name),
};

const resolveProductById = (id) => shownProducts.find((item) => item.id === id) ?? (currentInterest?.id === id ? currentInterest : null) ?? null;
const resolvedProduct = reference_resolution.resolved && reference_resolution.resolved_product_id
  ? resolveProductById(reference_resolution.resolved_product_id)
  : null;

const flowFromIntent = {
  buy: 'buy',
  exchange: 'exchange',
  store_info: 'info',
  support: 'support',
  none: null,
};
const currentIntent = {
  buy: 'buy',
  exchange: 'exchange',
  info: 'store_info',
  support: 'support',
}[currentFlow] ?? 'none';

const intentFlow = flowFromIntent[understanding_output.business_intent ?? 'none'] ?? null;
const messageFunction = understanding_output.message_function ?? 'off_topic';
const contextRelation = understanding_output.context_relation ?? 'unclear';
const confidence = typeof understanding_output.confidence === 'number' ? understanding_output.confidence : 0;
const shouldReuseExistingContext = Boolean(understanding_output.should_reuse_existing_context);
const hasActiveContext = Boolean(
  currentFlow
  || currentTopic
  || shownProducts.length > 0
  || currentInterest
  || Object.values(existingConstraints).some((value) => value !== null)
  || (Array.isArray(session.conversation_history) && session.conversation_history.length > 0)
);
const shouldContinueContext = Boolean(
  hasActiveContext && (
    contextRelation !== 'new_topic'
    || shouldReuseExistingContext
    || ['follow_up', 'refinement', 'negotiation', 'ambiguous_reference'].includes(messageFunction)
  )
);
const effectiveFlow = intentFlow ?? currentFlow ?? null;
const effectiveTopic = understanding_output.topic === 'none'
  ? (shouldContinueContext ? currentTopic ?? null : null)
  : (understanding_output.topic ?? currentTopic ?? null);

const hasKnownBudget = mergedConstraints.budget_etb !== null;
const hasKnownBrand = Boolean(mergedConstraints.brand);
const hasKnownModel = Boolean(mergedConstraints.model);

const productContext = {
  brand: mergedConstraints.brand,
  model: mergedConstraints.model,
  storage: mergedConstraints.storage,
  condition: mergedConstraints.condition,
  budget_etb: mergedConstraints.budget_etb,
  current_interest: currentInterest ? currentInterest.raw : null,
  current_topic: currentTopic,
  current_flow: currentFlow,
  context_relation: contextRelation,
  should_reuse_existing_context: shouldReuseExistingContext,
  known_constraints_used: understanding_output.known_constraints_used ?? {
    budget_etb: existingConstraints.budget_etb,
    brand: existingConstraints.brand,
    model: existingConstraints.model,
  },
};
const hasProductContext = Boolean(
  resolvedProduct
  || reference_resolution.resolved
  || currentInterest
  || shownProducts.length > 0
  || hasKnownBrand
  || hasKnownModel
  || hasKnownBudget
);

const missing_fields = [];
if (effectiveFlow === 'buy') {
  const needFreshProductAnchor = !hasProductContext && !shouldContinueContext;
  if (needFreshProductAnchor) {
    if (hasKnownBrand && !hasKnownModel) missing_fields.push('model');
    else if (!hasKnownBrand && !hasKnownModel) missing_fields.push('brand_or_model');
  }
}
if (effectiveFlow === 'exchange' && !currentInterest && shownProducts.length === 0 && !mergedConstraints.condition) {
  missing_fields.push('condition');
}
const last_asked_key = missing_fields[0] ?? null;

let rules_output = {
  reply_mode: shouldContinueContext ? 'resume_previous_flow' : 'off_topic_redirect',
  should_call_resolver: false,
  resolver_input: {
    flow: effectiveFlow,
    product_context: productContext,
    missing_fields,
    resolved_reference: resolvedProduct ? { id: resolvedProduct.id, raw: resolvedProduct.raw } : null,
    resolved_product_name: reference_resolution.resolved_product_name ?? ([productContext.brand, productContext.model].filter(Boolean).join(' ').trim() || null),
  },
  session_update: {
    last_topic: effectiveTopic,
    flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : effectiveFlow,
    ambiguous_reference: reference_resolution.reference_type !== 'none' ? reference_resolution.reference_type : null,
    resolved_ambiguity: Boolean(reference_resolution.resolved),
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
      last_topic: 'product_search',
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
  rules_output = {
    ...rules_output,
    reply_mode: 'acknowledge_and_close',
    should_call_resolver: false,
    reasoning: 'acknowledgment_detected',
  };
} else if (messageFunction === 'off_topic') {
  rules_output = {
    ...rules_output,
    reply_mode: 'off_topic_redirect',
    should_call_resolver: false,
    reasoning: 'off_topic_detected',
  };
} else if (understanding_output.business_intent === 'store_info' || messageFunction === 'info_request') {
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
      last_topic: 'store_info',
      flow_stage: shouldContinueContext ? (currentFlow ?? null) : 'info',
      last_asked_key: null,
    },
    reasoning: 'store_info_bypasses_product_flow',
  };
} else if (messageFunction === 'ambiguous_reference') {
  rules_output = {
    ...rules_output,
    reply_mode: reference_resolution.resolved ? (shouldContinueContext ? 'resume_previous_flow' : 'business_resolve') : 'clarify_reference',
    should_call_resolver: Boolean(reference_resolution.resolved),
    reasoning: reference_resolution.resolved ? 'ambiguous_reference_resolved_and_continued' : 'ambiguous_reference_needs_clarification',
  };
} else if (messageFunction === 'negotiation') {
  const canNegotiateInContext = Boolean(hasProductContext || hasActiveContext);
  rules_output = {
    ...rules_output,
    reply_mode: canNegotiateInContext ? (currentFlow === 'buy' || shouldContinueContext ? 'resume_previous_flow' : 'business_resolve') : 'clarify_reference',
    should_call_resolver: canNegotiateInContext,
    resolver_input: {
      ...rules_output.resolver_input,
      flow: currentFlow === 'exchange' ? 'exchange' : 'buy',
      missing_fields: [],
    },
    session_update: {
      ...rules_output.session_update,
      flow_stage: currentFlow === 'exchange' ? 'exchange' : (currentFlow ?? 'buy'),
      last_asked_key: null,
    },
    reasoning: canNegotiateInContext ? 'negotiation_stays_in_current_context' : 'negotiation_needs_existing_context',
  };
} else if (messageFunction === 'refinement') {
  rules_output = {
    ...rules_output,
    reply_mode: shouldContinueContext || hasActiveContext ? 'resume_previous_flow' : 'business_resolve',
    should_call_resolver: true,
    session_update: {
      ...rules_output.session_update,
      flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : effectiveFlow,
      last_asked_key,
    },
    reasoning: 'refinement_reuses_constraints_and_context',
  };
} else if (messageFunction === 'follow_up') {
  const unresolvedReference = reference_resolution.reference_type !== 'none' && !reference_resolution.resolved;
  rules_output = {
    ...rules_output,
    reply_mode: unresolvedReference ? 'clarify_reference' : (shouldContinueContext || hasActiveContext ? 'resume_previous_flow' : 'business_resolve'),
    should_call_resolver: unresolvedReference ? false : true,
    session_update: {
      ...rules_output.session_update,
      flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : effectiveFlow,
      last_asked_key: unresolvedReference ? null : last_asked_key,
    },
    reasoning: unresolvedReference ? 'follow_up_reference_needs_clarification' : 'follow_up_reuses_existing_context',
  };
} else if (messageFunction === 'fresh_request') {
  rules_output = {
    ...rules_output,
    reply_mode: shouldContinueContext && currentFlow ? 'resume_previous_flow' : (understanding_output.business_intent === 'none' ? 'off_topic_redirect' : 'business_resolve'),
    should_call_resolver: shouldContinueContext && currentFlow ? true : understanding_output.business_intent !== 'none',
    session_update: {
      ...rules_output.session_update,
      flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : effectiveFlow,
      last_asked_key,
    },
    reasoning: shouldContinueContext && currentFlow ? 'fresh_message_prefers_existing_context' : (understanding_output.business_intent === 'none' ? 'fresh_non_business_message' : 'fresh_business_request'),
  };
}

return [{ json: { event, session, client_config, understanding_output, understanding_meta, rules_output } }];`;

fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + "\\n");
console.log("rules layer patched");
