/**
 * patch_rules_layer_fix.mjs
 * Replaces the Rules Layer jsCode in workflow.json with the correct full version
 * from scripts/rules_layer_full.js, then pushes the fixed workflow live.
 *
 * Usage: node scripts/patch_rules_layer_fix.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadN8nEnv } from './load-n8n-env.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadN8nEnv(repoRoot);

const WORKFLOW_FILE = resolve(repoRoot, 'workflow.json');
const RULES_LAYER_FILE = resolve(repoRoot, 'scripts', 'rules_layer_full.js');
const NODE_NAME = 'Rules Layer';
const { N8N_BASE_URL, N8N_API_KEY } = process.env;

async function main() {
  console.log('--- Step 1: Read workflow.json ---');
  const workflowRaw = await readFile(WORKFLOW_FILE, 'utf8');
  const workflow = JSON.parse(workflowRaw);
  if (!Array.isArray(workflow.nodes)) throw new Error('workflow.json has no nodes array');

  console.log('--- Step 2: Read correct Rules Layer code ---');
  const correctCode = await readFile(RULES_LAYER_FILE, 'utf8');
  if (!correctCode.trim()) throw new Error('rules_layer_full.js is empty');
  console.log(`  Rules Layer code: ${correctCode.split('\n').length} lines`);

  console.log('--- Step 3: Find and patch Rules Layer node ---');
  const rulesNode = workflow.nodes.find(n => n.name === NODE_NAME);
  if (!rulesNode) throw new Error(`Node "${NODE_NAME}" not found in workflow.json`);
  console.log(`  Found node: ${rulesNode.name} (id: ${rulesNode.id})`);

  const oldCode = rulesNode.parameters?.jsCode ?? rulesNode.parameters?.code ?? '';
  console.log(`  Old code length: ${oldCode.length} chars`);

  // Patch the jsCode
  if (rulesNode.parameters.jsCode !== undefined) {
    rulesNode.parameters.jsCode = correctCode;
  } else if (rulesNode.parameters.code !== undefined) {
    rulesNode.parameters.code = correctCode;
  } else {
    rulesNode.parameters.jsCode = correctCode;
  }
  console.log(`  New code length: ${correctCode.length} chars`);

  // Quick sanity check - verify key variables exist in the new code
  const requiredTerms = [
    'reference_resolution',
    'resolver_input',
    'product_context',
    'session_update',
    'mergedConstraints',
  ];
  for (const term of requiredTerms) {
    if (!correctCode.includes(term)) {
      throw new Error(`Sanity check failed: "${term}" not found in rules_layer_full.js`);
    }
  }
  console.log('  Sanity check: PASSED (all required terms present)');

  console.log('--- Step 4: Save patched workflow.json ---');
  await writeFile(WORKFLOW_FILE, JSON.stringify(workflow, null, 2), 'utf8');
  console.log('  workflow.json saved');

  console.log('--- Step 5: Push to n8n ---');
  const baseUrl = N8N_BASE_URL?.trim();
  const apiKey = N8N_API_KEY?.trim();
  if (!baseUrl) throw new Error('Missing N8N_BASE_URL in .env');
  if (!apiKey) throw new Error('Missing N8N_API_KEY in .env');

  // Find the workflow by name
  const listUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/workflows`;
  const listResp = await fetch(listUrl, {
    headers: { 'X-N8N-API-KEY': apiKey, 'Authorization': `Bearer ${apiKey}`, accept: 'application/json' },
  });
  if (!listResp.ok) {
    const txt = await listResp.text();
    throw new Error(`List workflows failed (${listResp.status}): ${txt}`);
  }
  const listData = await listResp.json();
  const workflows = Array.isArray(listData) ? listData : (listData.data ?? []);
  const match = workflows.find(w => typeof w.name === 'string' && w.name.includes('Abenier Bot Logic'));
  if (!match) throw new Error('Could not find "Abenier Bot Logic" workflow in n8n');
  const workflowId = String(match.id ?? match.workflowId ?? '').trim();
  if (!workflowId) throw new Error('Matched workflow has no ID');
  console.log(`  Workflow found: "${match.name}" (id: ${workflowId})`);

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
  const putText = await putResp.text();
  if (!putResp.ok) throw new Error(`PUT failed (${putResp.status}): ${putText}`);
  console.log(`  PUT response: ${putResp.status} OK`);

  // Verify
  const verifyResp = await fetch(putUrl, {
    headers: { 'X-N8N-API-KEY': apiKey, 'Authorization': `Bearer ${apiKey}`, accept: 'application/json' },
  });
  const verifyData = await verifyResp.json();
  const liveNodes = Array.isArray(verifyData.nodes) ? verifyData.nodes : (verifyData.data?.nodes ?? []);
  const liveRulesNode = liveNodes.find(n => n.name === NODE_NAME);
  const liveCode = liveRulesNode?.parameters?.jsCode ?? liveRulesNode?.parameters?.code ?? '';

  if (!liveCode.includes('resolver_input')) {
    throw new Error('Verification FAILED: live Rules Layer does not contain "resolver_input"');
  }
  if (!liveCode.includes('reference_resolution')) {
    throw new Error('Verification FAILED: live Rules Layer does not contain "reference_resolution"');
  }
  if (!liveCode.includes('product_context')) {
    throw new Error('Verification FAILED: live Rules Layer does not contain "product_context"');
  }

  console.log('');
  console.log('=== SUCCESS ===');
  console.log(`Workflow: ${match.name} (id: ${workflowId})`);
  console.log(`Live Rules Layer: ${liveCode.split('\n').length} lines`);
  console.log('Verification: PASSED - resolver_input, referenceResolution, product_context all present');
  console.log('Active:', verifyData.active ?? verifyData.data?.active ?? 'unknown');
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
