const fs = require('fs');
const path = require('path');

function readEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

const env = readEnv(path.join(process.cwd(), '.env'));
const workflowId = 'hc55q2zfas7gG1yu';
const baseUrl = env.N8N_BASE_URL;
const apiKey = env.N8N_API_KEY;

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
  '- business_resolve: if resolver_output is present and valid and result_mode is not "error", write a short grounded reply using resolver_output only. Keep the reply anchored to the current product or exchange context. If the current message is a negotiation or discount request, acknowledge that concern directly and do not force a pure price announcement. If grounding is missing, use a short safe clarification.',
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

const replyAiJsonBody = `={{ (() => {
  const systemPrompt = ${JSON.stringify(systemPrompt)};
  return JSON.stringify({
    model: 'google/gemini-3.1-flash-lite-preview',
    temperature: 0.05,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: JSON.stringify({
          customer_text: $json.event?.text ?? '',
          event: $json.event ?? null,
          session: $json.session ?? null,
          client_config: $json.client_config ?? null,
          understanding_output: $json.understanding_output ?? null,
          understanding_meta: $json.understanding_meta ?? null,
          rules_output: $json.rules_output ?? null,
          resolver_output: $json.resolver_output ?? null,
        }),
      },
    ],
  });
})() }}`;

const normalizeCode = [
  'const input = $json ?? {};',
  "const readBase = () => {",
  "  for (const nodeName of ['Business Data Resolver', 'Set No-Resolver Output']) {",
  '    try {',
  '      const ref = $(nodeName);',
  '      if (!ref || !ref.isExecuted) continue;',
  "      const candidate = ref.first()?.json;",
  "      if (candidate && typeof candidate === 'object') return candidate;",
  '    } catch {}',
  '  }',
  "  return input && typeof input === 'object' ? input : {};",
  '};',
  'const base = readBase();',
  "const event = base.event && typeof base.event === 'object' ? base.event : {};",
  "const session = base.session && typeof base.session === 'object' ? base.session : {};",
  "const client_config = base.client_config && typeof base.client_config === 'object' ? base.client_config : {};",
  "const understanding_output = base.understanding_output && typeof base.understanding_output === 'object' ? base.understanding_output : {};",
  "const understanding_meta = base.understanding_meta && typeof base.understanding_meta === 'object' ? base.understanding_meta : {};",
  "const rules_output = base.rules_output && typeof base.rules_output === 'object' ? base.rules_output : {};",
  "const hasResolverOutput = Object.prototype.hasOwnProperty.call(base, 'resolver_output');",
  "const resolver_output = hasResolverOutput ? (base.resolver_output ?? null) : null;",
  '',
  "const parseReplyText = (value) => {",
  "  if (!value) return '';",
  "  if (typeof value === 'string') {",
  '    try {',
  '      const parsed = JSON.parse(value);',
  "      if (parsed && typeof parsed.reply_text === 'string') {",
  "        return parsed.reply_text.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').trim();",
  '      }',
  '    } catch {}',
  "    return value.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').trim();",
  '  }',
  "  if (typeof value === 'object' && typeof value.reply_text === 'string') {",
  "    return value.reply_text.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').trim();",
  '  }',
  "  return '';",
  '};',
  '',
  "const raw = input.reply_ai_raw && typeof input.reply_ai_raw === 'object' ? input.reply_ai_raw : input;",
  'const reply_text = parseReplyText(raw?.choices?.[0]?.message?.content)',
  '  || parseReplyText(raw?.output_text)',
  '  || parseReplyText(raw?.text)',
  '  || parseReplyText(raw)',
  "  || '';",
  '',
  'return [{',
  '  json: {',
  '    event,',
  '    session,',
  '    client_config,',
  '    understanding_output,',
  '    understanding_meta,',
  '    rules_output,',
  '    resolver_output,',
  '    reply_text,',
  '  },',
  '}];',
].join('\n');

const normalizeNode = {
  parameters: {
    jsCode: normalizeCode,
  },
  id: 'reply-ai-normalize-20260408',
  name: 'Reply AI Normalize',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2864, 352],
};

async function main() {
  const getRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`, {
    headers: { 'X-N8N-API-KEY': apiKey },
  });
  if (!getRes.ok) {
    throw new Error(`GET workflow failed: ${getRes.status} ${await getRes.text()}`);
  }
  const workflow = await getRes.json();

  const backupDir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `reply-ai-http-transport-fix-prod-${workflowId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(workflow, null, 2));

  const replyNode = workflow.nodes.find((node) => node.name === 'Reply AI');
  if (!replyNode) {
    throw new Error('Reply AI node not found');
  }

  replyNode.parameters = {
    method: 'POST',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Authorization', value: "={{ 'Bearer ' + $env.OPENROUTER_API_KEY }}" },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: replyAiJsonBody,
    options: {
      responsePropertyName: 'reply_ai_raw',
    },
  };
  replyNode.type = 'n8n-nodes-base.httpRequest';
  replyNode.typeVersion = 4.2;
  replyNode.position = [2752, 352];
  replyNode.retryOnFail = true;
  replyNode.maxTries = 3;
  replyNode.onError = 'continueRegularOutput';

  const hasNormalize = workflow.nodes.some((node) => node.name === 'Reply AI Normalize');
  if (!hasNormalize) {
    workflow.nodes.push(normalizeNode);
  } else {
    const node = workflow.nodes.find((item) => item.name === 'Reply AI Normalize');
    node.parameters = normalizeNode.parameters;
    node.type = normalizeNode.type;
    node.typeVersion = normalizeNode.typeVersion;
    node.position = normalizeNode.position;
    node.id = normalizeNode.id;
  }

  if (!workflow.connections['Reply AI']) {
    workflow.connections['Reply AI'] = { main: [[]] };
  }
  workflow.connections['Reply AI'].main = [[{ node: 'Reply AI Normalize', type: 'main', index: 0 }]];
  workflow.connections['Reply AI Normalize'] = {
    main: [[{ node: 'Validation', type: 'main', index: 0 }]],
  };

  const baseLocal = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'workflow.json'), 'utf8'));
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: baseLocal.settings,
    staticData: workflow.staticData,
  };

  const putRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const putText = await putRes.text();
  if (!putRes.ok) {
    throw new Error(`PUT workflow failed: ${putRes.status} ${putText}`);
  }

  console.log(JSON.stringify({
    backupPath,
    status: putRes.status,
    response: JSON.parse(putText),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
