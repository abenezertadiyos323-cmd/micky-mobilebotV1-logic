const payload = $json ?? {};
let event = payload.event ?? null;

const readEventFromNode = (nodeName) => {
  try {
    const nodeRef = $(nodeName);
    if (!nodeRef || !nodeRef.isExecuted) return null;
    const candidate = nodeRef.first()?.json?.event;
    return candidate && typeof candidate === 'object' ? candidate : null;
  } catch {
    return null;
  }
};

if (!event || typeof event !== 'object') {
  event = readEventFromNode('Event Normalizer')
    ?? readEventFromNode('Event Loader')
    ?? readEventFromNode('Unify Payload')
    ?? readEventFromNode('Telegram Input')
    ?? readEventFromNode('Telegram Trigger')
    ?? null;
}

if (!event || typeof event !== 'object') {
  event = { chatId: 0, error: 'trigger_event_lost' };
  console.log(JSON.stringify({
    node: 'Session Bootstrap',
    warning: 'trigger_event_lost',
    fallback_nodes: ['Event Normalizer', 'Event Loader', 'Unify Payload', 'Telegram Input', 'Telegram Trigger'],
  }));
}

event = event && typeof event === 'object' ? event : {};
const isStartReset = event.event_type === 'start_reset' || event.event_type === 'deep_link_start';
const remoteEnvelope = payload.session && typeof payload.session === 'object'
  ? payload.session
  : (payload.data?.session && typeof payload.data.session === 'object' ? payload.data.session : null);
const remoteData = remoteEnvelope && Object.prototype.hasOwnProperty.call(remoteEnvelope, 'data')
  ? remoteEnvelope.data
  : (payload.session?.data ?? payload.data?.session?.data ?? remoteEnvelope);
const existing = remoteData && typeof remoteData === 'object' ? remoteData : {};
const adminSettings = payload.adminSettings && typeof payload.adminSettings === 'object'
  ? payload.adminSettings
  : (payload.data?.adminSettings && typeof payload.data.adminSettings === 'object' ? payload.data.adminSettings : null);
const now = Date.now();
const defaultStoreAddress = '8.998702, 38.786851 (Bole)';
const resolvedStoreAddress = typeof adminSettings?.storeAddress === 'string' && adminSettings.storeAddress.trim()
  ? adminSettings.storeAddress.trim()
  : defaultStoreAddress;
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
const normalizeBudget = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const extractBudgetEtbFromText = (text) => {
  if (typeof text !== 'string') return null;
  const normalized = text.trim();
  if (!normalized) return null;
  const lower = normalized.toLowerCase().replace(/\s+/g, ' ');
  const budgetCue = /\b(budget|brr|birr|etb|under|below|up to|less than|\u1265\u122D|\u1260\u1303\u1275)\b/.test(lower) || /\b\d[\d,]*(?:\.\d+)?\s*k\b/.test(lower);
  if (!budgetCue) return null;
  const patterns = [
    /(?:budget|brr|birr|etb|under|below|up to|less than|\u1265\u122D|\u1260\u1303\u1275)\D{0,20}(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/i,
    /\b(\d[\d,]*(?:\.\d+)?)\s*(k)?\D{0,20}(?:budget|brr|birr|etb|under|below|up to|less than|\u1265\u122D|\u1260\u1303\u1275)\b/i,
    /\b(\d[\d,]*(?:\.\d+)?)\s*(k)\b/i,
  ];
  for (const pattern of patterns) {
    const match = lower.match(pattern);
    if (!match) continue;
    const amount = Number(String(match[1]).replace(/,/g, ''));
    if (!Number.isFinite(amount)) continue;
    if (String(match[2] ?? '').toLowerCase() === 'k') return Math.round(amount * 1000);
    return Math.round(amount);
  }
  return null;
};
const currentBudgetEtb = event.event_type === 'callback_action' ? null : extractBudgetEtbFromText(event.text);
const currentInterestRecord = currentInterest && typeof currentInterest === 'object' ? currentInterest : {};
const existingConstraints = existing.collected_constraints && typeof existing.collected_constraints === 'object'
  ? existing.collected_constraints
  : {};
const collected_constraints = {
  budget_etb: normalizeBudget(currentBudgetEtb ?? existingConstraints.budget_etb ?? existing.budget_etb ?? null),
  brand: normalizeText(existingConstraints.brand ?? currentInterestRecord.brand ?? null),
  model: normalizeText(existingConstraints.model ?? currentInterestRecord.model ?? currentInterestRecord.name ?? null),
  storage: normalizeText(existingConstraints.storage ?? currentInterestRecord.storage ?? null),
  condition: normalizeText(existingConstraints.condition ?? currentInterestRecord.condition ?? null),
};
const session = {
  session_id: String(existing.session_id ?? ('sess_' + String(event.userId ?? event.chatId ?? 'guest'))),
  customer_id: String(existing.customer_id ?? event.userId ?? ''),
  created_at: Number.isFinite(Number(existing.created_at)) ? Number(existing.created_at) : now,
  last_message_at: now,
  message_count: isStartReset ? 0 : Math.max(0, baseCount),
  conversation_history: isStartReset ? [] : history.slice(-12).filter((item) => item && typeof item === 'object'),
  conversation_state: {
    current_topic: isStartReset ? null : currentTopic,
    current_flow: isStartReset ? null : currentFlow,
    is_active: typeof active === 'boolean' ? active : true,
  },
  flow_context: {
    buy_flow: {
      shown_products: isStartReset ? [] : shownProducts,
      current_interest: isStartReset ? null : currentInterest,
    },
  },
  collected_constraints: isStartReset
    ? { budget_etb: null, brand: null, model: null, storage: null, condition: null }
    : collected_constraints,
  last_asked_key: isStartReset ? null : normalizeText(existing.last_asked_key ?? existing.last_asked_field ?? null),
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
  "telegram_bot_name": "TedyTech Bot",
  "seller_id": "tedytech",
  "sellerId": "tedytech",
  "store_address": resolvedStoreAddress,
  "store_location_link": typeof adminSettings?.storeLocationLink === 'string' && adminSettings.storeLocationLink.trim()
    ? adminSettings.storeLocationLink.trim()
    : null,
  "warranty_policy": typeof adminSettings?.warrantyPolicy === 'string' && adminSettings.warrantyPolicy.trim()
    ? adminSettings.warrantyPolicy.trim()
    : null,
  "exchange_rules": typeof adminSettings?.exchangeRules === 'string' && adminSettings.exchangeRules.trim()
    ? adminSettings.exchangeRules.trim()
    : null,
};
return [{
  json: {
    event,
    session,
    client_config,
    adminSettings,
    session_source: remoteEnvelope?.exists ? 'remote' : 'bootstrap',
  },
}];