const fs = require('fs');
const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';
const WORKFLOW_ID = 'hc55q2zfas7gG1yu';

// Phase 1: Fetch live workflow
const fetchOptions = {
  hostname: N8N_BASE_URL,
  path: `/api/v1/workflows/${WORKFLOW_ID}`,
  method: 'GET',
  headers: {
    'X-N8N-API-KEY': API_KEY,
    'Accept': 'application/json'
  }
};

const req = https.request(fetchOptions, res => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error("FAIL FETCH", res.statusCode, data);
      process.exit(1);
    }
    
    // Got live workflow
    const w = JSON.parse(data);
    const conns = w.connections;
    
    // Validate live before change
    const rulesOut = conns['Rules Layer']?.main?.[0] || [];
    const hasAdminHandoff = rulesOut.some(c => c.node === 'Admin Handoff Notify?');
    
    const adminHandoffOut = conns['Admin Handoff Notify?']?.main?.[0] || [];
    const hasAdminTgSend = adminHandoffOut.some(c => c.node === 'Admin Handoff Telegram Send');
    
    console.log(`BEFORE FIX - Rules -> Admin Notify?: ${hasAdminHandoff ? 'YES' : 'NO'}`);
    console.log(`BEFORE FIX - Admin Notify? -> Telegram: ${hasAdminTgSend ? 'YES' : 'NO'}`);
    
    if (!hasAdminHandoff || !hasAdminTgSend) {
      console.error("VALIDATION FAILED: Target connections do not perfectly match expected live truth.");
      process.exit(1);
    }
    
    // Phase 2: Apply Live Fix
    // 1. Remove connection Rules Layer -> Admin Handoff Notify?
    conns['Rules Layer'].main[0] = conns['Rules Layer'].main[0].filter(c => c.node !== 'Admin Handoff Notify?');
    
    // 2. Remove connection Admin Handoff Notify? -> Admin Handoff Telegram Send
    delete conns['Admin Handoff Notify?'];
    
    // 3. Remove nodes from definition safely
    w.nodes = w.nodes.filter(n => n.name !== 'Admin Handoff Notify?' && n.name !== 'Admin Handoff Telegram Send');
    
    // Push updated workflow
    const payload = {
      name: w.name,
      nodes: w.nodes,
      connections: w.connections,
      settings: w.settings ?? {},
      staticData: w.staticData ?? null,
    };
    
    const body = JSON.stringify(payload);
    const pushOptions = {
      hostname: N8N_BASE_URL,
      path: `/api/v1/workflows/${WORKFLOW_ID}`,
      method: 'PUT',
      headers: {
        'X-N8N-API-KEY': API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    
    const pushReq = https.request(pushOptions, pushRes => {
      pushRes.on('data', () => {});
      pushRes.on('end', () => {
        if (pushRes.statusCode === 200 || pushRes.statusCode === 201) {
          console.log('PUSH SUCCESS');
        } else {
          console.error(`PUSH FAILED — HTTP ${pushRes.statusCode}`);
        }
      });
    });
    pushReq.on('error', e => console.error('PUSH FAILED', e));
    pushReq.write(body);
    pushReq.end();
  });
});

req.on('error', e => console.error("FETCH ERROR", e));
req.end();
