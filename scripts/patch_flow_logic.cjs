const fs = require("fs");

const workflowPath = "workflow.json";
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

function getNode(name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) {
    throw new Error(`${name} node not found`);
  }
  return node;
}

function setCode(name, code) {
  getNode(name).parameters.jsCode = code;
}

function setParameters(name, parameters) {
  getNode(name).parameters = parameters;
}

// Node rewrites are injected below in follow-up patches.

setCode(
  "Session Bootstrap",
  `const payload = $json ?? {};
let event = payload.event ?? null;
if (!event) {
  try {
    event = $item(0).$node['Session Bootstrap'].json.event;
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
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
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
const collected_constraints = {
  budget_etb: normalizeNullableNumber(existingConstraints.budget_etb ?? existing.budget_etb ?? null),
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

const exchange_details = normalizeExchangeDetails(existing.exchange_details, defaultExchangeDetails);
const buy_state = normalizeBuyState(existing.buy_state, defaultBuyState);
const admin_lead = normalizeAdminLead(existing.admin_lead, defaultAdminLead);

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
    session,
    client_config,
    session_source: remoteEnvelope?.exists ? 'remote' : 'bootstrap',
  },
}];`
);

function replaceOnce(source, search, replacement) {
  if (!source.includes(search)) {
    throw new Error(`Missing snippet: ${search.slice(0, 80)}`);
  }
  return source.replace(search, replacement);
}

function replaceInNode(name, replacements) {
  let code = getNode(name).parameters.jsCode;
  for (const [search, replacement] of replacements) {
    code = replaceOnce(code, search, replacement);
  }
  setCode(name, code);
}

replaceInNode("Rules Layer", [
  [
    `const currentFlow = session.conversation_state?.current_flow ?? null;
const currentTopic = session.conversation_state?.current_topic ?? null;
const existingConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};`,
    `const currentFlow = session.conversation_state?.current_flow ?? null;
const currentTopic = session.conversation_state?.current_topic ?? null;
const eventText = normalizeText(event.text) ?? '';
const extractBudgetEtb = (value) => {
  const source = String(value ?? eventText ?? '').trim().toLowerCase();
  if (!source) return null;
  const kMatch = source.match(/(\\d+(?:\\.\\d+)?)\\s*k\\b/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const currencyMatch = source.match(/(?:etb|birr|br|brr|ብር)\\s*[:\\-]?\\s*(\\d{3,6})/i);
  if (currencyMatch) return Number(currencyMatch[1]);
  const plainMatch = source.match(/\\b(\\d{4,6})\\b/);
  return plainMatch ? Number(plainMatch[1]) : null;
};
const existingConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};`
  ],
  [
    `  budget_etb: normalizePositiveNumber(existingConstraintsSource.budget_etb),`,
    `  budget_etb: extractBudgetEtb(existingConstraintsSource.budget_etb) ?? normalizePositiveNumber(existingConstraintsSource.budget_etb),`
  ]
]);

replaceInNode("Business Data Resolver", [
  [
    `const filteredProducts = candidateProducts.filter(matchesConstraints);
const effectiveProducts = filteredProducts.length > 0 ? filteredProducts : (products.length > 0 ? candidateProducts : []);
const replyProducts = selectedProduct
  ? [selectedProduct]
  : effectiveProducts.slice(0, 5);`,
    `const filteredProducts = candidateProducts.filter(matchesConstraints);
const budgetLimit = normalizeNullableNumber(effectiveConstraints.budget_etb);
const budgetMatchedProducts = budgetLimit === null
  ? filteredProducts
  : filteredProducts.filter((product) => Number.isFinite(product.price_etb) && product.price_etb <= budgetLimit);
const budgetFallbackProducts = budgetLimit === null
  ? []
  : filteredProducts
      .filter((product) => Number.isFinite(product.price_etb) && product.price_etb > budgetLimit)
      .sort((a, b) => a.price_etb - b.price_etb);
const exactBudgetMatchFound = budgetLimit === null ? filteredProducts.length > 0 : budgetMatchedProducts.length > 0;
const effectiveProducts = budgetLimit === null
  ? filteredProducts
  : (budgetMatchedProducts.length > 0 ? budgetMatchedProducts : budgetFallbackProducts);
const selectedWithinBudget = selectedProduct && (budgetLimit === null || !Number.isFinite(selectedProduct.price_etb) || selectedProduct.price_etb <= budgetLimit)
  ? selectedProduct
  : null;
const replyProducts = selectedWithinBudget
  ? [selectedWithinBudget]
  : effectiveProducts.slice(0, 5);`
  ],
  [
    `    price_range: priceRange,
  },`,
    `    price_range: priceRange,
    budget_limit: budgetLimit,
    budget_exact_match_found: exactBudgetMatchFound,
    budget_fallback_used: budgetLimit !== null && !exactBudgetMatchFound,
  },`
  ]
]);

replaceInNode("Validation", [
  [
    `const parsedReply = parseJsonObject(replyPayload.choices?.[0]?.message?.content)
  || parseJsonObject(replyPayload.output_text)
  || parseJsonObject(replyPayload.text)
  || parseJsonObject(replyPayload.data)
  || parseJsonObject(replyPayload.result)
  || parseJsonObject(replyPayload);

const reply_text = typeof parsedReply?.reply_text === 'string' ? parsedReply.reply_text.trim() : '';`,
    `const parsedReply = parseJsonObject(replyPayload.choices?.[0]?.message?.content)
  || parseJsonObject(replyPayload.output_text)
  || parseJsonObject(replyPayload.text)
  || parseJsonObject(replyPayload.data)
  || parseJsonObject(replyPayload.result)
  || parseJsonObject(replyPayload);

const eventText = normalizeText(event.text) ?? '';
const lowerText = eventText.toLowerCase();
const callbackData = normalizeText(event.callback_query?.data) ?? null;
const mapUrl = 'https://maps.google.com/maps?q=8.998702,38.786851&ll=8.998702,38.786851&z=16';
const storeCtaText = 'For more phones and accessories, visit our store using the button below.';
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
    { text: 'Buy phone', additionalFields: { callback_data: 'start_buy' } },
    { text: 'Exchange phone', additionalFields: { callback_data: 'start_exchange' } },
  ],
]);
const confirmReservationMarkup = buildInlineKeyboard([
  [
    { text: 'Confirm Reservation', additionalFields: { callback_data: 'confirm_reservation' } },
  ],
]);
const storeMarkup = buildInlineKeyboard([
  [
    { text: 'Visit Store', additionalFields: { url: mapUrl } },
  ],
]);
const startBuyAction = callbackData === 'start_buy';
const startExchangeAction = callbackData === 'start_exchange';
const confirmReservationAction = callbackData === 'confirm_reservation';
const reserveIntent = confirmReservationAction || /\\b(reserve|reservation|book|hold|save it)\\b/i.test(lowerText);
const visitIntent = /\\b(visit|come see|come to the store|come in person|physically|in person)\\b/i.test(lowerText);
const photoRequest = /\\b(photo|photos|picture|pictures|image|images|see the phone|view photos)\\b/i.test(lowerText);
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
const pricingFollowUp = ['refinement', 'clarification'].includes(normalizeText(understanding_output.message_function) ?? '');
const detectPhoneModel = (value) => {
  const source = String(value || '').trim();
  if (!source) return null;
  const match = source.match(/\\b(?:iphone\\s*\\d+(?:\\s*(?:pro\\s*max|pro|max|plus|mini))?|samsung\\s*[a-z0-9+ ]+|pixel\\s*[a-z0-9+ ]+|redmi\\s*[a-z0-9+ ]+|xiaomi\\s*[a-z0-9+ ]+|tecno\\s*[a-z0-9+ ]+|infinix\\s*[a-z0-9+ ]+|oppo\\s*[a-z0-9+ ]+|vivo\\s*[a-z0-9+ ]+|realme\\s*[a-z0-9+ ]+|itel\\s*[a-z0-9+ ]+|nokia\\s*[a-z0-9+ ]+)\\b/i);
  return match ? match[0].trim() : null;
};
const detectStorage = (value) => {
  const source = String(value || '').trim();
  const match = source.match(/\\b(32|64|128|256|512|1024)\\s*gb\\b/i);
  return match ? (match[1] + 'GB') : null;
};
const detectBatteryHealth = (value) => {
  const source = String(value || '').trim();
  const match = source.match(/\\b(?:battery health|battery)\\s*[:\\-]?\\s*(\\d{2,3})\\s*%?/i);
  return match ? (match[1] + '%') : null;
};
const detectRam = (value) => {
  const source = String(value || '').trim();
  const match = source.match(/\\b(\\d{1,3})\\s*gb\\s*ram\\b/i);
  return match ? (match[1] + 'GB') : null;
};
const detectCondition = (value) => {
  const source = String(value || '').toLowerCase();
  if (/\\b(like new|excellent|very good|good condition)\\b/.test(source)) return 'good';
  if (/\\b(fair|normal|average)\\b/.test(source)) return 'fair';
  if (/\\b(broken|damaged|cracked|bad)\\b/.test(source)) return 'damaged';
  return null;
};
const extractPriceEtb = (value) => {
  const source = String(value || '').replace(/,/g, ' ').trim();
  const kMatch = source.match(/\\b(\\d+(?:\\.\\d+)?)\\s*k\\b/i);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const currencyMatch = source.match(/(?:etb|birr|br|brr)\\s*[:\\-]?\\s*(\\d{3,6})/i);
  if (currencyMatch) return Number(currencyMatch[1]);
  const plainMatch = source.match(/\\b(\\d{4,6})\\b/);
  return plainMatch ? Number(plainMatch[1]) : null;
};
const isStartReset = event.event_type === 'start_reset';
const currentInterestRecord = currentInterest && typeof currentInterest === 'object' ? currentInterest : {};
const currentInterestModel = normalizeText(currentInterestRecord.model ?? currentInterestRecord.name ?? null);
const currentInterestStorage = normalizeText(currentInterestRecord.storage ?? null);
const existingExchangeDetails = isRecord(session.exchange_details) ? session.exchange_details : {};
const exchangeBrand = normalizeText(existingExchangeDetails.brand)
  ?? (/\biphone\b/i.test(lowerText) ? 'iPhone' : (/\bsamsung\b/i.test(lowerText) ? 'Samsung' : null));
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
const adminType = flowIsExchange ? 'exchange' : (flowIsBuy || priceShown || reserveIntent || visitIntent || startActionSelected ? 'buy' : 'general');
const adminStatus = flowIsExchange
  ? (exchangeDetailsComplete ? (exchangeHasImages ? 'hot' : 'warm') : 'cold')
  : (confirmReservationAction || visitIntent || /\\b(buy now|i want to buy|i'll take it|take it|confirm it|reserve)\\b/i.test(lowerText)
      ? 'hot'
      : ((priceShown || /\\b(price|cost|how much|available|availability|stock|budget)\\b/i.test(lowerText) || flowIsBuy || hasProductReply)
          ? 'warm'
          : 'cold'));
const adminIntent = flowIsExchange
  ? (exchangeDetailsComplete
      ? (exchangeHasImages ? 'exchange_details_with_images' : 'exchange_details')
      : 'exchange_request')
  : (confirmReservationAction
      ? 'reserve_confirmed'
      : (visitIntent
          ? 'visit_intent'
          : (/\\b(buy now|i want to buy|i'll take it|take it|confirm it)\\b/i.test(lowerText)
              ? 'buy_now'
              : ((priceShown || /\\b(price|cost|how much|available|availability|stock|budget)\\b/i.test(lowerText) || hasProductReply)
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
      : (startBuyAction || confirmReservationAction || reserveIntent || visitIntent || flowIsBuy
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
  reply_text = 'እንኳን ወደ TedyTech በደህና መጡ።\\nBuy phone ወይም Exchange phone ይምረጡ።';
  telegram_markup = startMenuMarkup;
} else if (startBuyAction) {
  reply_text = 'መግዛት የምትፈልጉት ስልክ የትኛው ነው?';
} else if (startExchangeAction) {
  reply_text = 'ለexchange የምትሰጡት ስልክ ምንድነው?';
} else if (confirmReservationAction) {
  reply_text = 'Reservation confirmed. We’ve noted it.';
} else if (flowIsExchange) {
  if (exchangeDetailsComplete) {
    reply_text = 'Got it, I’ve noted your phone details. We’ll review and get back to you.';
    if (!exchangeHasImages) {
      reply_text += '\\nIf you have photos, you can send them to help us evaluate better.';
    }
  } else {
    const missingExchangeFields = [];
    if (!exchangeModel) missingExchangeFields.push('model');
    if (!exchangeStorage && (exchangeBrand === 'iPhone' || exchangeBrand === 'Samsung' || currentInterestModel)) missingExchangeFields.push('storage');
    if (exchangeBrand === 'iPhone' && !exchangeBatteryHealth) missingExchangeFields.push('battery health');
    if (exchangeBrand === 'Samsung' && !exchangeRam) missingExchangeFields.push('RAM');
    if (!exchangeBrand && !exchangeModel) missingExchangeFields.push('model');
    if (missingExchangeFields.length > 0) {
      reply_text = 'Please send the ' + missingExchangeFields.join(', ') + ' of the phone you want to exchange.';
    } else {
      reply_text = 'Please send the phone model and storage for the phone you want to exchange.';
    }
    if (!reply_text.includes('If you have photos, you can send them to help us evaluate better.')) {
      reply_text += '\\nIf you have photos, you can send them to help us evaluate better.';
    }
  }
} else if (!flowIsExchange && visitIntent) {
  reply_text = 'እሺ, ቦታችን ይሄ ነው: ' + mapUrl + '\\n' + storeCtaText;
  telegram_markup = storeMarkup;
} else if (!flowIsExchange && photoRequest) {
  reply_text = 'You can view photos and full details in our store. Tap the button below.';
  telegram_markup = storeMarkup;
} else if (flowIsBuy && reserveIntent && !confirmReservationAction) {
  reply_text = 'Great. Tap Confirm Reservation below to hold it.';
  telegram_markup = confirmReservationMarkup;
} else if (flowIsBuy && hasProductReply) {
  reply_text = reply_text.replace(/\\s*\\n+\\s*/g, ' ').trim();
  if (priceShown && !pricingFollowUp && !reply_text.includes('Do you want to reserve it or come see it in person?')) {
    reply_text = reply_text.replace(/\\s*$/, '') + '\\nDo you want to reserve it or come see it in person?';
  }
  if (!reply_text.includes(storeCtaText)) {
    reply_text = reply_text.replace(/\\s*$/, '') + '\\n' + storeCtaText;
  }
  telegram_markup = storeMarkup;
} else if (flowIsBuy && !reply_text.includes(storeCtaText) && (priceShown || /\\b(price|cost|availability|available|stock|budget)\\b/i.test(lowerText))) {
  reply_text = reply_text.replace(/\\s*$/, '') + '\\n' + storeCtaText;
  telegram_markup = storeMarkup;
}

reply_text = reply_text
  .split(/\\r?\\n/)
  .filter((line) => line.trim())
  .slice(0, 3)
  .join('\\n')
  .trim();`
  ],
  [
    `const flow = isStartReset ? null : (rules_output.resolver_input?.flow ?? session.conversation_state?.current_flow ?? null);`,
    `const flow = isStartReset ? null : (currentFlowOverride ?? rules_output.resolver_input?.flow ?? session.conversation_state?.current_flow ?? null);`
  ],
  [
    `const updatedSession = {
  session_id: String(session.session_id ?? ('sess_' + String(event.userId ?? event.chatId ?? 'guest'))),
  customer_id: String(session.customer_id ?? event.userId ?? ''),
  created_at: isStartReset ? now : (Number.isFinite(Number(session.created_at)) ? Number(session.created_at) : now),
  last_message_at: now,
  message_count: isStartReset ? 1 : (Math.max(0, Number(session.message_count ?? 0)) + 1),
  conversation_state: {
    current_topic: isStartReset ? null : (rules_output.session_update?.last_topic ?? session.conversation_state?.current_topic ?? null),
    current_flow: isStartReset ? null : flow,
    is_active: true,
  },
  flow_context: {
    buy_flow: {
      shown_products: isStartReset ? [] : shownProducts,
      current_interest: isStartReset ? null : currentInterest,
    },
  },
  collected_constraints: mergedConstraints,
  last_asked_key: isStartReset ? null : (rules_output.session_update?.last_asked_key ?? session.last_asked_key ?? null),
  conversation_history: nextHistory,
  admin_escalation: isStartReset
    ? { required: false, reason: null, status: null }
    : (rules_output.reply_mode === 'handoff_admin'
        ? { required: true, reason: rules_output.reasoning ?? 'handoff_admin', status: 'pending' }
        : (session.admin_escalation && typeof session.admin_escalation === 'object' ? session.admin_escalation : { required: false, reason: null, status: null })),
};`,
    `const updatedSession = {
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
  collected_constraints: mergedConstraints,
  last_asked_key: isStartReset ? null : (rules_output.session_update?.last_asked_key ?? session.last_asked_key ?? null),
  conversation_history: nextHistory,
  admin_escalation: isStartReset
    ? { required: false, reason: null, status: null }
    : (rules_output.reply_mode === 'handoff_admin'
        ? { required: true, reason: rules_output.reasoning ?? 'handoff_admin', status: 'pending' }
        : (session.admin_escalation && typeof session.admin_escalation === 'object' ? session.admin_escalation : { required: false, reason: null, status: null })),
};`
  ],
  [
    `    telegram_payload: { chat_id: event.chatId ?? null, text: reply_text },`,
    `    telegram_payload: {
      chat_id: event.chatId ?? null,
      text: reply_text,
      replyMarkup: telegram_markup.replyMarkup,
      inlineKeyboard: telegram_markup.inlineKeyboard,
    },`
  ]
]);

setParameters("Telegram Send", {
  chatId: "={{ $item(0).$node['Validation'].json.telegram_payload.chat_id }}",
  text: "={{ $item(0).$node['Validation'].json.reply_text }}",
  replyMarkup: "={{ $item(0).$node['Validation'].json.telegram_payload.replyMarkup }}",
  inlineKeyboard: "={{ $item(0).$node['Validation'].json.telegram_payload.inlineKeyboard }}",
  additionalFields: {
    appendAttribution: false,
  },
});

fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + "\n");
console.log("workflow patched");
