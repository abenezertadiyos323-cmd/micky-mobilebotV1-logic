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

const rulesCode = [
  'const input = $json ?? {};',
  "const understanding = input.understanding_output && typeof input.understanding_output === 'object' ? input.understanding_output : {};",
  "const event = input.event && typeof input.event === 'object' ? input.event : {};",
  "const session = input.session && typeof input.session === 'object' ? input.session : {};",
  '',
  "const messageFunction = typeof understanding.message_function === 'string' ? understanding.message_function : 'off_topic';",
  "const businessIntent = typeof understanding.business_intent === 'string' ? understanding.business_intent : null;",
  "const confidence = typeof understanding.confidence === 'number' ? understanding.confidence : 0;",
  "const ambiguity = typeof understanding.ambiguity === 'number' ? understanding.ambiguity : 0;",
  "const missingInformation = Array.isArray(understanding.missing_information)",
  "  ? understanding.missing_information.filter((value) => typeof value === 'string').map((value) => value.trim().toLowerCase()).filter(Boolean)",
  "  : [];",
  "const referenceResolution = understanding.reference_resolution && typeof understanding.reference_resolution === 'object'",
  "  ? understanding.reference_resolution",
  "  : {};",
  "const hasResolvedReference = Boolean(",
  "  (typeof referenceResolution.resolved_id === 'string' && referenceResolution.resolved_id.trim())",
  "  || (typeof referenceResolution.refers_to === 'string' && referenceResolution.refers_to.trim())",
  ");",
  "const currentInterest = session.flow_context?.buy_flow?.current_interest ?? null;",
  "const hasActiveProductContext = Boolean(",
  "  currentInterest && (typeof currentInterest !== 'object' || currentInterest.id || currentInterest.model || currentInterest.phoneType || currentInterest.brand)",
  ");",
  "const isStartEvent = event.event_type === 'start_reset' || event.event_type === 'deep_link_start';",
  "const coreProductFieldsMissing = missingInformation.includes('model') || missingInformation.includes('brand');",
  "const shouldClarifyUnderspecifiedProduct =",
  "  businessIntent === 'product_search'",
  "  && ['fresh_request', 'refinement'].includes(messageFunction)",
  "  && coreProductFieldsMissing",
  "  && !hasResolvedReference",
  "  && !hasActiveProductContext;",
  '',
  "let should_call_resolver = false;",
  "let reply_mode = 'small_talk_redirect';",
  "let next_action = 'redirect_to_business';",
  "let handoff_needed = false;",
  '',
  "if (isStartEvent) {",
  "  reply_mode = 'small_talk_redirect';",
  "  should_call_resolver = false;",
  "  next_action = 'greet_or_redirect';",
  "} else if (messageFunction === 'acknowledgment') {",
  "  reply_mode = 'small_talk_redirect';",
  "  should_call_resolver = false;",
  "  next_action = 'greet_or_redirect';",
  "} else if (messageFunction === 'info_request') {",
  "  reply_mode = 'business_resolve';",
  "  should_call_resolver = true;",
  "  next_action = 'provide_info';",
  "} else if (messageFunction === 'negotiation') {",
  "  reply_mode = 'business_resolve';",
  "  should_call_resolver = true;",
  "  next_action = 'handle_negotiation';",
  "} else if (messageFunction === 'refinement' || messageFunction === 'fresh_request') {",
  "  reply_mode = 'business_resolve';",
  "  should_call_resolver = true;",
  "  next_action = 'process_request';",
  "} else {",
  "  reply_mode = 'small_talk_redirect';",
  "  should_call_resolver = false;",
  "  next_action = 'redirect_to_business';",
  "}",
  '',
  "if ((ambiguity > 0.5 && confidence < 0.5) || messageFunction === 'clarification' || shouldClarifyUnderspecifiedProduct) {",
  "  reply_mode = 'clarify_reference';",
  "  should_call_resolver = false;",
  "  next_action = 'ask_clarification';",
  "}",
  '',
  "if (confidence < 0.3 && ambiguity > 0.8) {",
  "  handoff_needed = true;",
  "  reply_mode = 'handoff_admin';",
  "  should_call_resolver = false;",
  "  next_action = 'escalate_to_human';",
  "}",
  '',
  "const rules_output = {",
  "  should_call_resolver,",
  "  reply_mode,",
  "  handoff_needed,",
  "  next_action,",
  "  confidence,",
  "};",
  '',
  "return [{",
  "  json: {",
  "    ...input,",
  "    rules_output,",
  "  },",
  "}];",
].join('\n');

const productSearchJsonBody = String.raw`={{ JSON.stringify({
  sellerId: (() => {
    const raw = $json.client_config?.sellerId ?? $env.SELLER_ID ?? $json.client_config?.store_name ?? 'tedytech';
    return String(raw || '').trim().toLowerCase();
  })(),
  brand: (() => {
    const candidates = [
      $json.session?.collected_constraints?.brand,
      $json.session?.flow_context?.buy_flow?.current_interest?.brand,
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  })(),
  model: (() => {
    const missing = Array.isArray($json.understanding_output?.missing_information)
      ? $json.understanding_output.missing_information
          .filter((value) => typeof value === 'string')
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean)
      : [];
    const hasCoreMissing = missing.includes('model') || missing.includes('brand');
    const messageFunction = $json.understanding_output?.message_function ?? null;
    const businessIntent = $json.understanding_output?.business_intent ?? null;
    const resolvedText = (() => {
      const value = $json.understanding_output?.reference_resolution?.refers_to;
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    })();
    const candidates = [
      resolvedText,
      $json.session?.collected_constraints?.model,
      $json.session?.flow_context?.buy_flow?.current_interest?.model,
      $json.session?.flow_context?.buy_flow?.current_interest?.phoneType,
      (() => {
        const value = $json.event?.text;
        const allowRawText =
          businessIntent === 'product_search'
          && ['fresh_request', 'refinement'].includes(messageFunction)
          && !hasCoreMissing
          && !resolvedText;
        return allowRawText && typeof value === 'string' && value.trim() ? value.trim() : null;
      })(),
    ];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  })(),
  maxPrice: (() => {
    const numeric = Number($json.session?.collected_constraints?.budget_etb ?? NaN);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
  })(),
}) }}`;

async function main() {
  const getRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`, {
    headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
  });
  if (!getRes.ok) {
    throw new Error(`GET workflow failed: ${getRes.status} ${await getRes.text()}`);
  }
  const workflow = await getRes.json();

  const backupDir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `rules-productsearch-root-fix-prod-${workflowId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(workflow, null, 2));

  const rulesNode = workflow.nodes.find((item) => item.name === 'Rules Layer');
  if (!rulesNode) throw new Error('Rules Layer node not found');
  rulesNode.parameters.jsCode = rulesCode;

  const productSearchNode = workflow.nodes.find((item) => item.name === 'Product Search (Convex Test)');
  if (!productSearchNode) throw new Error('Product Search (Convex Test) node not found');
  productSearchNode.parameters.jsonBody = productSearchJsonBody;

  const baseLocal = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'workflow.json'), 'utf8'));
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: baseLocal.settings,
    staticData: workflow.staticData ?? {},
    pinData: workflow.pinData ?? {},
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
