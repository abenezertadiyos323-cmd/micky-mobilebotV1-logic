## Node: Event Normalizer
`javascript
const input = $json ?? {};
const message = input.message ?? {};
const callback = input.callback_query ?? null;
const callbackData = callback?.data ? String(callback.data).trim() : '';
const messageText = typeof message.text === 'string' ? message.text : '';
const callbackText = typeof callback?.message?.text === 'string' ? callback.message.text : '';
const hasImages = Array.isArray(message.photo) && message.photo.length > 0;
const photoCount = hasImages ? message.photo.length : 0;
const text = messageText || callbackData || callbackText || '';
const chatIdRaw = message.chat?.id ?? callback?.message?.chat?.id ?? '';
const userIdRaw = message.from?.id ?? callback?.from?.id ?? '';
const messageIdRaw = message.message_id ?? callback?.message?.message_id ?? callback?.id ?? '';
const startMatch = text.match(/^\/start(?:\s+(.+))?$/);
const deepLink = startMatch?.[1] ? String(startMatch[1]).trim() : null;
let eventType = 'text_message';
if (callback) {
  eventType = 'callback_action';
} else if (startMatch) {
  eventType = deepLink ? 'deep_link_start' : 'start_reset';
}
return [{
  json: {
    event: {
      event_type: eventType,
      text,
      chatId: String(chatIdRaw || ''),
      userId: String(userIdRaw || ''),
      messageId: String(messageIdRaw || ''),
      timestamp: Date.now(),
      callback_query: callbackData ? { id: callback?.id ? String(callback.id) : null, data: callbackData, message_text: callbackText || null, message_id: callback?.message?.message_id ?? null } : null,
      has_images: hasImages,
      photo_count: photoCount,
      deep_link: deepLink,
    },
  },
}];
`

## Node: Session Load
`json
{
  "method": "POST",
  "url": "={{(() => { const base = $env.CONVEX_HTTP_BASE_URL || $env.CONVEX_URL || $env.NEXT_PUBLIC_CONVEX_URL; if (!base) { throw new Error('Missing Convex URL env: CONVEX_HTTP_BASE_URL or CONVEX_URL or NEXT_PUBLIC_CONVEX_URL'); } return String(base).replace(/\\/$/, '').replace(/\\.convex\\.cloud(?=\\/|$)/, '.convex.site'); })() + '/http/session-load'}}",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Content-Type",
        "value": "application/json"
      }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ userId: $json.event?.userId ?? '', chatId: $json.event?.chatId ?? '' }) }}",
  "options": {}
}
`

## Node: Session Bootstrap
`javascript
const payload = $json ?? {};
let event = payload.event ?? null;
if (!event) {
  try {
    event = $item(0).$node['Event Normalizer'].json.event;
  } catch {
    event = null;
  }
}

event = event && typeof event === 'object' ? event : {};
const remoteEnvelope = payload.session && typeof payload.session === 'object'
  ? payload.session
  : (payload.data?.session && typeof payload.data.session === 'object' ? payload.data.session : null);
const remoteData = remoteEnvelope && Object.prototype.hasOwnProperty.call(remoteEnvelope, 'data')
  ? remoteEnvelope.data
  : (payload.session?.data ?? payload.data?.session?.data ?? remoteEnvelope);
const existing = remoteData && typeof remoteData === 'object' ? remoteData : {};
const now = Date.now();
const history = Array.isArray(existing.conversation_history)
  ? existing.conversation_history
  : (Array.isArray(existing.message_history) ? existing.message_history : []);
const shownProducts = Array.isArray(existing.flow_context?.buy_flow?.shown_products)
  ? existing.flow_context.buy_flow.shown_products
  : (Array.isArray(existing.shown_options) ? existing.shown_options : []);
const currentInterest = existing.flow_context?.buy_flow?.current_interest
  ?? existing.active_product_id
  ?? existing.selected_option
  ?? null;
const currentTopic = existing.conversation_state?.current_topic ?? existing.last_topic ?? null;
const currentFlow = existing.conversation_state?.current_flow ?? existing.resolved_flow ?? null;
const active = existing.conversation_state?.is_active;
const baseCount = Number.isFinite(Number(existing.message_count))
  ? Number(existing.message_count)
  : history.filter((item) => item && typeof item === 'object').length;

const normalizeText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizeNullableNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const source = value.trim().toLowerCase();
  if (!source) {
    return fallback;
  }
  const thousandMatch = source.match(/\b(\d+(?:[.,]\d+)?)\s*(?:k|thousand)\b/);
  if (thousandMatch) {
    const multiplier = Number(thousandMatch[1].replace(',', '.'));
    return Number.isFinite(multiplier) ? Math.round(multiplier * 1000) : fallback;
  }
  const numericChunks = source.match(/\d[\d\s,._]*/g);
  if (!numericChunks) {
    return fallback;
  }
  for (const chunk of numericChunks) {
    const compact = chunk.replace(/[\s_]/g, '');
    if (!compact) {
      continue;
    }
    const grouped = compact.split(/[.,]/);
    if (grouped.length > 1 && grouped.every((part, index) => (index === 0 ? /^\d+$/.test(part) : /^\d{3}$/.test(part)))) {
      const groupedValue = Number(grouped.join(''));
      if (Number.isFinite(groupedValue)) {
        return groupedValue;
      }
    }
    const plainValue = Number(compact.replace(/,/g, ''));
    if (Number.isFinite(plainValue)) {
      return plainValue;
    }
  }
  return fallback;
};
const normalizeExchangeDetails = (incoming, fallback) => {
  const source = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  return {
    brand: normalizeText(source.brand) ?? fallback.brand,
    model: normalizeText(source.model) ?? fallback.model,
    storage: normalizeText(source.storage) ?? fallback.storage,
    battery_health: normalizeText(source.battery_health ?? source.batteryHealth) ?? fallback.battery_health,
    ram: normalizeText(source.ram) ?? fallback.ram,
    condition: normalizeText(source.condition) ?? fallback.condition,
    expected_price_etb: normalizeNullableNumber(source.expected_price_etb ?? source.expectedPriceEtb ?? source.expected_price, fallback.expected_price_etb),
    has_images: typeof source.has_images === 'boolean' ? source.has_images : Boolean(fallback.has_images),
    photo_count: Number.isFinite(Number(source.photo_count ?? source.photoCount)) ? Number(source.photo_count ?? source.photoCount) : fallback.photo_count,
    details_complete: typeof source.details_complete === 'boolean' ? source.details_complete : Boolean(fallback.details_complete),
  };
};
const normalizeBuyState = (incoming, fallback) => {
  const source = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  return {
    closed: typeof source.closed === 'boolean' ? source.closed : Boolean(fallback.closed),
    close_reason: normalizeText(source.close_reason ?? source.closeReason) ?? fallback.close_reason,
  };
};
const normalizeAdminLead = (incoming, fallback) => {
  const source = incoming && typeof incoming === 'object' && !Array.isArray(incoming) ? incoming : {};
  return {
    section: normalizeText(source.section) ?? fallback.section,
    status: normalizeText(source.status) ?? fallback.status,
    type: normalizeText(source.type) ?? fallback.type,
    intent: normalizeText(source.intent) ?? fallback.intent,
    has_images: typeof source.has_images === 'boolean' ? source.has_images : Boolean(fallback.has_images),
    brand: normalizeText(source.brand) ?? fallback.brand,
    model: normalizeText(source.model) ?? fallback.model,
    storage: normalizeText(source.storage) ?? fallback.storage,
    battery_health: normalizeText(source.battery_health ?? source.batteryHealth) ?? fallback.battery_health,
    ram: normalizeText(source.ram) ?? fallback.ram,
    expected_price_etb: normalizeNullableNumber(source.expected_price_etb ?? source.expectedPriceEtb ?? source.expected_price, fallback.expected_price_etb),
    closed: typeof source.closed === 'boolean' ? source.closed : Boolean(fallback.closed),
    close_reason: normalizeText(source.close_reason ?? source.closeReason) ?? fallback.close_reason,
  };
};

const currentInterestRecord = currentInterest && typeof currentInterest === 'object' ? currentInterest : {};
const existingConstraints = existing.collected_constraints && typeof existing.collected_constraints === 'object'
  ? existing.collected_constraints
  : {};
const loadedBudgetEtb = normalizeNullableNumber(existingConstraints.budget_etb ?? existing.budget_etb ?? null);
const collected_constraints = {
  budget_etb: loadedBudgetEtb !== null && loadedBudgetEtb > 0 ? loadedBudgetEtb : null,
  brand: normalizeText(existingConstraints.brand ?? currentInterestRecord.brand ?? null),
  model: normalizeText(existingConstraints.model ?? currentInterestRecord.model ?? currentInterestRecord.name ?? null),
  storage: normalizeText(existingConstraints.storage ?? currentInterestRecord.storage ?? null),
  condition: normalizeText(existingConstraints.condition ?? currentInterestRecord.condition ?? null),
};

const defaultExchangeDetails = {
  brand: null,
  model: null,
  storage: null,
  battery_health: null,
  ram: null,
  condition: null,
  expected_price_etb: null,
  has_images: false,
  photo_count: 0,
  details_complete: false,
};
const defaultBuyState = {
  closed: false,
  close_reason: null,
};
const defaultAdminLead = {
  section: 'inbox',
  status: 'cold',
  type: 'general',
  intent: 'unknown',
  has_images: false,
  brand: null,
  model: null,
  storage: null,
  battery_health: null,
  ram: null,
  expected_price_etb: null,
  closed: false,
  close_reason: null,
};

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeTurnIndex = (value) => {
  const numeric = normalizeNullableNumber(value, null);
  return numeric === null ? null : Math.max(0, Math.floor(numeric));
};
const normalizeOfferType = (value, fallback) => {
  if (value === 'single' || value === 'multi' || value === 'none') {
    return value;
  }
  return fallback;
};
const normalizeProductIdList = (value, fallback) => {
  const source = Array.isArray(value) ? value : fallback;
  return source
    .filter((item) => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim())
    .slice(0, 3);
};
const normalizeLastOfferContext = (incoming, fallback) => {
  const source = isRecord(incoming) ? incoming : {};
  return {
    turn_index: normalizeTurnIndex(source.turn_index ?? source.turnIndex) ?? fallback.turn_index,
    offer_type: normalizeOfferType(source.offer_type ?? source.offerType, fallback.offer_type),
    product_ids: normalizeProductIdList(source.product_ids ?? source.productIds, fallback.product_ids),
  };
};

const exchange_details = normalizeExchangeDetails(existing.exchange_details, defaultExchangeDetails);
const buy_state = normalizeBuyState(existing.buy_state, defaultBuyState);
const admin_lead = normalizeAdminLead(existing.admin_lead, defaultAdminLead);
const last_offer_context = normalizeLastOfferContext(existing.last_offer_context, {
  turn_index: null,
  offer_type: 'none',
  product_ids: [],
});
const last_constrained_turn = normalizeTurnIndex(existing.last_constrained_turn);

const session = {
  session_id: String(existing.session_id ?? ('sess_' + String(event.userId ?? event.chatId ?? 'guest'))),
  customer_id: String(existing.customer_id ?? event.userId ?? ''),
  created_at: Number.isFinite(Number(existing.created_at)) ? Number(existing.created_at) : now,
  last_message_at: now,
  message_count: Math.max(0, baseCount),
  conversation_state: {
    current_topic: currentTopic,
    current_flow: currentFlow,
    is_active: typeof active === 'boolean' ? active : true,
  },
  flow_context: {
    buy_flow: {
      shown_products: shownProducts,
      current_interest: currentInterest,
    },
  },
  exchange_details,
  buy_state,
  admin_lead,
  admin_section: admin_lead.section,
  admin_status: admin_lead.status,
  admin_type: admin_lead.type,
  admin_intent: admin_lead.intent,
  admin_has_images: admin_lead.has_images,
  last_offer_context,
  last_constrained_turn,
  collected_constraints,
  last_asked_key: normalizeText(existing.last_asked_key ?? existing.last_asked_field ?? null),
  conversation_history: history.slice(-12).filter((item) => item && typeof item === 'object'),
  admin_escalation: existing.admin_escalation && typeof existing.admin_escalation === 'object'
    ? {
        required: Boolean(existing.admin_escalation.required),
        reason: existing.admin_escalation.reason ?? null,
        status: existing.admin_escalation.status ?? null,
      }
    : {
        required: false,
        reason: null,
        status: null,
      },
};

const runtimeSession = event.event_type === "start_reset"
  ? {
      ...session,
      conversation_state: {
        ...session.conversation_state,
        current_topic: null,
        current_flow: null,
      },
      flow_context: {
        ...session.flow_context,
        buy_flow: {
          ...session.flow_context?.buy_flow,
          shown_products: [],
          current_interest: null,
        },
      },
      collected_constraints: {
        budget_etb: null,
        brand: null,
        model: null,
        storage: null,
        condition: null,
      },
      conversation_history: [],
      last_offer_context: {
        turn_index: null,
        offer_type: "none",
        product_ids: [],
      },
      last_constrained_turn: null,
      last_asked_key: null,
    }
  : session;

const client_config = {
  "store_name": "TedyTech",
  "default_language": "am",
  "supports_exchange": true,
  "supports_finance": false,
  "telegram_bot_name": "TedyTech Bot"
};

return [{
  json: {
    event,
    session: runtimeSession,
    client_config,
    session_source: remoteEnvelope?.exists ? 'remote' : 'bootstrap',
  },
}];
`

## Node: Understanding AI
`json
{
  "method": "POST",
  "url": "https://openrouter.ai/api/v1/chat/completions",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Content-Type",
        "value": "application/json"
      },
      {
        "name": "Authorization",
        "value": "={{ 'Bearer ' + $env.OPENROUTER_API_KEY }}"
      }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({\n  model: 'google/gemini-3.1-flash-lite-preview',\n  temperature: 0,\n  response_format: { type: 'json_object' },\n  messages: [\n    { role: 'system', content: \"You are a neutral conversational function classifier for a Telegram phone sales bot.\\nYour only job is to understand the real meaning and conversational act of the current customer message in full context.\\n\\nReturn ONLY valid JSON. No explanation. No extra text.\\n\\nClassify every message by its true conversational function first, then by business intent.\\n\\nAllowed message_function (choose exactly one):\\n- info_request ? asking for store info, location, address, hours, delivery, warranty, payment, contact\\n- refinement ? adding or changing a detail to an existing conversation (e.g. 128gb, the second one, cheaper)\\n- negotiation ? trying to reduce price, last price, discount, \\\"a bit lower\\\", tnsh yekanesal, wagaw tnsh, ????, ???\\n- acknowledgment ? simple thanks, okay, greeting, light social reply\\n- clarification ? message is unclear, incomplete, or needs more info\\n- fresh_request ? completely new business request with no previous context\\n\\nRules:\\n- Prioritize semantic meaning and full session context over literal words.\\n- For Amharic and mixed-language messages, focus on real intent, not surface politeness.\\n- Never classify negotiation or pricing messages as acknowledgment.\\n- Never default to product_search or fresh_request when the message is clearly something else.\\n- If the message is ambiguous or noisy, set message_function = clarification, confidence low, ambiguity high.\\n- Use session history only to resolve references (that one, cheaper one, 128gb), never to force a sales topic.\\n\\nOutput exactly this schema and nothing else:\\n\\n{\\n  \\\"message_function\\\": \\\"info_request\\\" | \\\"refinement\\\" | \\\"negotiation\\\" | \\\"acknowledgment\\\" | \\\"clarification\\\" | \\\"fresh_request\\\",\\n  \\\"business_intent\\\": \\\"store_info\\\" | \\\"product_search\\\" | \\\"pricing\\\" | \\\"exchange\\\" | \\\"support\\\" | null,\\n  \\\"topic\\\": \\\"store_info\\\" | \\\"product\\\" | \\\"exchange\\\" | \\\"pricing\\\" | \\\"location\\\" | null,\\n  \\\"confidence\\\": 0.0,\\n  \\\"ambiguity\\\": 0.0,\\n  \\\"missing_information\\\": [],\\n  \\\"reference_resolution\\\": {\\\"refers_to\\\": null, \\\"resolved_id\\\": null},\\n  \\\"last_asked_key\\\": null\\n}\" },\n    {\n      role: 'user',\n      content: JSON.stringify({\n        customer_text: $json.event?.text ?? '',\n        event: {\n          event_type: $json.event?.event_type ?? null,\n          deep_link: $json.event?.deep_link ?? null,\n        },\n        session_context: {\n          current_topic: $json.session?.conversation_state?.current_topic ?? null,\n          current_flow: $json.session?.conversation_state?.current_flow ?? null,\n          is_active: $json.session?.conversation_state?.is_active ?? true,\n          collected_constraints: $json.session?.collected_constraints ?? {\n            budget_etb: null,\n            brand: null,\n            model: null,\n            storage: null,\n            condition: null,\n          },\n          last_asked_key: $json.session?.last_asked_key ?? null,\n          current_interest: $json.session?.flow_context?.buy_flow?.current_interest ?? null,\n          shown_products: Array.isArray($json.session?.flow_context?.buy_flow?.shown_products)\n            ? $json.session.flow_context.buy_flow.shown_products.slice(0, 5)\n            : [],\n          last_messages: Array.isArray($json.session?.conversation_history)\n            ? $json.session.conversation_history.slice(-6)\n            : [],\n        },\n        client_config: $json.client_config ?? null,\n      }),\n    },\n  ],\n}) }}",
  "options": {}
}
`

## Node: Understanding JSON Guard - Pure Validator
`javascript
const base = (() => {
  try {
    return $item(0).$node['Session Bootstrap'].json ?? {};
  } catch {
    return {};
  }
})();
const payload = $json ?? {};
const event = base.event && typeof base.event === 'object' ? base.event : {};
const session = base.session && typeof base.session === 'object' ? base.session : {};
const client_config = base.client_config && typeof base.client_config === 'object' ? base.client_config : {};

const allowedMessageFunctions = ['info_request', 'refinement', 'negotiation', 'acknowledgment', 'clarification', 'fresh_request'];
const allowedBusinessIntents = ['store_info', 'product_search', 'pricing', 'exchange', 'support'];
const allowedTopics = ['store_info', 'product', 'exchange', 'pricing', 'location'];
const hardFallback = {
  message_function: 'clarification',
  business_intent: null,
  topic: null,
  confidence: 0.0,
  ambiguity: 1.0,
  missing_information: [],
  reference_resolution: {
    refers_to: null,
    resolved_id: null,
  },
  last_asked_key: null,
};

const issues = [];
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const parseJsonObject = (value) => {
  if (!value) return null;
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const normalizeEnum = (value, allowed, label) => {
  if (typeof value !== 'string') {
    issues.push(label + '_type');
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    issues.push(label + '_invalid');
    return null;
  }
  return normalized;
};
const normalizeNullableEnum = (value, allowed, label) => {
  if (value === null || value === undefined) return null;
  return normalizeEnum(value, allowed, label);
};
const normalizeUnitNumber = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(label + '_type');
    return null;
  }
  if (value < 0 || value > 1) {
    issues.push(label + '_range');
    return null;
  }
  return value;
};
const normalizeStringArray = (value, label) => {
  if (!Array.isArray(value)) {
    issues.push(label + '_type');
    return null;
  }
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      issues.push(label + '_item_type');
      return null;
    }
    const text = item.trim();
    if (text) normalized.push(text);
  }
  return normalized;
};
const normalizeNullableString = (value, label) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    issues.push(label + '_type');
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
};
const validateReferenceResolution = (value) => {
  if (!isRecord(value)) {
    issues.push('reference_resolution_type');
    return null;
  }
  return {
    refers_to: normalizeNullableString(value.refers_to, 'reference_resolution.refers_to'),
    resolved_id: normalizeNullableString(value.resolved_id, 'reference_resolution.resolved_id'),
  };
};

const rawResponse = parseJsonObject(payload.choices?.[0]?.message?.content)
  || parseJsonObject(payload.output_text)
  || parseJsonObject(payload.text)
  || parseJsonObject(payload.data)
  || parseJsonObject(payload.result)
  || parseJsonObject(payload);

let understanding_output = hardFallback;
if (!rawResponse) {
  issues.push('understanding_response_not_parseable');
} else {
  const validated = {
    message_function: normalizeEnum(rawResponse.message_function, allowedMessageFunctions, 'message_function'),
    business_intent: normalizeNullableEnum(rawResponse.business_intent, allowedBusinessIntents, 'business_intent'),
    topic: normalizeNullableEnum(rawResponse.topic, allowedTopics, 'topic'),
    confidence: normalizeUnitNumber(rawResponse.confidence, 'confidence'),
    ambiguity: normalizeUnitNumber(rawResponse.ambiguity, 'ambiguity'),
    missing_information: normalizeStringArray(rawResponse.missing_information, 'missing_information'),
    reference_resolution: validateReferenceResolution(rawResponse.reference_resolution),
    last_asked_key: normalizeNullableString(rawResponse.last_asked_key, 'last_asked_key'),
  };

  const validationFailed = [
    validated.message_function,
    validated.confidence,
    validated.ambiguity,
    validated.missing_information,
    validated.reference_resolution,
  ].some((value) => value === null) || issues.length > 0;

  if (!validationFailed) {
    understanding_output = {
      message_function: validated.message_function,
      business_intent: validated.business_intent,
      topic: validated.topic,
      confidence: validated.confidence,
      ambiguity: validated.ambiguity,
      missing_information: validated.missing_information,
      reference_resolution: validated.reference_resolution,
      last_asked_key: validated.last_asked_key,
    };
  }
}

const understanding_meta = {
  validator_mode: 'pure_schema_validator',
  schema_mode: 'minimal_guard_v2',
  valid: issues.length === 0,
  issues,
  raw_response: rawResponse,
  fallback_applied: issues.length > 0,
  timestamp: Date.now(),
};
console.log(JSON.stringify({
  node: 'Understanding JSON Guard - Pure Validator',
  valid: understanding_meta.valid,
  fallback_applied: understanding_meta.fallback_applied,
  issues: understanding_meta.issues,
  raw_response: rawResponse,
}));

return [{
  json: {
    event,
    session,
    client_config,
    understanding_output,
    understanding_meta,
  },
}];
`

## Node: Rules Layer
`javascript
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
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const source = value.trim().toLowerCase();
  if (!source) return null;
  const thousandMatch = source.match(/\b(\d+(?:[.,]\d+)?)\s*(?:k|thousand)\b/);
  if (thousandMatch) {
    const multiplier = Number(thousandMatch[1].replace(',', '.'));
    return Number.isFinite(multiplier) ? Math.round(multiplier * 1000) : null;
  }
  const numericChunks = source.match(/\d[\d\s,._]*/g);
  if (!numericChunks) return null;
  for (const chunk of numericChunks) {
    const compact = chunk.replace(/[\s_]/g, '');
    if (!compact) continue;
    const grouped = compact.split(/[.,]/);
    if (grouped.length > 1 && grouped.every((part, index) => (index === 0 ? /^\d+$/.test(part) : /^\d{3}$/.test(part)))) {
      const groupedValue = Number(grouped.join(''));
      if (Number.isFinite(groupedValue)) return groupedValue;
    }
    const plainValue = Number(compact.replace(/,/g, ''));
    if (Number.isFinite(plainValue)) return plainValue;
  }
  return null;
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
const eventText = normalizeText(event.text) ?? '';
const extractBudgetEtb = (value) => {
  const source = String(value ?? eventText ?? '').trim().toLowerCase();
  if (!source) return null;
  const parseNumeric = (raw) => {
    const numeric = Number(String(raw).replace(/[\s,]/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  };
  const kMatch = source.match(/\b(\d+(?:\.\d+)?)\s*(?:k|thousand)\b/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const currencyMatch = source.match(/(?:etb|birr|br|brr|ብር)\s*[:\-]?\s*(\d{1,3}(?:[\s,]\d{3})+|\d{4,6}|\d+(?:\.\d+)?)/i);
  if (currencyMatch) return parseNumeric(currencyMatch[1]);
  const plainMatch = source.match(/\b(\d{1,3}(?:[\s,]\d{3})+|\d{4,6})\b/);
  return plainMatch ? parseNumeric(plainMatch[1]) : null;
};
const budgetSignal = extractBudgetEtb(eventText);
const existingConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const currentTurnIndex = Math.max(1, Math.floor(Number(session.message_count ?? 0)) + 1);
const lastOfferContextSource = isRecord(session.last_offer_context) ? session.last_offer_context : {};
const lastOfferContext = {
  turn_index: normalizeNullableNumber(lastOfferContextSource.turn_index) !== null
    ? Math.max(0, Math.floor(normalizeNullableNumber(lastOfferContextSource.turn_index)))
    : null,
  offer_type: lastOfferContextSource.offer_type === 'single' || lastOfferContextSource.offer_type === 'multi' || lastOfferContextSource.offer_type === 'none'
    ? lastOfferContextSource.offer_type
    : 'none',
  product_ids: Array.isArray(lastOfferContextSource.product_ids)
    ? lastOfferContextSource.product_ids.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 3)
    : [],
};
const lastOfferTurnDistance = lastOfferContext.turn_index === null ? null : Math.max(0, currentTurnIndex - lastOfferContext.turn_index);
const lastConstrainedTurnIndex = normalizeNullableNumber(session.last_constrained_turn) !== null
  ? Math.max(0, Math.floor(normalizeNullableNumber(session.last_constrained_turn)))
  : null;
const lastConstrainedTurnDistance = lastConstrainedTurnIndex === null ? null : Math.max(0, currentTurnIndex - lastConstrainedTurnIndex);
const cleanPhoneType = (value) => {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(/(32|64|128|256|512|1024)s*gb/ig, ' ')
    .replace(/(iphone|samsung|pixel|redmi|xiaomi|tecno|infinix|oppo|vivo|realme|itel|nokia)(d)/ig, '$1 $2')
    .replace(/(pro)(max)/ig, '$1 $2')
    .replace(/s+/g, ' ')
    .trim();
  return normalized || null;
};
const extractPhoneType = (value) => {
  const source = String(value || '').trim();
  if (!source) return null;
  const match = source.match(/(?:iphones*d+(?:s*(?:pros*max|pro|max|plus|mini))?|samsungs*[a-z0-9+ ]+|pixels*[a-z0-9+ ]+|redmis*[a-z0-9+ ]+|xiaomis*[a-z0-9+ ]+|tecnos*[a-z0-9+ ]+|infinixs*[a-z0-9+ ]+|oppos*[a-z0-9+ ]+|vivos*[a-z0-9+ ]+|realmes*[a-z0-9+ ]+|itels*[a-z0-9+ ]+|nokias*[a-z0-9+ ]+)/i);
  return cleanPhoneType(match ? match[0] : null);
};
const currentTurnPhoneType = extractPhoneType(eventText);
const lowerEventTextForBrand = eventText.toLowerCase();
const brandCandidates = ['iphone', 'samsung', 'pixel', 'redmi', 'xiaomi', 'tecno', 'infinix', 'oppo', 'vivo', 'realme', 'itel', 'nokia'];
const brandMatch = brandCandidates.find((brand) => lowerEventTextForBrand.includes(brand));
const currentTurnBrand = currentTurnPhoneType ? currentTurnPhoneType.split(' ')[0] : (brandMatch ? (brandMatch === 'iphone' ? 'iPhone' : brandMatch.charAt(0).toUpperCase() + brandMatch.slice(1)) : null);
const currentTurnModel = currentTurnPhoneType ? currentTurnPhoneType.split(' ').slice(1).join(' ').trim() || null : null;
const currentTurnStorageMatch = eventText.match(/(32|64|128|256|512|1024)s*gb/i);
const currentTurnStorage = currentTurnStorageMatch ? (currentTurnStorageMatch[1] + 'GB') : null;
const currentTurnRamMatch = eventText.match(/(d{1,3})s*gbs*ram/i);
const currentTurnRam = currentTurnRamMatch ? (currentTurnRamMatch[1] + 'GB') : null;
const currentTurnCondition = (() => {
  const source = eventText.toLowerCase();
  if (/(like new|excellent|very good|good condition)/.test(source)) return 'good';
  if (/(fair|normal|average)/.test(source)) return 'fair';
  if (/(broken|damaged|cracked|bad)/.test(source)) return 'damaged';
  return null;
})();
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
const currentTurnHasStructuredProductConstraint = Boolean(
  reference_resolution.reference_type !== 'none'
  || reference_resolution.resolved
  || currentTurnPhoneType
  || currentTurnBrand
  || currentTurnStorage
  || currentTurnRam
  || currentTurnCondition
);
const recentOfferContext = Boolean(
  lastOfferTurnDistance !== null
  && lastOfferTurnDistance <= 2
  && lastOfferContext.offer_type !== 'none'
);
const recentShownProductsContext = recentOfferContext && shownProducts.length > 0;
const recentOfferProductIdsContext = recentOfferContext && lastOfferContext.product_ids.length > 0;
const selectedProductExists = Boolean(
  resolvedProduct
  || currentInterest
  || recentShownProductsContext
  || recentOfferProductIdsContext
);
const recentConstrainedContext = Boolean(
  lastConstrainedTurnDistance !== null
  && lastConstrainedTurnDistance <= 2
);
const currentTurnShort = eventText.length > 0 && eventText.length <= 40;
const currentTurnLikelyFollowUp = Boolean(
  recentOfferContext
  && recentConstrainedContext
  && selectedProductExists
  && currentTurnShort
  && !currentTurnHasStructuredProductConstraint
);
const anchorEvidence = {
  budget_signal: budgetSignal,
  current_turn_phone_type: currentTurnPhoneType,
  current_turn_brand: currentTurnBrand,
  current_turn_model: currentTurnModel,
  current_turn_storage: currentTurnStorage,
  current_turn_ram: currentTurnRam,
  current_turn_condition: currentTurnCondition,
  current_turn_short: currentTurnShort,
  selected_product_exists: selectedProductExists,
  recent_offer_context: recentOfferContext,
  recent_constrained_context: recentConstrainedContext,
  last_offer_turn_distance: lastOfferTurnDistance,
  last_constrained_turn_distance: lastConstrainedTurnDistance,
  last_offer_type: lastOfferContext.offer_type,
  reference_type: reference_resolution.reference_type,
  reference_resolved: reference_resolution.resolved,
  current_turn_likely_follow_up: currentTurnLikelyFollowUp,
};
let anchorMode = 'broad';
if (currentTurnHasStructuredProductConstraint || (currentTurnLikelyFollowUp && budgetSignal === null)) {
  anchorMode = 'anchored';
} else if (budgetSignal !== null && recentOfferContext && recentConstrainedContext && selectedProductExists && currentTurnShort && !currentTurnHasStructuredProductConstraint) {
  anchorMode = 'ambiguous';
}
const currentTurnConstrained = Boolean(budgetSignal !== null || currentTurnHasStructuredProductConstraint);
const budgetOnlyQuery = Boolean(budgetSignal !== null && anchorMode === 'broad');
const mergedConstraints = {
  budget_etb: budgetSignal ?? (anchorMode === 'anchored' ? normalizePositiveNumber(existingConstraintsSource.budget_etb) : null),
  brand: currentTurnBrand ?? (anchorMode === 'anchored' ? normalizeText(existingConstraintsSource.brand ?? currentInterest?.brand ?? null) : null),
  model: currentTurnModel ?? (anchorMode === 'anchored' ? normalizeText(existingConstraintsSource.model ?? currentInterest?.model ?? null) : null),
  storage: currentTurnStorage ?? (anchorMode === 'anchored' ? normalizeText(existingConstraintsSource.storage ?? currentInterest?.storage ?? null) : null),
  condition: currentTurnCondition ?? (anchorMode === 'anchored' ? normalizeText(existingConstraintsSource.condition ?? currentInterest?.condition ?? null) : null),
};

const businessIntent = normalizeText(understanding_output.business_intent);
const messageFunction = normalizeText(understanding_output.message_function) ?? 'clarification';
const understandingTopic = normalizeText(understanding_output.topic);
const confidence = typeof understanding_output.confidence === 'number' ? understanding_output.confidence : 0;
const missingInformation = normalizeStringArray(understanding_output.missing_information);
const requestedLastAskedKey = normalizeText(understanding_output.last_asked_key);
const hasActiveContext = Boolean(
  currentFlow
  || currentTopic
  || recentShownProductsContext
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
const isStoreInfoTurn = Boolean(
  businessIntent === 'store_info'
  || understandingTopic === 'store_info'
  || understandingTopic === 'location'
  || (messageFunction === 'info_request' && (businessIntent === null || businessIntent === 'store_info'))
);
const shouldContinueContext = Boolean(
  hasActiveContext && (
    ['refinement', 'negotiation'].includes(messageFunction)
    || reference_resolution.reference_type !== 'none'
    || sameFlowIntent
    || anchorMode === 'anchored'
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
  || recentShownProductsContext
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
if (effectiveFlow === 'exchange' && missingInformation.length === 0 && !currentInterest && shownProducts.length === 0 && !mergedConstraints.condition) {
  computedMissingFields.push('condition');
}
const missing_fields = missingInformation.length > 0 ? missingInformation : computedMissingFields;
const last_asked_key = requestedLastAskedKey ?? missing_fields[0] ?? null;

const productContext = {
  brand: anchorMode === 'anchored' ? mergedConstraints.brand : null,
  model: anchorMode === 'anchored' ? mergedConstraints.model : null,
  storage: anchorMode === 'anchored' ? mergedConstraints.storage : null,
  condition: anchorMode === 'anchored' ? mergedConstraints.condition : null,
  budget_etb: mergedConstraints.budget_etb,
  current_interest: anchorMode === 'anchored' ? (currentInterest ? currentInterest.raw : null) : null,
  current_topic: currentTopic,
  current_flow: currentFlow,
  budget_only_query: budgetOnlyQuery,
  anchor_mode: anchorMode,
  anchor_evidence: anchorEvidence,
  last_offer_context: lastOfferContext,
  last_constrained_turn: lastConstrainedTurnIndex,
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
    budget_only_query: budgetOnlyQuery,
    anchor_mode: anchorMode,
    anchor_evidence: anchorEvidence,
    turn_index: currentTurnIndex,
  },
  session_update: {
    last_topic: effectiveTopic,
    flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : effectiveFlow,
    ambiguous_reference: reference_resolution.reference_type !== 'none' ? reference_resolution.reference_type : null,
    resolved_ambiguity: reference_resolution.resolved,
    collected_constraints: mergedConstraints,
    last_asked_key,
    last_constrained_turn: currentTurnConstrained ? currentTurnIndex : lastConstrainedTurnIndex,
  },
  anchor_mode: anchorMode,
  anchor_evidence: anchorEvidence,
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
} else if (!isStoreInfoTurn && (!Number.isFinite(confidence) || confidence < 0.6)) {
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
      flow_stage: currentFlow ? currentFlow : 'info',
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
  rules_output = {
    ...rules_output,
    reply_mode: 'business_resolve',
    should_call_resolver: true,
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
    reasoning: hasProductContext || hasActiveContext ? 'negotiation_business_resolve_with_context' : 'negotiation_business_resolve_without_context',
  };
} else if (messageFunction === 'refinement') {
  rules_output = {
    ...rules_output,
    reply_mode: shouldContinueContext || hasActiveContext ? 'resume_previous_flow' : 'business_resolve',
    should_call_resolver: Boolean(intentFlow ?? currentFlow),
    session_update: {
      ...rules_output.session_update,
      flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : effectiveFlow,
      last_asked_key,
    },
    reasoning: 'refinement_reuses_session_context',
  };
} else if (messageFunction === 'fresh_request') {
  const isBusiness = businessIntent !== null;
  rules_output = {
    ...rules_output,
    reply_mode: shouldContinueContext && currentFlow ? 'resume_previous_flow' : (isBusiness ? 'business_resolve' : 'off_topic_redirect'),
    should_call_resolver: shouldContinueContext && currentFlow ? true : isBusiness,
    resolver_input: {
      ...rules_output.resolver_input,
      flow: intentFlow ?? effectiveFlow,
    },
    session_update: {
      ...rules_output.session_update,
      flow_stage: shouldContinueContext ? (currentFlow ?? effectiveFlow) : (intentFlow ?? effectiveFlow),
      last_asked_key,
    },
    reasoning: shouldContinueContext && currentFlow ? 'fresh_message_prefers_existing_context' : (isBusiness ? 'fresh_business_request' : 'fresh_non_business_message'),
  };
}

if (budgetSignal !== null && businessIntent !== 'exchange' && currentFlow !== 'exchange') {
  const ambiguousAnchor = anchorMode === 'ambiguous';
  rules_output = {
    ...rules_output,
    reply_mode: ambiguousAnchor ? 'clarify_reference' : 'business_resolve',
    should_call_resolver: !ambiguousAnchor,
    resolver_input: ambiguousAnchor
      ? null
      : {
          ...rules_output.resolver_input,
          flow: 'buy',
          product_context: {
            ...productContext,
            budget_etb: budgetSignal,
          },
          missing_fields: [],
          anchor_mode: anchorMode,
          anchor_evidence: anchorEvidence,
          turn_index: currentTurnIndex,
        },
    session_update: {
      ...rules_output.session_update,
      last_topic: understandingTopic ?? rules_output.session_update?.last_topic ?? 'pricing',
      flow_stage: ambiguousAnchor ? (rules_output.session_update?.flow_stage ?? currentFlow ?? effectiveFlow) : 'buy',
      collected_constraints: {
        ...mergedConstraints,
        budget_etb: budgetSignal,
      },
      last_asked_key: rules_output.session_update?.last_asked_key ?? 'budget_etb',
      last_constrained_turn: lastConstrainedTurnIndex,
    },
    reasoning: ambiguousAnchor
      ? 'ambiguous_anchor_requires_clarification'
      : 'budget_signal_forces_product_search',
  };
}
return [{ json: { event, session, client_config, understanding_output, understanding_meta, rules_output } }];
`

## Node: Product Search (Convex Test)
`json
{
  "method": "POST",
  "url": "={{ \"https://fastidious-schnauzer-265.convex.site/http/products-search\" }}",
  "authentication": "predefinedCredentialType",
  "nodeCredentialType": "httpHeaderAuth",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Content-Type",
        "value": "application/json"
      }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "const ref = typeof $json.understanding_output?.reference_resolution?.refers_to === 'string'\n    ? cleanPhoneType($json.understanding_output.reference_resolution.refers_to)\n    : null;\n  const blocked = ['desired_phone', 'current_phone', 'last_shown_option', 'cheaper_option', 'previous_selection', 'none'];\n  const anchorMode = String($json.rules_output?.resolver_input?.anchor_mode ?? 'broad');\n  const fromContext = anchorMode === 'anchored' ? cleanPhoneType(([\n    $json.rules_output?.resolver_input?.product_context?.brand,\n    $json.rules_output?.resolver_input?.product_context?.model,\n  ].filter(Boolean).join(' ').trim() || [\n    $json.session?.collected_constraints?.brand,\n    $json.session?.collected_constraints?.model,\n  ].filter(Boolean).join(' ').trim())) : null;\n  const phoneType = explicit || fromText || (ref && !blocked.includes(ref.toLowerCase()) ? ref : null) || fromContext || cleanPhoneType(text) || null;\n  const tokens = String(phoneType || '').trim().split(/s+/).filter(Boolean);\n  const brand = tokens.length > 0 ? tokens[0] : null;\n  const model = tokens.length > 1 ? tokens.slice(1).join(' ') : null;\n  const rawBudget = $json.rules_output?.resolver_input?.product_context?.budget_etb ?? (anchorMode === 'anchored' ? $json.session?.collected_constraints?.budget_etb ?? null : null);\n  const maxPrice = rawBudget === null || rawBudget === undefined || rawBudget === '' ? null : (Number.isFinite(Number(rawBudget)) && Number(rawBudget) > 0 ? Number(rawBudget) : null);={{ JSON.stringify((() => {\n  const cleanPhoneType = (value) => {\n    if (typeof value !== 'string') return null;\n    const normalized = value\n      .replace(/\\b(32|64|128|256|512|1024)\\s*gb\\b/ig, ' ')\n      .replace(/\\b(iphone|samsung|pixel|redmi|xiaomi|tecno|infinix|oppo|vivo|realme|itel|nokia)(\\d)/ig, '$1 $2')\n      .replace(/\\b(pro)(max)\\b/ig, '$1 $2')\n      .replace(/\\s+/g, ' ')\n      .trim();\n    return normalized || null;\n  };\n  const extractFromText = (value) => {\n    const source = String(value || '').trim();\n    if (!source) return null;\n    const match = source.match(/\\b(?:iphone\\s*\\d+(?:\\s*(?:pro\\s*max|pro|max|plus|mini))?|samsung\\s*[a-z0-9+ ]+|pixel\\s*[a-z0-9+ ]+|redmi\\s*[a-z0-9+ ]+|xiaomi\\s*[a-z0-9+ ]+|tecno\\s*[a-z0-9+ ]+|infinix\\s*[a-z0-9+ ]+|oppo\\s*[a-z0-9+ ]+|vivo\\s*[a-z0-9+ ]+|realme\\s*[a-z0-9+ ]+|itel\\s*[a-z0-9+ ]+|nokia\\s*[a-z0-9+ ]+)\\b/i);\n    return cleanPhoneType(match ? match[0] : null);\n  };\n  const text = String($json.event?.text || '').trim();\n  const explicit = cleanPhoneType($json.rules_output?.resolver_input?.resolved_product_name || null);\n  const fromText = extractFromText(text);\n  const ref = typeof $json.understanding_output?.reference_resolution?.refers_to === 'string'\n    ? cleanPhoneType($json.understanding_output.reference_resolution.refers_to)\n    : null;\n  const blocked = ['desired_phone', 'current_phone', 'last_shown_option', 'cheaper_option', 'previous_selection', 'none'];\n  const fromContext = cleanPhoneType(([\n    $json.rules_output?.resolver_input?.product_context?.brand,\n    $json.rules_output?.resolver_input?.product_context?.model,\n  ].filter(Boolean).join(' ').trim() || [\n    $json.session?.collected_constraints?.brand,\n    $json.session?.collected_constraints?.model,\n  ].filter(Boolean).join(' ').trim()));\n  const phoneType = explicit || fromText || (ref && !blocked.includes(ref.toLowerCase()) ? ref : null) || fromContext || cleanPhoneType(text) || null;\n  const tokens = String(phoneType || '').trim().split(/\\s+/).filter(Boolean);\n  const brand = tokens.length > 0 ? tokens[0] : null;\n  const model = tokens.length > 1 ? tokens.slice(1).join(' ') : null;\n  const rawBudget = $json.rules_output?.resolver_input?.product_context?.budget_etb ?? $json.session?.collected_constraints?.budget_etb ?? null;\n  const maxPrice = rawBudget === null || rawBudget === undefined || rawBudget === '' ? null : (Number.isFinite(Number(rawBudget)) && Number(rawBudget) > 0 ? Number(rawBudget) : null);\n  return {\n    sellerId: 'tedytech',\n    brand,\n    model,\n    maxPrice,\n  };\n})()) }}",
  "options": {}
}
`

## Node: Business Data Resolver
`javascript
let base = {};
try {
  base = $item(0).$node['Rules Layer'].json ?? {};
} catch {
  base = {};
}
const event = base.event && typeof base.event === 'object' ? base.event : {};
const session = base.session && typeof base.session === 'object' ? base.session : {};
const client_config = base.client_config && typeof base.client_config === 'object' ? base.client_config : {};
const understanding_output = base.understanding_output && typeof base.understanding_output === 'object' ? base.understanding_output : {};
const rules_output = base.rules_output && typeof base.rules_output === 'object' ? base.rules_output : {};
const resolverInput = rules_output.resolver_input && typeof rules_output.resolver_input === 'object' ? rules_output.resolver_input : {};
const inputItems = $input.all().map((item) => item.json ?? {});

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizeNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const source = value.trim().toLowerCase();
  if (!source) return null;
  const thousandMatch = source.match(/\b(\d+(?:[.,]\d+)?)\s*(?:k|thousand)\b/);
  if (thousandMatch) {
    const multiplier = Number(thousandMatch[1].replace(',', '.'));
    return Number.isFinite(multiplier) ? Math.round(multiplier * 1000) : null;
  }
  const numericChunks = source.match(/\d[\d\s,._]*/g);
  if (!numericChunks) return null;
  for (const chunk of numericChunks) {
    const compact = chunk.replace(/[\s_]/g, '');
    if (!compact) continue;
    const grouped = compact.split(/[.,]/);
    if (grouped.length > 1 && grouped.every((part, index) => (index === 0 ? /^\d+$/.test(part) : /^\d{3}$/.test(part)))) {
      const groupedValue = Number(grouped.join(''));
      if (Number.isFinite(groupedValue)) return groupedValue;
    }
    const plainValue = Number(compact.replace(/,/g, ''));
    if (Number.isFinite(plainValue)) return plainValue;
  }
  return null;
};
const normalizeStorageValue = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const gbMatch = trimmed.match(/\b(32|64|128|256|512|1024)\b/i);
  return gbMatch ? (gbMatch[1] + 'GB') : trimmed;
};
const extractStorage = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/\b(32|64|128|256|512|1024)\s*gb\b/i);
  return match ? (match[1] + 'GB') : null;
};
const normalizeProduct = (value, index) => {
  if (value === null || value === undefined || !isRecord(value)) return null;
  const priceValue = value.price_etb ?? value.price ?? value.amount ?? null;
  const stockQty = normalizeNullableNumber(value.stockQuantity ?? value.stock_quantity ?? value.stock ?? null);
  return {
    id: String(value.id ?? value._id ?? value.product_id ?? value.sku ?? ('product_' + index)),
    brand: normalizeText(value.brand),
    model: normalizeText(value.model ?? value.phoneType ?? value.name ?? value.title),
    price_etb: normalizeNullableNumber(priceValue),
    storage: normalizeStorageValue(String(value.storage ?? '')),
    condition: normalizeText(value.condition),
    stock_status: stockQty === null ? null : (stockQty > 0 ? 'in_stock' : 'out_of_stock'),
    stock_quantity: stockQty,
    raw: value,
  };
};
const looksLikeProductRecord = (value) => isRecord(value) && ['id', '_id', 'product_id', 'sku', 'brand', 'model', 'phoneType', 'name', 'title', 'price', 'price_etb', 'amount'].some((key) => Object.prototype.hasOwnProperty.call(value, key));
const collectRemoteProducts = (items) => {
  const flattened = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      flattened.push(...item.filter(looksLikeProductRecord));
      continue;
    }
    if (isRecord(item) && Array.isArray(item.products)) {
      flattened.push(...item.products.filter(looksLikeProductRecord));
      continue;
    }
    if (looksLikeProductRecord(item)) {
      flattened.push(item);
    }
  }
  const deduped = [];
  const seen = new Set();
  for (const value of flattened) {
    const normalized = normalizeProduct(value, deduped.length + 1);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    deduped.push(normalized);
  }
  return deduped;
};

const remoteProducts = collectRemoteProducts(inputItems);
const result_mode = remoteProducts.length > 0 ? 'products_found' : 'no_products';
const products = remoteProducts;

const shownProducts = Array.isArray(session.flow_context?.buy_flow?.shown_products)
  ? session.flow_context.buy_flow.shown_products.map(normalizeProduct).filter(Boolean)
  : [];
const currentInterest = normalizeProduct(session.flow_context?.buy_flow?.current_interest, shownProducts.length + 10);
const sessionConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const anchorMode = normalizeText(resolverInput.anchor_mode) ?? (resolverInput.budget_only_query ? 'broad' : 'anchored');
const searchScope = anchorMode === 'anchored' ? 'anchored' : (anchorMode === 'ambiguous' ? 'ambiguous' : 'broad');
const budgetOnlyQuery = Boolean(resolverInput.budget_only_query);
const sessionConstraints = {
  budget_etb: normalizeNullableNumber(sessionConstraintsSource.budget_etb),
  brand: anchorMode === 'anchored' ? normalizeText(sessionConstraintsSource.brand ?? currentInterest?.brand ?? null) : null,
  model: anchorMode === 'anchored' ? normalizeText(sessionConstraintsSource.model ?? currentInterest?.model ?? null) : null,
  storage: anchorMode === 'anchored' ? normalizeStorageValue(sessionConstraintsSource.storage ?? currentInterest?.storage ?? null) : null,
  condition: anchorMode === 'anchored' ? normalizeText(sessionConstraintsSource.condition ?? currentInterest?.condition ?? null) : null,
};
const productContextSource = isRecord(resolverInput.product_context) ? resolverInput.product_context : {};
let effectiveConstraints = {
  budget_etb: normalizeNullableNumber(productContextSource.budget_etb) ?? sessionConstraints.budget_etb,
  brand: anchorMode === 'anchored' ? normalizeText(productContextSource.brand) ?? sessionConstraints.brand : normalizeText(productContextSource.brand) ?? null,
  model: anchorMode === 'anchored' ? normalizeText(productContextSource.model) ?? sessionConstraints.model : normalizeText(productContextSource.model) ?? null,
  storage: anchorMode === 'anchored' ? normalizeStorageValue(productContextSource.storage) ?? sessionConstraints.storage ?? extractStorage(String(event.text ?? '')) : normalizeStorageValue(productContextSource.storage) ?? extractStorage(String(event.text ?? '')),
  condition: anchorMode === 'anchored' ? normalizeText(productContextSource.condition) ?? sessionConstraints.condition : normalizeText(productContextSource.condition) ?? null,
};

const candidateProducts = products.length > 0 ? products : shownProducts;
const productNameForMatch = (product) => [product.brand, product.model].filter(Boolean).join(' ').trim().toLowerCase();
if (products.length > 0) {
  if (effectiveConstraints.model) {
    const hasModelMatch = candidateProducts.some((product) => productNameForMatch(product).includes(effectiveConstraints.model.toLowerCase()));
    if (!hasModelMatch) effectiveConstraints = { ...effectiveConstraints, model: null };
  }
  if (effectiveConstraints.brand) {
    const hasBrandMatch = candidateProducts.some((product) => product.brand && product.brand.toLowerCase().includes(effectiveConstraints.brand.toLowerCase()));
    if (!hasBrandMatch) effectiveConstraints = { ...effectiveConstraints, brand: null };
  }
  if (effectiveConstraints.storage) {
    const hasStorageMatch = candidateProducts.some((product) => product.storage && normalizeStorageValue(product.storage) === normalizeStorageValue(effectiveConstraints.storage));
    if (!hasStorageMatch) effectiveConstraints = { ...effectiveConstraints, storage: null };
  }
  if (effectiveConstraints.condition) {
    const hasConditionMatch = candidateProducts.some((product) => product.condition && product.condition.toLowerCase() === effectiveConstraints.condition.toLowerCase());
    if (!hasConditionMatch) effectiveConstraints = { ...effectiveConstraints, condition: null };
  }
}
const requestedName = anchorMode === 'ambiguous' ? null : normalizeText(resolverInput.resolved_product_name)
  ?? ([effectiveConstraints.brand, effectiveConstraints.model].filter(Boolean).join(' ').trim() || null);
let selectedProduct = null;
if (anchorMode !== 'ambiguous' && resolverInput.resolved_reference?.id) {
  selectedProduct = candidateProducts.find((product) => product.id === resolverInput.resolved_reference.id) ?? null;
}
if (!selectedProduct && requestedName) {
  const lowered = requestedName.toLowerCase();
  selectedProduct = candidateProducts.find((product) => {
    const name = productNameForMatch(product);
    return Boolean(name) && name === lowered;
  }) ?? null;
}
if (!selectedProduct && currentInterest && products.length === 0 && anchorMode === 'anchored') {
  const sameModel = effectiveConstraints.model && currentInterest.model && currentInterest.model.toLowerCase() === effectiveConstraints.model.toLowerCase();
  const sameBrand = effectiveConstraints.brand && currentInterest.brand && currentInterest.brand.toLowerCase() === effectiveConstraints.brand.toLowerCase();
  if (!effectiveConstraints.model || sameModel || sameBrand) {
    selectedProduct = currentInterest;
  }
}

const matchesConstraints = (product) => {
  if (!product) return false;
  if (effectiveConstraints.brand && (!product.brand || !product.brand.toLowerCase().includes(effectiveConstraints.brand.toLowerCase()))) return false;
  if (effectiveConstraints.model) {
    const name = productNameForMatch(product);
    if (!name.includes(effectiveConstraints.model.toLowerCase())) return false;
  }
  if (effectiveConstraints.storage && (!product.storage || normalizeStorageValue(product.storage) !== normalizeStorageValue(effectiveConstraints.storage))) return false;
  if (effectiveConstraints.condition && (!product.condition || product.condition.toLowerCase() !== effectiveConstraints.condition.toLowerCase())) return false;
  return true;
};

const filteredProducts = candidateProducts.filter(matchesConstraints);
const budgetLimit = normalizeNullableNumber(effectiveConstraints.budget_etb);
const narrowBudgetMatchedProducts = budgetLimit === null
  ? filteredProducts
  : filteredProducts.filter((product) => Number.isFinite(product.price_etb) && product.price_etb <= budgetLimit);
const broadBudgetMatchedProducts = budgetLimit === null
  ? filteredProducts
  : candidateProducts
      .filter((product) => Number.isFinite(product.price_etb) && product.price_etb <= budgetLimit)
      .sort((a, b) => a.price_etb - b.price_etb);
const budgetFallbackProducts = budgetLimit === null
  ? []
  : (filteredProducts.length > 0
      ? filteredProducts
          .filter((product) => Number.isFinite(product.price_etb) && product.price_etb > budgetLimit)
          .sort((a, b) => a.price_etb - b.price_etb)
      : candidateProducts
          .filter((product) => Number.isFinite(product.price_etb) && product.price_etb > budgetLimit)
          .sort((a, b) => a.price_etb - b.price_etb));
const exactBudgetMatchFound = budgetLimit === null ? filteredProducts.length > 0 : broadBudgetMatchedProducts.length > 0;
const effectiveProducts = budgetLimit === null
  ? filteredProducts
  : (narrowBudgetMatchedProducts.length > 0
      ? narrowBudgetMatchedProducts
      : (broadBudgetMatchedProducts.length > 0 ? broadBudgetMatchedProducts : budgetFallbackProducts));
const selectedWithinBudget = selectedProduct && (budgetLimit === null || !Number.isFinite(selectedProduct.price_etb) || selectedProduct.price_etb <= budgetLimit)
  ? selectedProduct
  : null;
const replyProducts = anchorMode === 'ambiguous'
  ? []
  : (selectedWithinBudget
      ? [selectedWithinBudget]
      : effectiveProducts.slice(0, 5));
const numericPrices = replyProducts.map((product) => product.price_etb).filter((value) => Number.isFinite(value));
const priceRange = numericPrices.length > 0 ? { min: Math.min(...numericPrices), max: Math.max(...numericPrices) } : null;
const mapUrl = 'https://maps.google.com/maps?q=8.998702,38.786851&ll=8.998702,38.786851&z=16';
const STORE_INFO = {
  store_name: 'TedyTech',
  address_text_amharic: 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።',
  address_text_english: 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።',
  address_text: 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።',
  map_url: mapUrl,
};
let result_type = 'no_match';
let next_step = 'ask_clarification';
let exchange_context = null;

if (anchorMode === 'ambiguous') {
  result_type = 'clarification_needed';
  next_step = 'ask_clarification';
} else if (rules_output.reply_mode === 'clarify_reference') {
  result_type = 'clarification_needed';
  next_step = 'ask_clarification';
} else if (resolverInput.flow === 'exchange') {
  result_type = 'exchange_offer';
  next_step = 'ask_clarification';
  exchange_context = {
    current_interest: session.flow_context?.buy_flow?.current_interest ?? null,
    collected_constraints: effectiveConstraints,
  };
} else if (resolverInput.flow === 'info') {
  result_type = 'store_info';
  next_step = 'show_store_info';
} else if (resolverInput.flow === 'support') {
  result_type = 'no_match';
  next_step = 'ask_clarification';
} else if (selectedWithinBudget) {
  result_type = 'single_product';
  next_step = 'show_single';
} else if (effectiveProducts.length > 1) {
  result_type = 'multiple_options';
  next_step = 'show_options';
} else if (effectiveProducts.length === 1) {
  result_type = 'single_product';
  next_step = 'show_single';
} else if ((resolverInput.missing_fields ?? []).length > 0) {
  result_type = 'clarification_needed';
  next_step = 'ask_clarification';
}

const resolver_output = {
  result_mode,
  result_type,
  products: replyProducts,
  exchange_context,
  store_info: result_type === 'store_info' ? STORE_INFO : null,
  next_step,
  anchor_mode: anchorMode,
  search_scope: searchScope,
  anchor_evidence: resolverInput.anchor_evidence ?? null,
  facts_for_reply: {
    product_found: Boolean(selectedProduct || replyProducts.length > 0),
    how_many_options: replyProducts.length,
    stock_status: selectedProduct?.stock_status ?? (replyProducts[0]?.stock_status ?? null),
    price_range: priceRange,
    budget_limit: budgetLimit,
    budget_exact_match_found: exactBudgetMatchFound,
    budget_fallback_used: budgetLimit !== null && !exactBudgetMatchFound,
    search_scope: searchScope,
    store_info_available: result_type === 'store_info',
    store_name: result_type === 'store_info' ? STORE_INFO.store_name : null,
    address_text: result_type === 'store_info' ? STORE_INFO.address_text : null,
    map_url: result_type === 'store_info' ? STORE_INFO.map_url : null,
  },
};

return [{
  json: {
    event,
    session,
    client_config,
    understanding_output,
    rules_output,
    result_mode,
    products,
    resolver_output,
  },
}];
`

## Node: Reply AI
`json
{
  "method": "POST",
  "url": "https://openrouter.ai/api/v1/chat/completions",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Content-Type",
        "value": "application/json"
      },
      {
        "name": "Authorization",
        "value": "={{ 'Bearer ' + $env.OPENROUTER_API_KEY }}"
      }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({\n  model: 'google/gemini-3.1-flash-lite-preview',\n  temperature: 0.05,\n  response_format: { type: 'json_object' },\n  messages: [\n    { role: 'system', content: \"You are Pass 2 Reply AI for the TedyTech Telegram bot.\\\\nReturn ONLY one valid JSON object with exactly this shape: {\\\"reply_text\\\":\\\"string\\\"}.\\\\nDo not add any other keys. Do not explain anything. Do not add markdown fences.\\\\nUse only the provided customer_text, understanding_output, rules_output, resolver_output, reply_context, last_messages, and client_config.\\\\nNever invent stock, price, warranty, availability, delivery, location, or shop facts.\\\\nKeep the reply to max 3 short lines.\\\\nDefault to natural Amharic in Ethiopic script for conversation.\\\\nUse English only for brand, model, storage, and product names where natural.\\\\nDo not produce awkward English-Amharic transliteration.\\\\nDo not use vague words like technology, electronics, gadgets, or accessories unless the customer explicitly asks for them.\\\\nPrefer wording around phone, mobile, model, exchange, shop, price, and availability.\\\\nOne emoji max, and only when the tone is playful.\\\\nStrict continuity rules:\\\\n- If reply_context.should_greet is false, never greet, never welcome, and never reopen with a seller introduction.\\\\n- Only use welcome or greeting opener text on explicit restart or start_reset. Do not use welcome phrasing for normal business turns.\\\\n- If reply_context.has_active_context is true, continue that context instead of asking a generic buying-or-exchange question.\\\\n- If the user message is clear, respond to that exact message and do not replace it with a generic opening.\\\\n- If current_flow or current_topic exists, use it to continue the thread.\\\\nStrict reply mode rules:\\\\n- acknowledge_and_close: short close only, no question, no greeting.\\\\n- off_topic_redirect: short natural redirect only, at most one gentle next-step question, no greeting, and no product-discovery opener. Do not ask what phone or model the customer wants unless the current message itself contains product intent.\\\\n- small_talk_redirect: short natural acknowledgment plus one neutral TedyTech-help next step, no repeated welcome, and no product-discovery opener.\\\\n- clarify_reference: ask which one the customer means, no product facts, no generic reopening.\\\\n- resume_previous_flow: continue the previous thread directly, no restart behavior.\\\\n- business_resolve: use resolver facts only. If resolver facts are weak, ask one narrow follow-up tied to the actual customer text or current context, or honestly say the exact detail is not available in the current data. Do not pivot into product discovery unless the customer message itself also contains product intent. If understanding_output.message_function is negotiation or understanding_output.business_intent is pricing, stay price-focused and do not reply with a generic acknowledgment. Address the price concern directly, then ask one narrow price/model follow-up if needed.\\ If resolver_output.result_type is single_product and resolver_output.facts_for_reply.stock_status is in_stock, do not say unavailable or out of stock. Respond as available and use the grounded price if resolver_output.facts_for_reply.price_range is present. If resolver_output.result_type is no_match, only then say the exact model is not currently available.\\n- handoff_admin: brief reassurance only, no question, no greeting.\\\\nStore-info rules:\\\\n- If rules_output.resolver_input.flow is info or understanding_output.topic is store_info, answer only the store-info request.\\\\n- If resolver_output.result_type is store_info and resolver_output.store_info is present, use resolver_output.store_info.address_text directly and keep the reply grounded. Do not say the address is unavailable.\\\\n- If grounded store-info facts are missing, do not invent address, location, hours, or contact details. Say briefly that the exact store detail is not available here right now.\\\\n- After a store-info answer, do not append a product-search question unless the same message also asked about products.\\\\nNarrow clarification rules:\\\\n- Do not ask buying-or-exchange unless intent is truly unclear and there is no useful session context.\\\\n- If the customer asked about price, ask a narrow follow-up about the model or brand if needed.\\\\n- If the customer asked available?, use the current item or current flow if present; do not reopen from zero.\\\\n- If the customer said that one or cheaper one, stay in reference clarification or prior-context continuation; do not reopen with a catalog greeting.\\\\nStyle rules:\\\\n- Sound like a practical Ethiopian phone seller on Telegram without forcing sales behavior into every message.\\\\n- Be short, direct, natural, and sales-aware when the message is actually business-related.\\\\n- For social or off-topic messages, stay natural and do not drag the reply into phone discovery.\\n- Do not output unrelated acknowledgment-only text for negotiation, pricing, store-info, or refinement messages.\\\\n- No robotic assistant phrasing.\\\\n- No broad onboarding copy unless this is truly a new conversation.\\\\nOutput JSON only.\" },\n    {\n      role: 'user',\n      content: JSON.stringify({\n        customer_text: $json.event?.text ?? '',\n        understanding_output: $json.understanding_output ?? null,\n        rules_output: $json.rules_output ?? null,\n        resolver_output: $json.resolver_output ?? null,\n        reply_context: {\n          event_type: $json.event?.event_type ?? null,\n          current_topic: $json.session?.conversation_state?.current_topic ?? null,\n          current_flow: $json.session?.conversation_state?.current_flow ?? null,\n          is_active: $json.session?.conversation_state?.is_active ?? true,\n          message_count: Number($json.session?.message_count ?? 0),\n          history_count: Array.isArray($json.session?.conversation_history) ? $json.session.conversation_history.length : 0,\n          has_active_context: Boolean(\n            ($json.session?.conversation_state?.current_flow ?? null)\n            || ($json.session?.conversation_state?.current_topic ?? null)\n            || (Array.isArray($json.session?.conversation_history) && $json.session.conversation_history.length > 0)\n            || (Array.isArray($json.session?.flow_context?.buy_flow?.shown_products) && $json.session.flow_context.buy_flow.shown_products.length > 0)\n            || $json.session?.flow_context?.buy_flow?.current_interest\n          ),\n          should_greet: Boolean($json.event?.event_type === 'start_reset'),\n        },\n        last_messages: Array.isArray($json.session?.conversation_history) ? $json.session.conversation_history.slice(-3) : [],\n        client_config: $json.client_config ?? null,\n      }),\n    },\n  ],\n}) }}",
  "options": {}
}
`

## Node: Validation
`javascript
let base = {};
try {
  base = $item(0).$node['Business Data Resolver'].json ?? {};
} catch {
  base = {};
}
if (!base.rules_output) {
  try {
    base = $item(0).$node['Rules Layer'].json ?? base;
  } catch {}
}
const replyPayload = $json ?? {};
const event = base.event && typeof base.event === 'object' ? base.event : {};
const session = base.session && typeof base.session === 'object' ? base.session : {};
const client_config = base.client_config && typeof base.client_config === 'object' ? base.client_config : {};
const understanding_output = base.understanding_output && typeof base.understanding_output === 'object' ? base.understanding_output : {};
const rules_output = base.rules_output && typeof base.rules_output === 'object' ? base.rules_output : {};
const resolver_output = base.resolver_output && typeof base.resolver_output === 'object' ? base.resolver_output : null;
const resolverIsStoreInfo = resolver_output?.result_type === 'store_info';
const issues = [];
const blockingIssues = [];
const now = Date.now();

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizeNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const source = value.trim().toLowerCase();
  if (!source) return null;
  const thousandMatch = source.match(/\b(\d+(?:[.,]\d+)?)\s*(?:k|thousand)\b/);
  if (thousandMatch) {
    const multiplier = Number(thousandMatch[1].replace(',', '.'));
    return Number.isFinite(multiplier) ? Math.round(multiplier * 1000) : null;
  }
  const numericChunks = source.match(/\d[\d\s,._]*/g);
  if (!numericChunks) return null;
  for (const chunk of numericChunks) {
    const compact = chunk.replace(/[\s_]/g, '');
    if (!compact) continue;
    const grouped = compact.split(/[.,]/);
    if (grouped.length > 1 && grouped.every((part, index) => (index === 0 ? /^\d+$/.test(part) : /^\d{3}$/.test(part)))) {
      const groupedValue = Number(grouped.join(''));
      if (Number.isFinite(groupedValue)) return groupedValue;
    }
    const plainValue = Number(compact.replace(/,/g, ''));
    if (Number.isFinite(plainValue)) return plainValue;
  }
  return null;
};
const parseJsonObject = (value) => {
  if (!value) return null;
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const parsedReply = parseJsonObject(replyPayload.choices?.[0]?.message?.content)
  || parseJsonObject(replyPayload.output_text)
  || parseJsonObject(replyPayload.text)
  || parseJsonObject(replyPayload.data)
  || parseJsonObject(replyPayload.result)
  || parseJsonObject(replyPayload);

const eventText = normalizeText(event.text) ?? '';
const lowerText = eventText.toLowerCase();
const callbackData = normalizeText(event.callback_query?.data) ?? null;
const mapUrl = 'https://maps.google.com/maps?q=8.998702,38.786851&ll=8.998702,38.786851&z=16';
const storeCtaText = 'ለተጨማሪ ስልኮች እና እቃዎች ከታች ያለውን ቁልፍ ተጠቅመው ወደ ሱቃችን ይግቡ።';
const buildInlineKeyboard = (rows) => ({
  replyMarkup: 'inlineKeyboard',
  inlineKeyboard: {
    rows: rows.map((row) => ({
      row: {
        buttons: row.map((button) => ({
          text: button.text,
          additionalFields: button.additionalFields ?? {},
        })),
      },
    })),
  },
});
const startMenuMarkup = buildInlineKeyboard([
  [
    { text: 'ስልክ ይግዙ', additionalFields: { callback_data: 'start_buy' } },
    { text: 'ስልክ ይቀይሩ', additionalFields: { callback_data: 'start_exchange' } },
  ],
]);
const confirmReservationMarkup = buildInlineKeyboard([
  [
    { text: 'መያዝ ያረጋግጡ', additionalFields: { callback_data: 'confirm_reservation' } },
  ],
]);
const storeMarkup = buildInlineKeyboard([
  [
    { text: 'ሱቅ ይጎብኙ', additionalFields: { url: mapUrl } },
  ],
]);
const startBuyAction = callbackData === 'start_buy';
const startExchangeAction = callbackData === 'start_exchange';
const confirmReservationAction = callbackData === 'confirm_reservation';
const reserveIntent = confirmReservationAction || /\b(reserve|reservation|book|hold|save it)\b/i.test(lowerText);
const visitIntent = /\b(visit|come see|come to the store|come in person|physically|in person|lemta|mache\s+lemta|bota|adrasachin)\b/i.test(lowerText) || ['??', '????', '??????', '??', '????'].some((term) => lowerText.includes(term));
const photoRequest = /\b(photo|photos|picture|pictures|image|images|see the phone|view photos)\b/i.test(lowerText);
const flowIsExchange = startExchangeAction
  || rules_output.resolver_input?.flow === 'exchange'
  || session.conversation_state?.current_flow === 'exchange'
  || understanding_output.business_intent === 'exchange';
const flowIsBuy = startBuyAction
  || confirmReservationAction
  || reserveIntent
  || visitIntent
  || rules_output.resolver_input?.flow === 'buy'
  || session.conversation_state?.current_flow === 'buy'
  || ['product_search', 'pricing'].includes(understanding_output.business_intent ?? '');
const hasProductReply = Boolean(resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length > 0 && !flowIsExchange);
const priceShown = Boolean(resolver_output?.facts_for_reply?.price_range);
const budgetFallbackUsed = Boolean(resolver_output?.facts_for_reply?.budget_fallback_used);
const pricingFollowUp = ['refinement', 'clarification'].includes(normalizeText(understanding_output.message_function) ?? '');
const detectPhoneModel = (value) => {
  const source = String(value || '').trim();
  if (!source) return null;
  const match = source.match(/\b(?:iphone\s*\d+(?:\s*(?:pro\s*max|pro|max|plus|mini))?|samsung\s*[a-z0-9+ ]+|pixel\s*[a-z0-9+ ]+|redmi\s*[a-z0-9+ ]+|xiaomi\s*[a-z0-9+ ]+|tecno\s*[a-z0-9+ ]+|infinix\s*[a-z0-9+ ]+|oppo\s*[a-z0-9+ ]+|vivo\s*[a-z0-9+ ]+|realme\s*[a-z0-9+ ]+|itel\s*[a-z0-9+ ]+|nokia\s*[a-z0-9+ ]+)\b/i);
  return match ? match[0].trim() : null;
};
const detectStorage = (value) => {
  const source = String(value || '').trim();
  const match = source.match(/\b(32|64|128|256|512|1024)\s*gb\b/i);
  return match ? (match[1] + 'GB') : null;
};
const detectBatteryHealth = (value) => {
  const source = String(value || '').trim();
  const match = source.match(/\b(?:battery health|battery)\s*[:\-]?\s*(\d{2,3})\s*%?/i);
  return match ? (match[1] + '%') : null;
};
const detectRam = (value) => {
  const source = String(value || '').trim();
  const match = source.match(/\b(\d{1,3})\s*gb\s*ram\b/i);
  return match ? (match[1] + 'GB') : null;
};
const detectCondition = (value) => {
  const source = String(value || '').toLowerCase();
  if (/\b(like new|excellent|very good|good condition)\b/.test(source)) return 'good';
  if (/\b(fair|normal|average)\b/.test(source)) return 'fair';
  if (/\b(broken|damaged|cracked|bad)\b/.test(source)) return 'damaged';
  return null;
};
const extractPriceEtb = (value) => {
  const source = String(value || '').replace(/,/g, ' ').trim();
  const kMatch = source.match(/\b(\d+(?:\.\d+)?)\s*k\b/i);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const currencyMatch = source.match(/(?:etb|birr|br|brr)\s*[:\-]?\s*(\d{3,6})/i);
  if (currencyMatch) return Number(currencyMatch[1]);
  const plainMatch = source.match(/\b(\d{4,6})\b/);
  return plainMatch ? Number(plainMatch[1]) : null;
};
const isStartReset = event.event_type === 'start_reset';
const currentInterestRecord = session.flow_context?.buy_flow?.current_interest && typeof session.flow_context.buy_flow.current_interest === 'object' ? session.flow_context.buy_flow.current_interest : {};
const currentInterestModel = normalizeText(currentInterestRecord.model ?? currentInterestRecord.name ?? null);
const currentInterestStorage = normalizeText(currentInterestRecord.storage ?? null);
const existingExchangeDetails = isRecord(session.exchange_details) ? session.exchange_details : {};
const exchangeBrand = normalizeText(existingExchangeDetails.brand)
  ?? (/iphone/i.test(lowerText) ? 'iPhone' : (/samsung/i.test(lowerText) ? 'Samsung' : null));
const exchangeModel = normalizeText(existingExchangeDetails.model)
  ?? detectPhoneModel(eventText)
  ?? currentInterestModel;
const exchangeStorage = normalizeText(existingExchangeDetails.storage)
  ?? detectStorage(eventText)
  ?? currentInterestStorage;
const exchangeBatteryHealth = normalizeText(existingExchangeDetails.battery_health)
  ?? detectBatteryHealth(eventText);
const exchangeRam = normalizeText(existingExchangeDetails.ram)
  ?? detectRam(eventText);
const exchangeCondition = normalizeText(existingExchangeDetails.condition)
  ?? detectCondition(eventText);
const exchangeExpectedPriceEtb = normalizeNullableNumber(existingExchangeDetails.expected_price_etb)
  ?? extractPriceEtb(eventText);
const exchangeHasImages = Boolean(event.has_images || Number(event.photo_count ?? 0) > 0 || existingExchangeDetails.has_images);
const exchangePhotoCount = Number.isFinite(Number(event.photo_count)) ? Number(event.photo_count) : (Number(existingExchangeDetails.photo_count) || 0);
const exchangeDetailsComplete = exchangeBrand === 'iPhone'
  ? Boolean(exchangeModel && exchangeStorage && exchangeBatteryHealth)
  : (exchangeBrand === 'Samsung'
      ? Boolean(exchangeModel && exchangeStorage && exchangeRam)
      : Boolean(exchangeModel && (exchangeStorage || exchangeCondition || exchangeExpectedPriceEtb)));
const exchangeDetails = {
  brand: exchangeBrand,
  model: exchangeModel,
  storage: exchangeStorage,
  battery_health: exchangeBatteryHealth,
  ram: exchangeRam,
  condition: exchangeCondition,
  expected_price_etb: exchangeExpectedPriceEtb,
  has_images: exchangeHasImages,
  photo_count: exchangePhotoCount,
  details_complete: exchangeDetailsComplete,
};
const startActionSelected = startBuyAction || startExchangeAction;
const buyState = {
  closed: confirmReservationAction || visitIntent || exchangeDetailsComplete,
  close_reason: confirmReservationAction
    ? 'reserve_confirmed'
    : (visitIntent
        ? 'visit_intent'
        : (reserveIntent
            ? 'reserve_pending'
            : (priceShown && flowIsBuy ? 'price_shared' : null))),
};
const adminSection = flowIsExchange ? 'exchange' : 'inbox';
const adminType = flowIsExchange ? 'exchange' : ((flowIsBuy && !resolverIsStoreInfo) || priceShown || reserveIntent || (visitIntent && !resolverIsStoreInfo) || startActionSelected ? 'buy' : 'general');
const adminStatus = flowIsExchange
  ? (exchangeDetailsComplete ? (exchangeHasImages ? 'hot' : 'warm') : 'cold')
  : (confirmReservationAction || (visitIntent && !resolverIsStoreInfo) || /\b(buy now|i want to buy|i'll take it|take it|confirm it|reserve)\b/i.test(lowerText)
      ? 'hot'
      : ((priceShown || /\b(price|cost|how much|available|availability|stock|budget)\b/i.test(lowerText) || (flowIsBuy && !resolverIsStoreInfo) || hasProductReply)
          ? 'warm'
          : 'cold'));
const adminIntent = flowIsExchange
  ? (exchangeDetailsComplete
      ? (exchangeHasImages ? 'exchange_details_with_images' : 'exchange_details')
      : 'exchange_request')
  : (confirmReservationAction
      ? 'reserve_confirmed'
      : ((visitIntent && !resolverIsStoreInfo)
          ? 'visit_intent'
          : (/\b(buy now|i want to buy|i'll take it|take it|confirm it)\b/i.test(lowerText)
              ? 'buy_now'
              : ((priceShown || /\b(price|cost|how much|available|availability|stock|budget)\b/i.test(lowerText) || hasProductReply)
                  ? 'question'
                  : 'unknown'))));
const adminLead = {
  section: adminSection,
  status: adminStatus,
  type: adminType,
  intent: adminIntent,
  has_images: flowIsExchange ? exchangeHasImages : false,
  brand: flowIsExchange ? exchangeDetails.brand : normalizeText(currentInterestRecord.brand ?? null),
  model: flowIsExchange ? exchangeDetails.model : normalizeText(currentInterestRecord.model ?? currentInterestRecord.name ?? null),
  storage: flowIsExchange ? exchangeDetails.storage : normalizeText(currentInterestRecord.storage ?? null),
  battery_health: flowIsExchange ? exchangeDetails.battery_health : null,
  ram: flowIsExchange ? exchangeDetails.ram : null,
  expected_price_etb: flowIsExchange ? exchangeDetails.expected_price_etb : null,
  closed: flowIsExchange ? exchangeDetailsComplete : (confirmReservationAction || visitIntent),
  close_reason: flowIsExchange
    ? (exchangeDetailsComplete ? 'exchange_details_complete' : null)
    : (confirmReservationAction
        ? 'reserve_confirmed'
        : (visitIntent
            ? 'visit_intent'
            : (reserveIntent ? 'reserve_pending' : (priceShown && flowIsBuy ? 'price_shared' : null)))),
};
const currentFlowOverride = isStartReset
  ? null
  : (startExchangeAction
      ? 'exchange'
      : (startBuyAction || confirmReservationAction || reserveIntent || (visitIntent && !resolverIsStoreInfo) || (flowIsBuy && !resolverIsStoreInfo)
          ? 'buy'
          : (flowIsExchange ? 'exchange' : (rules_output.resolver_input?.flow ?? session.conversation_state?.current_flow ?? null))));
const currentTopicOverride = isStartReset
  ? null
  : (currentFlowOverride === 'exchange'
      ? 'exchange'
      : (currentFlowOverride === 'buy'
          ? 'product'
          : (rules_output.session_update?.last_topic ?? session.conversation_state?.current_topic ?? null)));
let reply_text = typeof parsedReply?.reply_text === 'string' ? parsedReply.reply_text.trim() : '';
let telegram_markup = { replyMarkup: 'none', inlineKeyboard: {} };

if (isStartReset) {
  reply_text = 'እንኳን ወደ TedyTech በደህና መጡ።\nስልክ ይግዙ ወይም ስልክ ይቀይሩ።';
  telegram_markup = startMenuMarkup;
} else if (startBuyAction) {
  reply_text = 'መግዛት የምትፈልጉት ስልክ የትኛው ነው?';
} else if (startExchangeAction) {
  reply_text = 'ለመቀየር የሚያመጡት ስልክ ምንድነው?';
} else if (confirmReservationAction) {
  reply_text = 'መያዝዎ ተረጋግጧል።';
} else if (flowIsExchange) {
  if (exchangeDetailsComplete) {
    reply_text = 'የስልክዎን መረጃ ተቀብለናል። እንመለከታለን እና በቅርቡ እንመለሳለን።';
    if (!exchangeHasImages) {
      reply_text += '\nፎቶዎች ካሉዎት ለተሻለ ግምገማ መላክ ይችላሉ።';
    }
  } else {
    const missingExchangeFields = [];
    if (!exchangeModel) missingExchangeFields.push('model');
    if (!exchangeStorage && (exchangeBrand === 'iPhone' || exchangeBrand === 'Samsung' || currentInterestModel)) missingExchangeFields.push('storage');
    if (exchangeBrand === 'iPhone' && !exchangeBatteryHealth) missingExchangeFields.push('battery health');
    if (exchangeBrand === 'Samsung' && !exchangeRam) missingExchangeFields.push('RAM');
    if (!exchangeBrand && !exchangeModel) missingExchangeFields.push('model');
    if (missingExchangeFields.length > 0) {
      reply_text = 'የሚቀይሩትን ስልክ ' + missingExchangeFields.join(', ') + ' መረጃ ይላኩ።';
    } else {
      reply_text = 'የሚቀይሩትን ስልክ ሞዴል እና መረጃውን ይላኩ።';
    }
    if (!reply_text.includes('ፎቶዎች ካሉዎት ለተሻለ ግምገማ መላክ ይችላሉ።')) {
      reply_text += '\nፎቶዎች ካሉዎት ለተሻለ ግምገማ መላክ ይችላሉ።';
    }
  }
} else if (normalizeText(rules_output.resolver_input?.flow) === 'info' && resolver_output?.result_type === 'store_info') {
  const groundedStoreInfoText = normalizeText(resolver_output?.store_info?.address_text);
  reply_text = groundedStoreInfoText ?? reply_text;
  if (!reply_text) {
    reply_text = 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።';
  }
  if (!reply_text.includes(storeCtaText)) {
    reply_text = reply_text.replace(/\s*$/, '') + '\n' + storeCtaText;
  }
  telegram_markup = storeMarkup;
} else if (!flowIsExchange && visitIntent) {
  reply_text = 'እሺ, ቦታችን ይሄ ነው: ' + mapUrl + '\n' + storeCtaText;
  telegram_markup = storeMarkup;
} else if (!flowIsExchange && photoRequest) {
  reply_text = 'ፎቶዎችን እና ሙሉ መረጃውን በሱቃችን ላይ ማየት ይችላሉ። ከታች ያለውን ቁልፍ ተጠቅመው ይግቡ።';
  telegram_markup = storeMarkup;
} else if (flowIsBuy && reserveIntent && !confirmReservationAction) {
  reply_text = 'መያዝ ይፈልጋሉ ወይስ በአካል መጥተው ማየት ይፈልጋሉ?';
  telegram_markup = confirmReservationMarkup;
} else if (flowIsBuy && hasProductReply) {
  reply_text = reply_text.replace(/\s*\n+\s*/g, ' ').trim();
  if (budgetFallbackUsed) {
    const budgetFallbackNotice = 'በበጀትዎ ውስጥ ትክክለኛ የሚመጣ አልተገኘም፤ ስለዚህ ትንሽ ከፍ ያሉ አማራጮችን እያሳየን ነው።';
    if (!reply_text.includes(budgetFallbackNotice)) {
      reply_text = budgetFallbackNotice + '\n' + reply_text;
    }
  }
  if (!pricingFollowUp && !reply_text.includes('???? ????? ??? ???? ???? ??? ??????')) {
    reply_text = reply_text.replace(/\s*$/, '') + '\n???? ????? ??? ???? ???? ??? ??????';
  }
  if (!reply_text.includes(storeCtaText)) {
    reply_text = reply_text.replace(/\s*$/, '') + '\n' + storeCtaText;
  }
  telegram_markup = storeMarkup;
} else if (flowIsBuy && !reply_text.includes(storeCtaText) && (priceShown || budgetFallbackUsed || /\b(price|cost|availability|available|stock|budget)\b/i.test(lowerText))) {
  reply_text = reply_text.replace(/\s*$/, '') + '\n' + storeCtaText;
  telegram_markup = storeMarkup;
}

const closeQuestion = flowIsBuy && hasProductReply && !pricingFollowUp
  ? '??? ????? ??? ???? ???? ??? ??????'
  : null;
const budgetFallbackNotice = budgetFallbackUsed && !resolverIsStoreInfo
  ? '????? ??? ????? ???? ??????? ???? ??? ?? ?? ?????? ????? ???'
  : null;
const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
const lastAssistantText = [...history].reverse().find((entry) => entry && typeof entry === 'object' && entry.role === 'assistant' && typeof entry.text === 'string' && entry.text.trim())?.text ?? '';
const replyLines = reply_text
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const closingLines = [];
if (budgetFallbackNotice) closingLines.push(budgetFallbackNotice);
if (closeQuestion && !lastAssistantText.includes(closeQuestion)) closingLines.push(closeQuestion);
if ((resolverIsStoreInfo || visitIntent || photoRequest || (flowIsBuy && hasProductReply)) && !lastAssistantText.includes(storeCtaText)) closingLines.push(storeCtaText);
const bodyLines = replyLines.filter((line) => !closingLines.includes(line));
const maxBodyLines = Math.max(0, 3 - closingLines.length);
reply_text = bodyLines.slice(0, maxBodyLines).concat(closingLines).join('\n').trim();
if (!reply_text) { issues.push('missing_reply_text'); blockingIssues.push('missing_reply_text'); }
const lineCount = reply_text ? reply_text.split(/\r?\n/).filter((line) => line.trim()).length : 0;
if (lineCount > 3) { issues.push('reply_exceeds_max_lines'); blockingIssues.push('reply_exceeds_max_lines'); }
if (rules_output.reply_mode === 'acknowledge_and_close' && /[?]/.test(reply_text)) issues.push('acknowledge_and_close_should_not_ask_question');
if (rules_output.reply_mode === 'handoff_admin' && /[?]/.test(reply_text)) issues.push('handoff_admin_should_not_ask_question');
if (rules_output.should_call_resolver && !resolver_output) { issues.push('resolver_expected_but_missing'); blockingIssues.push('resolver_expected_but_missing'); }
if (!rules_output.should_call_resolver && rules_output.reply_mode === 'business_resolve') { issues.push('business_resolve_requires_resolver'); blockingIssues.push('business_resolve_requires_resolver'); }
if (rules_output.reply_mode === 'business_resolve' && resolver_output && !['single_product', 'multiple_options', 'no_match', 'out_of_stock', 'clarification_needed', 'exchange_offer', 'store_info'].includes(resolver_output.result_type)) { issues.push('invalid_resolver_result_type'); blockingIssues.push('invalid_resolver_result_type'); }
if (!['business_resolve', 'off_topic_redirect', 'small_talk_redirect', 'clarify_reference', 'resume_previous_flow', 'acknowledge_and_close', 'handoff_admin'].includes(rules_output.reply_mode)) { issues.push('invalid_reply_mode_contract'); blockingIssues.push('invalid_reply_mode_contract'); }

const valid = blockingIssues.length === 0;
const safe_to_send = Boolean(reply_text) && blockingIssues.length === 0;
const nextHistory = (isStartReset ? [] : history)
  .concat([{ role: 'user', text: String(event.text ?? ''), timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : now }])
  .concat(safe_to_send ? [{ role: 'assistant', text: reply_text, timestamp: now }] : [])
  .slice(-12);

const shownProducts = isStartReset
  ? []
  : ((normalizeText(rules_output.resolver_input?.anchor_mode) ?? 'broad') === 'broad'
      ? (resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length > 0
          ? resolver_output.products
          : [])
      : (resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length > 0
          ? resolver_output.products
          : (Array.isArray(session.flow_context?.buy_flow?.shown_products) ? session.flow_context.buy_flow.shown_products : [])));
const anchorMode = normalizeText(rules_output.resolver_input?.anchor_mode) ?? 'broad';
const currentTurnIndex = Math.max(1, Number(session.message_count ?? 0) + 1);
const resolverProducts = isStartReset
  ? []
  : (resolver_output && Array.isArray(resolver_output.products) ? resolver_output.products : []);
const currentInterest = isStartReset
  ? null
  : (resolverProducts.length === 1
      ? resolverProducts[0]
      : (anchorMode === 'anchored'
          ? (rules_output.resolver_input?.resolved_reference?.raw ?? session.flow_context?.buy_flow?.current_interest ?? null)
          : null));
const lastOfferContextSource = isRecord(session.last_offer_context) ? session.last_offer_context : {};
const nextOfferType = resolverProducts.length === 1 ? 'single' : (resolverProducts.length > 1 ? 'multi' : 'none');
const nextLastOfferContext = isStartReset
  ? { turn_index: null, offer_type: 'none', product_ids: [] }
  : (nextOfferType === 'none'
      ? (isRecord(session.last_offer_context)
          ? {
              turn_index: normalizeNullableNumber(lastOfferContextSource.turn_index),
              offer_type: lastOfferContextSource.offer_type === 'single' || lastOfferContextSource.offer_type === 'multi' || lastOfferContextSource.offer_type === 'none'
                ? lastOfferContextSource.offer_type
                : 'none',
              product_ids: Array.isArray(lastOfferContextSource.product_ids)
                ? lastOfferContextSource.product_ids.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim()).slice(0, 3)
                : [],
            }
          : { turn_index: null, offer_type: 'none', product_ids: [] })
      : {
          turn_index: currentTurnIndex,
          offer_type: nextOfferType,
          product_ids: resolverProducts
            .slice(0, 3)
            .map((product) => String(product?.id ?? product?._id ?? product?.product_id ?? product?.sku ?? '')).filter(Boolean),
        });
const nextLastConstrainedTurn = isStartReset
  ? null
  : (rules_output.session_update?.last_constrained_turn ?? session.last_constrained_turn ?? null);
const flow = isStartReset ? null : (currentFlowOverride ?? rules_output.resolver_input?.flow ?? session.conversation_state?.current_flow ?? null);
const sessionConstraintSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const updateConstraintSource = isRecord(rules_output.session_update?.collected_constraints) ? rules_output.session_update.collected_constraints : {};
const mergedConstraints = isStartReset
  ? { budget_etb: null, brand: null, model: null, storage: null, condition: null }
  : {
      budget_etb: (() => {
        const updateBudget = normalizeNullableNumber(updateConstraintSource.budget_etb);
        if (updateBudget !== null && updateBudget > 0) return updateBudget;
        const sessionBudget = normalizeNullableNumber(sessionConstraintSource.budget_etb);
        return sessionBudget !== null && sessionBudget > 0 ? sessionBudget : null;
      })(),
      brand: normalizeText(updateConstraintSource.brand) ?? normalizeText(sessionConstraintSource.brand),
      model: normalizeText(updateConstraintSource.model) ?? normalizeText(sessionConstraintSource.model),
      storage: normalizeText(updateConstraintSource.storage) ?? normalizeText(sessionConstraintSource.storage),
      condition: normalizeText(updateConstraintSource.condition) ?? normalizeText(sessionConstraintSource.condition),
    };
const updatedSession = {
  session_id: String(session.session_id ?? ('sess_' + String(event.userId ?? event.chatId ?? 'guest'))),
  customer_id: String(session.customer_id ?? event.userId ?? ''),
  created_at: isStartReset ? now : (Number.isFinite(Number(session.created_at)) ? Number(session.created_at) : now),
  last_message_at: now,
  message_count: isStartReset ? 1 : (Math.max(0, Number(session.message_count ?? 0)) + 1),
  conversation_state: {
    current_topic: isStartReset ? null : (currentTopicOverride ?? rules_output.session_update?.last_topic ?? session.conversation_state?.current_topic ?? null),
    current_flow: isStartReset ? null : flow,
    is_active: true,
  },
  flow_context: {
    buy_flow: {
      shown_products: isStartReset ? [] : shownProducts,
      current_interest: isStartReset ? null : currentInterest,
    },
  },
  exchange_details: isStartReset ? {
    brand: null,
    model: null,
    storage: null,
    battery_health: null,
    ram: null,
    condition: null,
    expected_price_etb: null,
    has_images: false,
    photo_count: 0,
    details_complete: false,
  } : {
    ...existingExchangeDetails,
    ...exchangeDetails,
  },
  buy_state: isStartReset ? { closed: false, close_reason: null } : {
    ...(isRecord(session.buy_state) ? session.buy_state : {}),
    ...buyState,
  },
  admin_lead: isStartReset ? {
    section: 'inbox',
    status: 'cold',
    type: 'general',
    intent: 'unknown',
    has_images: false,
    brand: null,
    model: null,
    storage: null,
    battery_health: null,
    ram: null,
    expected_price_etb: null,
    closed: false,
    close_reason: null,
  } : {
    ...(isRecord(session.admin_lead) ? session.admin_lead : {}),
    ...adminLead,
  },
  admin_section: isStartReset ? 'inbox' : adminLead.section,
  admin_status: isStartReset ? 'cold' : adminLead.status,
  admin_type: isStartReset ? 'general' : adminLead.type,
  admin_intent: isStartReset ? 'unknown' : adminLead.intent,
  admin_has_images: isStartReset ? false : adminLead.has_images,
  last_offer_context: nextLastOfferContext,
  last_constrained_turn: nextLastConstrainedTurn,
  collected_constraints: mergedConstraints,
  last_asked_key: isStartReset ? null : (rules_output.session_update?.last_asked_key ?? session.last_asked_key ?? null),
  conversation_history: nextHistory,
  admin_escalation: isStartReset
    ? { required: false, reason: null, status: null }
    : (rules_output.reply_mode === 'handoff_admin'
        ? { required: true, reason: rules_output.reasoning ?? 'handoff_admin', status: 'pending' }
        : (session.admin_escalation && typeof session.admin_escalation === 'object' ? session.admin_escalation : { required: false, reason: null, status: null })),
};

return [{
  json: {
    event,
    session,
    client_config,
    understanding_output,
    rules_output,
    resolver_output,
    reply_text,
    valid,
    issues,
    safe_to_send,
    telegram_payload: {
      chat_id: event.chatId ?? null,
      text: reply_text,
      replyMarkup: telegram_markup.replyMarkup,
      inlineKeyboard: telegram_markup.inlineKeyboard,
    },
    session_update_payload: { userId: event.userId ?? null, chatId: event.chatId ?? null, session: updatedSession },
    validation_meta: { parsed_reply: parsedReply, timestamp: now },
  },
}];
`

## Node: Session Save
`json
{
  "method": "POST",
  "url": "={{(() => { const base = $env.CONVEX_HTTP_BASE_URL || $env.CONVEX_URL || $env.NEXT_PUBLIC_CONVEX_URL; if (!base) { throw new Error('Missing Convex URL env: CONVEX_HTTP_BASE_URL or CONVEX_URL or NEXT_PUBLIC_CONVEX_URL'); } return String(base).replace(/\\/$/, '').replace(/\\.convex\\.cloud(?=\\/|$)/, '.convex.site'); })() + '/http/session-save'}}",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      {
        "name": "Content-Type",
        "value": "application/json"
      }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify($item(0).$node['Validation'].json.session_update_payload) }}",
  "options": {}
}
`
