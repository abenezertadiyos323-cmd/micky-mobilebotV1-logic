const fs = require('fs');
const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';
const WORKFLOW_ID = 'hc55q2zfas7gG1yu';

const baseLocalWf = JSON.parse(fs.readFileSync('workflow.json', 'utf8'));

const req = https.request({
  hostname: N8N_BASE_URL,
  path: `/api/v1/workflows/${WORKFLOW_ID}`,
  method: 'GET',
  headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
}, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const w = JSON.parse(data);
    w.connections['Rules Layer'].main[0] = w.connections['Rules Layer'].main[0].filter(c => c.node !== 'Admin Handoff Notify?');
    delete w.connections['Admin Handoff Notify?'];
    w.nodes = w.nodes.filter(n => n.name !== 'Admin Handoff Notify?' && n.name !== 'Admin Handoff Telegram Send');

    // Use settings from my local workflow.json to avoid "additional properties" error from live metadata
    const payload = JSON.stringify({ 
        name: w.name, 
        nodes: w.nodes, 
        connections: w.connections, 
        settings: baseLocalWf.settings, 
        staticData: w.staticData 
    });
    
    const pushReq = https.request({
      hostname: N8N_BASE_URL,
      path: `/api/v1/workflows/${WORKFLOW_ID}`,
      method: 'PUT',
      headers: { 'X-N8N-API-KEY': API_KEY, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, pushRes => {
      let pushData = '';
      pushRes.on('data', d => pushData += d);
      pushRes.on('end', () => {
        console.log("HTTP", pushRes.statusCode);
        if(pushRes.statusCode !== 200) console.log("ERROR BODY:", pushData);
      });
    });
    pushReq.write(payload);
    pushReq.end();
  });
});
req.end();
