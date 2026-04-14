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
const issues = [];
const blockingIssues = [];

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizeNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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
const reserveIntent = confirmReservationAction || /\b(reserve|reservation|book|hold|save it)\b/i.test(lowerText);
const visitIntent = /\b(visit|come see|come to the store|come in person|physically|in person)\b/i.test(lowerText);
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
const currentInterestRecord = currentInterest && typeof currentInterest === 'object' ? currentInterest : {};
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
const adminType = flowIsExchange ? 'exchange' : (flowIsBuy || priceShown || reserveIntent || visitIntent || startActionSelected ? 'buy' : 'general');
const adminStatus = flowIsExchange
  ? (exchangeDetailsComplete ? (exchangeHasImages ? 'hot' : 'warm') : 'cold')
  : (confirmReservationAction || visitIntent || /\b(buy now|i want to buy|i'll take it|take it|confirm it|reserve)\b/i.test(lowerText)
      ? 'hot'
      : ((priceShown || /\b(price|cost|how much|available|availability|stock|budget)\b/i.test(lowerText) || flowIsBuy || hasProductReply)
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
  reply_text = 'እንኳን ወደ TedyTech በደህና መጡ።\nBuy phone ወይም Exchange phone ይምረጡ።';
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
      reply_text += '\nIf you have photos, you can send them to help us evaluate better.';
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
      reply_text += '\nIf you have photos, you can send them to help us evaluate better.';
    }
  }
} else if (!flowIsExchange && visitIntent) {
  reply_text = 'እሺ, ቦታችን ይሄ ነው: ' + mapUrl + '\n' + storeCtaText;
  telegram_markup = storeMarkup;
} else if (!flowIsExchange && photoRequest) {
  reply_text = 'You can view photos and full details in our store. Tap the button below.';
  telegram_markup = storeMarkup;
} else if (flowIsBuy && reserveIntent && !confirmReservationAction) {
  reply_text = 'Great. Tap Confirm Reservation below to hold it.';
  telegram_markup = confirmReservationMarkup;
} else if (flowIsBuy && hasProductReply) {
  reply_text = reply_text.replace(/\s*\n+\s*/g, ' ').trim();
  if (priceShown && !pricingFollowUp && !reply_text.includes('Do you want to reserve it or come see it in person?')) {
    reply_text = reply_text.replace(/\s*$/, '') + '\nDo you want to reserve it or come see it in person?';
  }
  if (!reply_text.includes(storeCtaText)) {
    reply_text = reply_text.replace(/\s*$/, '') + '\n' + storeCtaText;
  }
  telegram_markup = storeMarkup;
} else if (flowIsBuy && !reply_text.includes(storeCtaText) && (priceShown || /\b(price|cost|availability|available|stock|budget)\b/i.test(lowerText))) {
  reply_text = reply_text.replace(/\s*$/, '') + '\n' + storeCtaText;
  telegram_markup = storeMarkup;
}

reply_text = reply_text
  .split(/\r?\n/)
  .filter((line) => line.trim())
  .slice(0, 3)
  .join('\n')
  .trim();
if (!reply_text) { issues.push('missing_reply_text'); blockingIssues.push('missing_reply_text'); }
const lineCount = reply_text ? reply_text.split(/\r?\n/).filter((line) => line.trim()).length : 0;
if (lineCount > 3) { issues.push('reply_exceeds_max_lines'); blockingIssues.push('reply_exceeds_max_lines'); }
if (rules_output.reply_mode === 'acknowledge_and_close' && /[?]/.test(reply_text)) issues.push('acknowledge_and_close_should_not_ask_question');
if (rules_output.reply_mode === 'handoff_admin' && /[?]/.test(reply_text)) issues.push('handoff_admin_should_not_ask_question');
if (rules_output.should_call_resolver && !resolver_output) { issues.push('resolver_expected_but_missing'); blockingIssues.push('resolver_expected_but_missing'); }
if (!rules_output.should_call_resolver && rules_output.reply_mode === 'business_resolve') { issues.push('business_resolve_requires_resolver'); blockingIssues.push('business_resolve_requires_resolver'); }
if (rules_output.reply_mode === 'business_resolve' && resolver_output && !['single_product', 'multiple_options', 'no_match', 'out_of_stock', 'clarification_needed', 'exchange_offer'].includes(resolver_output.result_type)) { issues.push('invalid_resolver_result_type'); blockingIssues.push('invalid_resolver_result_type'); }
if (!['business_resolve', 'off_topic_redirect', 'small_talk_redirect', 'clarify_reference', 'resume_previous_flow', 'acknowledge_and_close', 'handoff_admin'].includes(rules_output.reply_mode)) { issues.push('invalid_reply_mode_contract'); blockingIssues.push('invalid_reply_mode_contract'); }

const valid = blockingIssues.length === 0;
const safe_to_send = Boolean(reply_text) && blockingIssues.length === 0;
const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
const nextHistory = (isStartReset ? [] : history)
  .concat([{ role: 'user', text: String(event.text ?? ''), timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : now }])
  .concat(safe_to_send ? [{ role: 'assistant', text: reply_text, timestamp: now }] : [])
  .slice(-12);

const shownProducts = isStartReset
  ? []
  : (resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length > 0
      ? resolver_output.products
      : (Array.isArray(session.flow_context?.buy_flow?.shown_products) ? session.flow_context.buy_flow.shown_products : []));
const currentInterest = isStartReset
  ? null
  : (resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length === 1
      ? resolver_output.products[0]
      : (rules_output.resolver_input?.resolved_reference?.raw ?? session.flow_context?.buy_flow?.current_interest ?? null));
const flow = isStartReset ? null : (currentFlowOverride ?? rules_output.resolver_input?.flow ?? session.conversation_state?.current_flow ?? null);
const sessionConstraintSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const updateConstraintSource = isRecord(rules_output.session_update?.collected_constraints) ? rules_output.session_update.collected_constraints : {};
const mergedConstraints = isStartReset
  ? { budget_etb: null, brand: null, model: null, storage: null, condition: null }
  : {
      budget_etb: normalizeNullableNumber(updateConstraintSource.budget_etb) ?? normalizeNullableNumber(sessionConstraintSource.budget_etb),
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