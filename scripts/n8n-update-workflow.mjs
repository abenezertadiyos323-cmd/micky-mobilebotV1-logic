import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadN8nEnv } from './load-n8n-env.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadN8nEnv(repoRoot);

if (typeof fetch !== 'function') {
  console.error('Error: Node.js 18+ is required because native fetch is not available.');
  process.exit(1);
}

const argv = process.argv.slice(2);
const lowerTokens = argv.map((value) => value.toLowerCase());

if (lowerTokens.includes('--help') || lowerTokens.includes('-h') || lowerTokens.includes('help')) {
  console.log('Usage: node scripts/n8n-update-workflow.mjs [test|prod|--test|--prod] [--id <workflow-id>] <workflow-json-file>');
  console.log('Defaults to test.');
  console.log('Example: node scripts/n8n-update-workflow.mjs --id 12345 ./workflow.json');
  process.exit(0);
}

const workflowType = resolveWorkflowType(lowerTokens);
const workflowFileArg = resolveWorkflowFileArg(argv);
const explicitWorkflowId = resolveExplicitWorkflowId(argv);
const { N8N_BASE_URL, N8N_API_KEY, WORKFLOW_ID, TEST_WORKFLOW_ID } = process.env;
const baseUrl = N8N_BASE_URL?.trim();
const apiKey = N8N_API_KEY?.trim();
const workflowId = (explicitWorkflowId || (workflowType === 'prod' ? WORKFLOW_ID : TEST_WORKFLOW_ID))?.trim();

try {
  assertRequiredValue(baseUrl, 'N8N_BASE_URL');
  assertRequiredValue(apiKey, 'N8N_API_KEY');
  assertRequiredValue(workflowId, explicitWorkflowId ? 'explicit workflow ID' : workflowType === 'prod' ? 'WORKFLOW_ID' : 'TEST_WORKFLOW_ID');
  assertRequiredValue(workflowFileArg, 'workflow JSON file path');

  const workflowFilePath = resolve(repoRoot, workflowFileArg);
  const localPayload = await readLocalWorkflowFile(workflowFilePath);
  const localWorkflow = extractWorkflowPayload(localPayload);

  validateWorkflowObject(localWorkflow, workflowFilePath);

  const remoteUrl = buildWorkflowUrl(baseUrl, workflowId);
  const remoteResponse = await fetch(remoteUrl, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      'X-N8N-API-KEY': apiKey,
    },
  });

  const remotePayload = await readJsonResponse(remoteResponse);
  if (!remoteResponse.ok) {
    throw new Error(formatApiError(remoteResponse, remotePayload));
  }

  const remoteWorkflow = extractWorkflowPayload(remotePayload);
  validateWorkflowObject(remoteWorkflow, `remote workflow ${workflowId}`);

  const backupsDir = resolve(repoRoot, 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const safeWorkflowId = sanitizePathSegment(workflowId);
  const backupFileName = `preupdate-${workflowType}-${safeWorkflowId}-${timestamp}.json`;
  const backupFilePath = resolve(backupsDir, backupFileName);

  await mkdir(backupsDir, { recursive: true });
  await writeFile(backupFilePath, `${JSON.stringify(remoteWorkflow, null, 2)}\n`, 'utf8');

  const updatePayload = buildUpdatePayload(localWorkflow, remoteWorkflow);
  const updateResponse = await updateWorkflow(remoteUrl, apiKey, updatePayload);
  const updatePayloadResponse = await readJsonResponse(updateResponse);

  if (!updateResponse.ok) {
    throw new Error(formatApiError(updateResponse, updatePayloadResponse));
  }

  console.log(`Success: updated ${workflowType} workflow ${workflowId}.`);
  console.log(`Backup saved to backups/${backupFileName}`);
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

function resolveWorkflowType(tokens) {
  if (tokens.includes('--prod') || tokens.includes('--production') || tokens.includes('prod') || tokens.includes('production')) {
    return 'prod';
  }

  return 'test';
}

function resolveWorkflowFileArg(args) {
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (value === '--id' || value === '-i') {
      i += 1;
      continue;
    }

    if (!value.startsWith('-') && !isTargetToken(value)) {
      return value;
    }
  }

  return '';
}

function resolveExplicitWorkflowId(args) {
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if ((value === '--id' || value === '-i') && args[i + 1] && !args[i + 1].startsWith('-')) {
      return args[i + 1];
    }
  }

  return '';
}

function isTargetToken(value) {
  const normalizedValue = value.toLowerCase();
  return normalizedValue === 'test' || normalizedValue === 'prod' || normalizedValue === 'production';
}

function assertRequiredValue(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable or argument: ${name}`);
  }
}

async function readLocalWorkflowFile(filePath) {
  try {
    const fileContents = await readFile(filePath, 'utf8');

    if (!fileContents.trim()) {
      throw new Error('file is empty');
    }

    return JSON.parse(fileContents);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(`Workflow JSON file not found: ${filePath}`);
    }

    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in workflow file: ${filePath}`);
    }

    throw new Error(`Unable to read workflow JSON file: ${filePath}${error?.message ? ` (${error.message})` : ''}`);
  }
}

function buildWorkflowUrl(baseUrl, workflowId) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(`api/v1/workflows/${encodeURIComponent(workflowId)}`, normalizedBaseUrl).toString();
}

async function updateWorkflow(url, apiKey, payload) {
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-N8N-API-KEY': apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (response.status !== 405) {
    return response;
  }

  return fetch(url, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'X-N8N-API-KEY': apiKey,
    },
    body: JSON.stringify(payload),
  });
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
  if (isWorkflowObject(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return payload;
  }

  if (isWorkflowObject(payload.data)) {
    return payload.data;
  }

  if (isWorkflowObject(payload.workflow)) {
    return payload.workflow;
  }

  return payload;
}

function isWorkflowObject(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      ('nodes' in value || 'connections' in value || 'settings' in value || 'active' in value || 'name' in value),
  );
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

function buildUpdatePayload(localWorkflow, remoteWorkflow) {
  // Strip settings fields rejected by the n8n API (e.g. binaryMode)
  const { binaryMode, ...safeSettings } = localWorkflow.settings ?? {};
  return {
    name: localWorkflow.name,
    nodes: localWorkflow.nodes,
    connections: localWorkflow.connections,
    settings: safeSettings,
  };
}

function sanitizePathSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}
