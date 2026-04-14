const fs = require('fs');
const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';
const WORKFLOW_ID = 'hc55q2zfas7gG1yu';

let raw = fs.readFileSync('workflow.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const wf = JSON.parse(raw);

// Pre-Validation
const prodSearch = wf.nodes.find(n => n.name === 'Product Search (Convex Test)');
const bizResolver = wf.nodes.find(n => n.name === 'Business Data Resolver');
const noResolver = wf.nodes.find(n => n.name === 'Set No-Resolver Output');

const errors = [];

// 1. Product Search
if (!prodSearch) errors.push("Product Search node missing");
else {
  if (prodSearch.parameters.jsonBody?.includes('.match(')) errors.push("Product Search has regex");
  if (!prodSearch.parameters.options?.responsePropertyName) errors.push("Product Search missing responsePropertyName");
}

// 2. Business Resolver
if (!bizResolver) errors.push("Business Resolver missing");
else {
  const code = bizResolver.parameters.jsCode || '';
  if (code.includes('.filter(')) errors.push("Business Resolver has filter");
  if (code.includes('$node[')) errors.push("Business Resolver has cross-node refs");
  if (!code.includes('result_mode: "error"')) errors.push("Business Resolver missing strict error mode output");
}

// 3. No Resolver
if (!noResolver) errors.push("Set No-Resolver Output missing");
else {
  if (!noResolver.parameters.jsCode?.includes('resolver_output: null')) errors.push("Set No-Resolver Output does not return null");
}

if (errors.length > 0) {
  console.log("VALIDATION FAILED");
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log("VALIDATION PASSED");

// Push Payload
const payload = {
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings ?? {},
  staticData: wf.staticData ?? null,
};

const body = JSON.stringify(payload);

const options = {
  hostname: N8N_BASE_URL,
  path: `/api/v1/workflows/${WORKFLOW_ID}`,
  method: 'PUT',
  headers: {
    'X-N8N-API-KEY': API_KEY,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    if (res.statusCode === 200 || res.statusCode === 201) {
      console.log('DEPLOY SUCCESS');
    } else {
      console.error(`DEPLOY FAILED — HTTP ${res.statusCode}`);
      console.error(data.substring(0, 800));
    }
  });
});

req.on('error', e => {
  console.error('DEPLOY FAILED', e.message)
});
req.write(body);
req.end();
