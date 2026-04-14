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
    
    // Just inject our locally patched version of Telegram Send
    const patchedLive = JSON.parse(fs.readFileSync('live_workflow.json', 'utf8'));
    const patchedNode = patchedLive.nodes.find(n => n.name === 'Telegram Send');
    
    const index = w.nodes.findIndex(n => n.name === 'Telegram Send');
    w.nodes[index] = patchedNode;

    const payload = JSON.stringify({ 
        name: w.name, 
        nodes: w.nodes, 
        connections: w.connections, 
        settings: baseLocalWf.settings, // from local workflow to prevent 400
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
