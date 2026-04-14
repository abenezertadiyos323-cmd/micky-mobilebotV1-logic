import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadN8nEnv } from './load-n8n-env.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadN8nEnv(repoRoot);

const WORKFLOW_FILE = resolve(repoRoot, 'workflow.json');
const { N8N_BASE_URL, N8N_API_KEY } = process.env;

async function main() {
  const workflowRaw = await readFile(WORKFLOW_FILE, 'utf8');
  const workflow = JSON.parse(workflowRaw);

  const baseUrl = N8N_BASE_URL?.trim();
  const apiKey = N8N_API_KEY?.trim();

  // Find the workflow by name
  const listUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/workflows`;
  const listResp = await fetch(listUrl, {
    headers: { 'X-N8N-API-KEY': apiKey, 'Authorization': `Bearer ${apiKey}`, accept: 'application/json' },
  });
  const listData = await listResp.json();
  const workflows = Array.isArray(listData) ? listData : (listData.data ?? []);
  const match = workflows.find(w => typeof w.name === 'string' && w.name.includes('Abenier Bot Logic'));
  const workflowId = String(match.id ?? match.workflowId ?? '').trim();

  console.log(`Pushing to ${workflowId}...`);
  // Push update
  const putUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/workflows/${encodeURIComponent(workflowId)}`;
  const putBody = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    ...(workflow.settings ? { settings: workflow.settings } : {}),
  };

  const putResp = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(putBody),
  });
  console.log(`PUT response: ${putResp.status}`);
  if (!putResp.ok) {
    const errorText = await putResp.text();
    console.error(`Error details: ${errorText}`);
  }
}

main().catch(console.error);
