import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadN8nEnv } from './load-n8n-env.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadN8nEnv(repoRoot);

if (typeof fetch !== 'function') {
  console.error('Error: Node.js 18+ is required because native fetch is not available.');
  process.exit(1);
}

const argv = process.argv.slice(2).map((value) => value.toLowerCase());
if (argv.includes('--help') || argv.includes('-h') || argv.includes('help')) {
  console.log('Usage: node scripts/n8n-create-workflow.mjs');
  process.exit(0);
}

const { N8N_BASE_URL, N8N_API_KEY } = process.env;
const baseUrl = N8N_BASE_URL?.trim();
const apiKey = N8N_API_KEY?.trim();
const workflowFilePath = resolve(repoRoot, 'workflow.json');

try {
  assertRequiredValue(baseUrl, 'N8N_BASE_URL');
  assertRequiredValue(apiKey, 'N8N_API_KEY');

  const workflow = await readWorkflowFile(workflowFilePath);
  validateWorkflowObject(workflow, workflowFilePath);

  const url = buildCreateWorkflowUrl(baseUrl);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-N8N-API-KEY': apiKey,
    },
    body: JSON.stringify(workflow),
  });

  const payload = await readJsonResponse(response);
  if (!response.ok) {
    throw new Error(formatApiError(response, payload));
  }

  const createdWorkflow = extractWorkflowPayload(payload);
  const createdId = String(createdWorkflow?.id ?? '').trim();
  const createdName = String(createdWorkflow?.name ?? '').trim() || workflow.name;

  if (!createdId) {
    throw new Error('n8n API did not return a workflow ID.');
  }

  console.log(`Success: created workflow "${createdName}" with ID ${createdId}.`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

function assertRequiredValue(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
}

async function readWorkflowFile(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    if (!text.trim()) {
      throw new Error('file is empty');
    }
    return JSON.parse(text);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Workflow file not found: ${filePath}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in workflow file: ${filePath}`);
    }

    throw new Error(`Unable to read workflow file: ${filePath}${error?.message ? ` (${error.message})` : ''}`);
  }
}

function validateWorkflowObject(workflow, label) {
  if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) {
    throw new Error(`Invalid workflow JSON in ${label}: expected an object.`);
  }

  const errors = [];
  if (typeof workflow.name !== 'string' || !workflow.name.trim()) {
    errors.push('name must be a non-empty string');
  }
  if (!Array.isArray(workflow.nodes)) {
    errors.push('nodes must be an array');
  }
  if (!workflow.connections || typeof workflow.connections !== 'object' || Array.isArray(workflow.connections)) {
    errors.push('connections must be an object');
  }
  if (!workflow.settings || typeof workflow.settings !== 'object' || Array.isArray(workflow.settings)) {
    errors.push('settings must be an object');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid workflow JSON in ${label}: ${errors.join(', ')}.`);
  }
}

function buildCreateWorkflowUrl(baseUrl) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('api/v1/workflows', normalizedBaseUrl).toString();
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatApiError(response, payload) {
  const details = extractErrorDetails(payload);
  const baseMessage = `n8n API request failed (${response.status} ${response.statusText})`;
  return details ? `${baseMessage}: ${details}` : baseMessage;
}

function extractErrorDetails(payload) {
  if (typeof payload === 'string') {
    return payload.trim();
  }

  if (!payload || typeof payload !== 'object') {
    return '';
  }

  const candidates = [
    payload.message,
    payload.error?.message,
    payload.error,
    payload.detail,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }

  return '';
}

function extractWorkflowPayload(payload) {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
      return payload.data;
    }

    if (payload.workflow && typeof payload.workflow === 'object' && !Array.isArray(payload.workflow)) {
      return payload.workflow;
    }
  }

  return payload;
}
