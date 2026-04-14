import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
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
  console.log('Usage: node scripts/n8n-sync-workflow.mjs [workflow-json-file]');
  console.log('Defaults to ./workflow.json and searches for a workflow whose name includes "Abenier Bot Logic".');
  process.exit(0);
}

const workflowFileArg = resolveWorkflowFileArg(argv) || 'workflow.json';
const targetWorkflowName = 'Abenier Bot Logic';
const { N8N_BASE_URL, N8N_API_KEY } = process.env;
const baseUrl = N8N_BASE_URL?.trim();
const apiKey = N8N_API_KEY?.trim();

try {
  assertRequiredValue(baseUrl, 'N8N_BASE_URL');
  assertRequiredValue(apiKey, 'N8N_API_KEY');
  assertRequiredValue(workflowFileArg, 'workflow JSON file path');

  const workflowFilePath = resolve(repoRoot, workflowFileArg);
  const localPayload = await readLocalWorkflowFile(workflowFilePath);
  const localWorkflow = extractWorkflowPayload(localPayload);
  validateWorkflowObject(localWorkflow, workflowFilePath);

  const listUrl = buildApiUrl(baseUrl, 'api/v1/workflows');
  const listResponse = await fetch(listUrl, {
    method: 'GET',
    headers: buildAuthHeaders(apiKey),
  });

  const listPayload = await readJsonResponse(listResponse);
  if (!listResponse.ok) {
    throw new Error(formatApiError(listResponse, listPayload));
  }

  const workflows = extractWorkflowList(listPayload);
  const match = findWorkflowByName(workflows, targetWorkflowName);
  if (!match) {
    throw new Error(`No n8n workflow name matched "${targetWorkflowName}".`);
  }

  const workflowId = String(match.id ?? match.workflowId ?? match.uuid ?? '').trim();
  if (!workflowId) {
    throw new Error(`Matched workflow "${match.name ?? '(unnamed)'}" does not have a usable workflow ID.`);
  }

  const workflowUrl = buildApiUrl(baseUrl, `api/v1/workflows/${encodeURIComponent(workflowId)}`);
  const updatePayload = buildUpdatePayload(localWorkflow);
  const comparableLocal = toComparableWorkflow(updatePayload, localWorkflow);

  const putResponse = await fetch(workflowUrl, {
    method: 'PUT',
    headers: {
      ...buildAuthHeaders(apiKey),
      'content-type': 'application/json',
    },
    body: JSON.stringify(updatePayload),
  });

  const putPayload = await readJsonResponse(putResponse);
  if (!putResponse.ok) {
    throw new Error(formatApiError(putResponse, putPayload));
  }

  const verifyResponse = await fetch(workflowUrl, {
    method: 'GET',
    headers: buildAuthHeaders(apiKey),
  });

  const verifyPayload = await readJsonResponse(verifyResponse);
  if (!verifyResponse.ok) {
    throw new Error(formatApiError(verifyResponse, verifyPayload));
  }

  const remoteWorkflow = extractWorkflowPayload(verifyPayload);
  validateWorkflowObject(remoteWorkflow, `remote workflow ${workflowId}`);
  const comparableRemote = toComparableWorkflow(remoteWorkflow, localWorkflow);

  const synced = isDeepStrictEqual(comparableLocal, comparableRemote);
  if (!synced) {
    const diff = findFirstDifference(comparableLocal, comparableRemote);
    throw new Error(`Verification failed: live workflow does not match local workflow.json. First difference: ${diff}`);
  }

  if (!remoteWorkflow.active) {
    throw new Error('Verification failed: live workflow is not active.');
  }

  console.log(`workflowId: ${workflowId}`);
  console.log('PUT request: success');
  console.log(`workflow activated: ${remoteWorkflow.active ? 'true' : 'false'}`);
  console.log('verification result: live workflow matches local workflow.json and is active');
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

function resolveWorkflowFileArg(args) {
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (value === '--id' || value === '-i' || value === '--name' || value === '--match') {
      i += 1;
      continue;
    }

    if (!value.startsWith('-') && !isTargetToken(value)) {
      return value;
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

function buildApiUrl(baseUrl, path) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBaseUrl).toString();
}

function buildAuthHeaders(apiKey) {
  return {
    accept: 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'X-N8N-API-KEY': apiKey,
  };
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

function extractWorkflowList(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const candidates = [
    payload.data,
    payload.workflows,
    payload.results,
    payload.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
    if (candidate && typeof candidate === 'object') {
      const nested = extractWorkflowList(candidate);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function findWorkflowByName(workflows, targetName) {
  const normalizedTarget = targetName.toLowerCase();
  const candidates = workflows.filter((workflow) => workflow && typeof workflow === 'object' && !Array.isArray(workflow));
  const exactMatches = candidates.filter((workflow) => normalizeText(workflow.name)?.toLowerCase() === normalizedTarget);
  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  const partialMatches = candidates.filter((workflow) => normalizeText(workflow.name)?.toLowerCase().includes(normalizedTarget));
  return partialMatches[0] ?? null;
}

function normalizeText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
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

  if ('settings' in workflow && (workflow.settings === null || typeof workflow.settings !== 'object' || Array.isArray(workflow.settings))) {
    errors.push('settings must be an object when present');
  }

  if (errors.length > 0) {
    throw new Error(`Invalid workflow JSON in ${label}: ${errors.join(', ')}.`);
  }
}

function buildUpdatePayload(workflow) {
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
  };

  if ('settings' in workflow) {
    payload.settings = workflow.settings;
  }

  return payload;
}

function toComparableWorkflow(workflow, templateWorkflow) {
  const comparable = {
    name: workflow.name,
    nodes: Array.isArray(workflow.nodes) ? workflow.nodes.map(normalizeNodeForCompare) : workflow.nodes,
    connections: workflow.connections,
  };

  const templateSettings = templateWorkflow && typeof templateWorkflow === 'object' ? templateWorkflow.settings : undefined;
  const templateSettingsKeys = templateSettings && typeof templateSettings === 'object' && !Array.isArray(templateSettings)
    ? Object.keys(templateSettings)
    : [];
  if (templateSettingsKeys.length > 0) {
    comparable.settings = {};
    for (const key of templateSettingsKeys) {
      comparable.settings[key] = workflow.settings?.[key];
    }
  }

  return comparable;
}

function normalizeNodeForCompare(node) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return node;
  }

  const clone = { ...node };
  delete clone.webhookId;
  return clone;
}

function findFirstDifference(expected, actual, path = 'root') {
  if (Object.is(expected, actual)) {
    return 'none';
  }

  if (typeof expected !== typeof actual) {
    return `${path} type differs (${typeof expected} vs ${typeof actual})`;
  }

  if (expected === null || actual === null || typeof expected !== 'object') {
    return `${path} value differs`;
  }

  if (Array.isArray(expected) !== Array.isArray(actual)) {
    return `${path} array-vs-object mismatch`;
  }

  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) {
      return `${path} length differs (${expected.length} vs ${actual.length})`;
    }

    for (let i = 0; i < expected.length; i += 1) {
      const nested = findFirstDifference(expected[i], actual[i], `${path}[${i}]`);
      if (nested !== 'none') {
        return nested;
      }
    }

    return 'none';
  }

  const keys = new Set([...Object.keys(expected), ...Object.keys(actual)]);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(expected, key)) {
      return `${path}.${key} missing from expected`;
    }
    if (!Object.prototype.hasOwnProperty.call(actual, key)) {
      return `${path}.${key} missing from actual`;
    }

    const nested = findFirstDifference(expected[key], actual[key], `${path}.${key}`);
    if (nested !== 'none') {
      return nested;
    }
  }

  return 'none';
}
