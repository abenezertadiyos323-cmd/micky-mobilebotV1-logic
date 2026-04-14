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

const normalizeCode = [
  'const input = $json ?? {};',
  'const readBase = () => {',
  "  for (const nodeName of ['Business Data Resolver', 'Set No-Resolver Output']) {",
  '    try {',
  '      const ref = $(nodeName);',
  '      if (!ref || !ref.isExecuted) continue;',
  '      const candidate = ref.first()?.json;',
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
  "const cleanText = (value) => value.replace(/\\r\\n/g, '\\n').replace(/\\r/g, '\\n').trim();",
  "const looksLikeJsonFragment = (value) => /^\\s*[\\[{]/.test(value) || value.includes('\"reply_text\"');",
  "const parseReplyText = (value) => {",
  "  if (!value) return '';",
  "  if (typeof value === 'string') {",
  '    const cleaned = cleanText(value);',
  "    if (!cleaned) return '';",
  '    try {',
  '      const parsed = JSON.parse(cleaned);',
  "      if (parsed && typeof parsed.reply_text === 'string') {",
  '        return cleanText(parsed.reply_text);',
  '      }',
  '    } catch {',
  "      if (looksLikeJsonFragment(cleaned)) return '';",
  '    }',
  '    return cleaned;',
  '  }',
  "  if (typeof value === 'object') {",
  "    if (typeof value.reply_text === 'string') {",
  '      return cleanText(value.reply_text);',
  '    }',
  '    return \'\';',
  '  }',
  "  return '';",
  '};',
  '',
  "const raw = input.reply_ai_raw && typeof input.reply_ai_raw === 'object' ? input.reply_ai_raw : input;",
  "const providerError = raw?.choices?.[0]?.error ?? raw?.error ?? null;",
  'const reply_text = providerError',
  "  ? ''",
  '  : (parseReplyText(raw?.choices?.[0]?.message?.content)',
  '    || parseReplyText(raw?.output_text)',
  '    || parseReplyText(raw?.text)',
  "    || '');",
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
    `reply-ai-normalize-guard-fix-prod-${workflowId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(workflow, null, 2));

  const node = workflow.nodes.find((item) => item.name === 'Reply AI Normalize');
  if (!node) {
    throw new Error('Reply AI Normalize node not found');
  }
  node.parameters.jsCode = normalizeCode;

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
