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

const resolverCode = [
  'const input = $json ?? {};',
  'const isRecord = (value) => !!value && typeof value === \"object\" && !Array.isArray(value);',
  'const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);',
  'const base = {',
  "  event: isRecord(input.event) ? input.event : {},",
  "  session: isRecord(input.session) ? input.session : {},",
  "  client_config: isRecord(input.client_config) ? input.client_config : {},",
  "  understanding_output: isRecord(input.understanding_output) ? input.understanding_output : {},",
  "  understanding_meta: isRecord(input.understanding_meta) ? input.understanding_meta : {},",
  "  rules_output: isRecord(input.rules_output) ? input.rules_output : {},",
  '};',
  '',
  "const normalizeError = () => ({",
  "  result_mode: 'error',",
  '  products: [],',
  "  metadata: { error_source: 'convex' },",
  '  missing_fields: [],',
  "  source: 'convex',",
  '});',
  '',
  'const normalizeStructured = (value) => ({',
  "  result_mode: typeof value.result_mode === 'string' && value.result_mode.trim() ? value.result_mode : ((Array.isArray(value.products) && value.products.length > 0) ? 'found' : 'not_found'),",
  "  products: Array.isArray(value.products) ? value.products : [],",
  "  metadata: isRecord(value.metadata) ? value.metadata : {},",
  "  missing_fields: Array.isArray(value.missing_fields) ? value.missing_fields : [],",
  "  source: typeof value.source === 'string' && value.source.trim() ? value.source : 'convex',",
  '});',
  '',
  'const isStructuredResolver = (value) => isRecord(value) && (',
  "  hasOwn(value, 'result_mode') || hasOwn(value, 'products') || hasOwn(value, 'metadata') || hasOwn(value, 'missing_fields') || hasOwn(value, 'source')",
  ');',
  '',
  'const isProductObject = (value) => isRecord(value) && [',
  "  '_id', 'phoneType', 'price', 'storage', 'ram', 'condition', 'stockQuantity', 'searchText', 'searchNormalized', 'type'",
  '].some((key) => hasOwn(value, key));',
  '',
  'const toFound = (product) => ({',
  "  result_mode: 'found',",
  '  products: [product],',
  '  metadata: {},',
  '  missing_fields: [],',
  "  source: 'convex',",
  '});',
  '',
  'const rootPayload = (() => {',
  "  const reserved = new Set(['event', 'session', 'client_config', 'understanding_output', 'understanding_meta', 'rules_output', 'error', 'pairedItem']);",
  '  const candidate = {};',
  '  for (const [key, value] of Object.entries(input)) {',
  '    if (reserved.has(key)) continue;',
  '    candidate[key] = value;',
  '  }',
  '  return candidate;',
  '})();',
  '',
  'const rawConvex = hasOwn(input, \"convex_response\") ? input.convex_response : null;',
  '',
  'let resolver_output;',
  'if (input.error || rawConvex?.error) {',
  '  resolver_output = normalizeError();',
  '} else if (Array.isArray(rawConvex)) {',
  '  resolver_output = {',
  "    result_mode: rawConvex.length > 0 ? 'found' : 'not_found',",
  '    products: rawConvex,',
  '    metadata: {},',
  '    missing_fields: [],',
  "    source: 'convex',",
  '  };',
  '} else if (isStructuredResolver(rawConvex)) {',
  '  resolver_output = normalizeStructured(rawConvex);',
  '} else if (isProductObject(rawConvex)) {',
  '  resolver_output = toFound(rawConvex);',
  '} else if (isStructuredResolver(rootPayload)) {',
  '  resolver_output = normalizeStructured(rootPayload);',
  '} else if (isProductObject(rootPayload)) {',
  '  resolver_output = toFound(rootPayload);',
  '} else if (Object.keys(rootPayload).length === 0) {',
  '  resolver_output = {',
  "    result_mode: 'not_found',",
  '    products: [],',
  '    metadata: {},',
  '    missing_fields: [],',
  "    source: 'convex',",
  '  };',
  '} else {',
  '  resolver_output = normalizeError();',
  '}',
  '',
  'return [{ json: { ...base, resolver_output } }];',
].join('\n');

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
    `business-resolver-contract-fix-prod-${workflowId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(workflow, null, 2));

  const node = workflow.nodes.find((item) => item.name === 'Business Data Resolver');
  if (!node) {
    throw new Error('Business Data Resolver node not found');
  }
  node.parameters.jsCode = resolverCode;

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
