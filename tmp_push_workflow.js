const https = require('https');
const fs = require('fs');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';
const WORKFLOW_ID = 'hc55q2zfas7gG1yu';

let raw = fs.readFileSync('workflow.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const wf = JSON.parse(raw);

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
      const result = JSON.parse(data);
      console.log('\n✅ PUSH SUCCESSFUL');
      console.log(`  Workflow ID : ${result.id}`);
      console.log(`  Name        : ${result.name}`);
      console.log(`  Active      : ${result.active}`);
      console.log(`  Node count  : ${result.nodes?.length}`);
    } else {
      console.error(`\n❌ PUSH FAILED — HTTP ${res.statusCode}`);
      console.error(data.substring(0, 800));
    }
  });
});

req.on('error', e => console.error('Request error:', e.message));
req.write(body);
req.end();
