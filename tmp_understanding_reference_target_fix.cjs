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
    `understanding-reference-target-fix-prod-${workflowId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(workflow, null, 2));

  const node = workflow.nodes.find((item) => item.name === 'Understanding AI');
  if (!node) throw new Error('Understanding AI node not found');

  const original = node.parameters?.jsonBody;
  if (typeof original !== 'string') {
    throw new Error('Understanding AI jsonBody is not a string expression');
  }

  const anchor =
    'Otherwise ALWAYS return:\\n\\n\\"reference_resolution\\": { \\"refers_to\\": null, \\"resolved_id\\": null }\\n\\n4. If the meaning is unclear, return clarification with low confidence and high ambiguity.';

  const insert =
    'Otherwise ALWAYS return:\\n\\n\\"reference_resolution\\": { \\"refers_to\\": null, \\"resolved_id\\": null }\\n\\nIf the CURRENT message clearly names a specific product or model, you may set:\\n\\n\\"reference_resolution\\": { \\"refers_to\\": \\"explicit product target\\", \\"resolved_id\\": null }\\n\\nUse this when the customer directly names the product in the current message, even if it is not a previous-turn reference.\\n\\n4. If the meaning is unclear, return clarification with low confidence and high ambiguity.';

  if (!original.includes(anchor)) {
    throw new Error('Reference anchor block not found');
  }

  node.parameters.jsonBody = original.replace(anchor, insert);

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
