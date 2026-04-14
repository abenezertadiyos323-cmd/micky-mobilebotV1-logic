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

const parseJsonObject = (value) => {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
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

const reply_text = typeof parsedReply?.reply_text === 'string' ? parsedReply.reply_text.trim() : '';
if (!reply_text) issues.push('missing_reply_text');
const lineCount = reply_text ? reply_text.split(/\r?\n/).filter((line) => line.trim()).length : 0;
if (lineCount > 3) issues.push('reply_exceeds_max_lines');
if (rules_output.reply_mode === 'acknowledge_and_close' && /[?]/.test(reply_text)) issues.push('acknowledge_and_close_should_not_ask_question');
if (rules_output.reply_mode === 'handoff_admin' && /[?]/.test(reply_text)) issues.push('handoff_admin_should_not_ask_question');
if (rules_output.should_call_resolver && !resolver_output) issues.push('resolver_expected_but_missing');
if (!rules_output.should_call_resolver && rules_output.reply_mode === 'business_resolve') issues.push('business_resolve_requires_resolver');
if (rules_output.reply_mode === 'business_resolve' && resolver_output && !['single_product', 'multiple_options', 'no_match', 'out_of_stock', 'clarification_needed', 'exchange_offer'].includes(resolver_output.result_type)) issues.push('invalid_resolver_result_type');
if (!['business_resolve', 'off_topic_redirect', 'small_talk_redirect', 'clarify_reference', 'resume_previous_flow', 'acknowledge_and_close', 'handoff_admin'].includes(rules_output.reply_mode)) issues.push('invalid_reply_mode_contract');

const valid = issues.length === 0;
const safe_to_send = valid && Boolean(reply_text);
const now = Date.now();
const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
const nextHistory = history.concat([{ role: 'user', text: String(event.text ?? ''), timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : now }]).concat(safe_to_send ? [{ role: 'assistant', text: reply_text, timestamp: now }] : []).slice(-12);

const shownProducts = resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length > 0
  ? resolver_output.products
  : (Array.isArray(session.flow_context?.buy_flow?.shown_products) ? session.flow_context.buy_flow.shown_products : []);
const currentInterest = resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length === 1
  ? resolver_output.products[0]
  : (rules_output.resolver_input?.resolved_product_name ?? session.flow_context?.buy_flow?.current_interest ?? null);
const flow = rules_output.resolver_input?.flow ?? session.conversation_state?.current_flow ?? null;
const updatedSession = {
  session_id: String(session.session_id ?? ('sess_' + String(event.userId ?? event.chatId ?? 'guest'))),
  customer_id: String(session.customer_id ?? event.userId ?? ''),
  created_at: Number.isFinite(Number(session.created_at)) ? Number(session.created_at) : now,
  last_message_at: now,
  message_count: Math.max(0, Number(session.message_count ?? 0)) + 1,
  conversation_state: {
    current_topic: rules_output.session_update?.last_topic ?? session.conversation_state?.current_topic ?? null,
    current_flow: flow,
    is_active: rules_output.reply_mode !== 'acknowledge_and_close',
  },
  flow_context: {
    buy_flow: {
      shown_products: shownProducts,
      current_interest: currentInterest,
    },
  },
  conversation_history: nextHistory,
  admin_escalation: rules_output.reply_mode === 'handoff_admin'
    ? { required: true, reason: rules_output.reasoning ?? 'handoff_admin', status: 'pending' }
    : (session.admin_escalation && typeof session.admin_escalation === 'object' ? session.admin_escalation : { required: false, reason: null, status: null }),
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
    telegram_payload: { chat_id: event.chatId ?? null, text: reply_text },
    session_update_payload: { userId: event.userId ?? null, chatId: event.chatId ?? null, session: updatedSession },
    validation_meta: { parsed_reply: parsedReply, timestamp: now },
  },
}];