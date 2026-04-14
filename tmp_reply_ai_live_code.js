const input = $json ?? {};
const event = input.event && typeof input.event === 'object' ? input.event : {};
const session = input.session && typeof input.session === 'object' ? input.session : {};
const client_config = input.client_config && typeof input.client_config === 'object' ? input.client_config : {};
const understanding_output = input.understanding_output && typeof input.understanding_output === 'object' ? input.understanding_output : {};
const understanding_meta = input.understanding_meta && typeof input.understanding_meta === 'object' ? input.understanding_meta : {};
const rules_output = input.rules_output && typeof input.rules_output === 'object' ? input.rules_output : {};
const hasResolverOutput = Object.prototype.hasOwnProperty.call(input, 'resolver_output');
const resolver_output = hasResolverOutput ? (input.resolver_output ?? null) : null;
const FALLBACK_REPLY = 'Sorry, I didn’t understand that clearly. Please try again.';

const normalizeReplyText = (value) => {
  if (typeof value === 'string') {
    return value.split('\r\n').join('\n').split('\r').join('\n').trim();
  }
  if (value && typeof value === 'object' && typeof value.reply_text === 'string') {
    return normalizeReplyText(value.reply_text);
  }
  return '';
};

const parseReplyPayload = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return normalizeReplyText(parsed);
    } catch {
      return normalizeReplyText(value);
    }
  }
  if (typeof value === 'object') {
    return normalizeReplyText(value);
  }
  return '';
};

const apiKey = (typeof $env !== 'undefined' && $env?.OPENROUTER_API_KEY)
  ? $env.OPENROUTER_API_KEY
  : ((typeof process !== 'undefined' && process?.env?.OPENROUTER_API_KEY)
    ? process.env.OPENROUTER_API_KEY
    : '');

const systemPrompt = [
  'You are Reply AI, a wording-only renderer for a Telegram sales bot.',
  'Return ONLY one valid JSON object with exactly this shape: {"reply_text":"string"}.',
  'Do not add any other keys. Do not explain anything. Do not add markdown fences.',
  'Your only job is to turn the provided workflow state into one short natural customer-facing reply.',
  'You do not decide workflow.',
  'You do not decide whether resolver runs.',
  'You do not decide handoff.',
  'You do not decide the next action.',
  'You do not invent business facts.',
  'Use only the provided customer_text, event, session, client_config, understanding_output, understanding_meta, rules_output, and resolver_output.',
  'understanding_meta is supporting metadata only. You may use it only to be slightly more cautious in wording. Never use it to create new routing or business decisions.',
  'Follow rules_output.reply_mode exactly when it is valid.',
  'If reply_mode is missing or invalid, behave as clarify_reference.',
  'Supported reply modes:',
  '- business_resolve',
  '- small_talk_redirect',
  '- clarify_reference',
  '- handoff_admin',
  '- acknowledge_and_close',
  'Grounding rules:',
  '- Use resolver_output only when it is present and valid.',
  '- If resolver_output is null, do not mention any product, price, availability, or lookup result. Do not imply a lookup occurred.',
  '- If resolver_output.result_mode is "error", do not mention any product, price, or specific business detail. Produce only a short neutral clarification or small_talk_redirect-style reply. Do not escalate or reroute.',
  '- Never rely on legacy resolver helper fields. Use only the locked resolver contract and grounded resolver_output truth.',
  'Reply mode rules:',
  '- business_resolve: if resolver_output is present and valid and result_mode is not "error", write a short grounded reply using resolver_output only. If grounding is missing, use a short safe clarification.',
  '- small_talk_redirect: write a short natural redirect.',
  '- clarify_reference: write a short clarification reply.',
  '- handoff_admin: short reassurance only. No question.',
  '- acknowledge_and_close: short close only. No question. Do not reopen the conversation.',
  'Style rules:',
  '- Keep the reply short.',
  '- Keep it natural, customer-facing, Telegram-friendly, and stable for validation.',
  '- Match the customer language style when natural.',
  '- No robotic wording.',
  '- No long marketing copy.',
  'Output JSON only.',
].join('\n');

const requestPayload = JSON.stringify({
  model: 'google/gemini-3.1-flash-lite-preview',
  temperature: 0.05,
  response_format: { type: 'json_object' },
  messages: [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: JSON.stringify({
        customer_text: event.text ?? '',
        event,
        session,
        client_config,
        understanding_output,
        understanding_meta,
        rules_output,
        resolver_output,
      }),
    },
  ],
});

let reply_text = '';

try {
  if (!apiKey) {
    throw new Error('Missing OPENROUTER_API_KEY');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: requestPayload,
  });

  const responseBody = await response.text();
  if (!response.ok) {
    throw new Error('OpenRouter HTTP ' + String(response.status) + ': ' + responseBody);
  }

  let parsedResponse = null;
  try {
    parsedResponse = JSON.parse(responseBody);
  } catch {
    parsedResponse = null;
  }

  reply_text = parseReplyPayload(parsedResponse?.choices?.[0]?.message?.content)
    || parseReplyPayload(parsedResponse?.output_text)
    || parseReplyPayload(parsedResponse?.text)
    || parseReplyPayload(parsedResponse)
    || '';
} catch (error) {
  console.error(JSON.stringify({ node: 'Reply AI', error: error?.message ?? String(error) }));
}

reply_text = normalizeReplyText(reply_text) || FALLBACK_REPLY;

return [{
  json: {
    event,
    session,
    client_config,
    understanding_output,
    understanding_meta,
    rules_output,
    resolver_output,
    reply_text,
  },
}];
