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
const baseUrl = env.N8N_BASE_URL;
const apiKey = env.N8N_API_KEY;
const workflowId = 'hc55q2zfas7gG1yu';

const FIXED_EXCHANGE_BLOCK = [
  "- exchange clarification: ask only the missing exchange slots from understanding_output.missing_information or resolver_output.missing_fields. If the current message already names the phone or model, do not ask the generic 'what phone do you have?' again. For iPhone exchange follow-ups, prefer model, storage, battery_health, and condition. For Samsung exchange follow-ups, prefer model, storage, ram, and condition.",
  '- handoff_admin: short reassurance only. No question.',
].join('\\n');

function extractBody(expr) {
  if (typeof expr !== 'string') return null;
  const trimmed = expr.trim();
  if (trimmed.startsWith('={{') && trimmed.endsWith('}}')) {
    return trimmed.slice(3, -2);
  }
  return expr;
}

function wrapBody(body) {
  return `={{ ${body} }}`;
}

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
    `reply-ai-exchange-prompt-fix-prod-${workflowId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(workflow, null, 2));

  const node = workflow.nodes.find((item) => item.name === 'Reply AI');
  if (!node) {
    throw new Error('Reply AI node not found');
  }

  const originalExpr = node.parameters?.jsonBody;
  const body = extractBody(originalExpr);
  if (!body) {
    throw new Error('Reply AI jsonBody missing or invalid');
  }

  const pattern = /- exchange clarification:[\s\S]*?- handoff_admin: short reassurance only\. No question\./;
  if (!pattern.test(body)) {
    throw new Error('Could not find malformed exchange clarification block to replace');
  }

  const fixedBody = body.replace(pattern, FIXED_EXCHANGE_BLOCK);

  try {
    new Function(`return (${fixedBody});`);
  } catch (error) {
    throw new Error(`Fixed Reply AI expression still fails to compile: ${error.message}`);
  }

  node.parameters.jsonBody = wrapBody(fixedBody);

  const baseLocal = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'workflow.json'), 'utf8'));
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: baseLocal.settings,
    staticData: workflow.staticData ?? {},
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
