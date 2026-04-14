const fs = require('fs');
const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';
const WORKFLOW_ID = 'hc55q2zfas7gG1yu';

const options = {
  hostname: N8N_BASE_URL,
  path: `/api/v1/workflows/${WORKFLOW_ID}`,
  method: 'GET',
  headers: {
    'X-N8N-API-KEY': API_KEY,
    'Accept': 'application/json'
  }
};

const req = https.request(options, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    if (res.statusCode === 200) {
      fs.writeFileSync('live_workflow.json', data);
      console.log('SUCCESS');
    } else {
      console.error(`FAILED: ${res.statusCode}`);
      console.error(data);
    }
  });
});

req.on('error', e => console.error('FAILED', e.message));
req.end();
