const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';

https.get({
  hostname: N8N_BASE_URL,
  path: `/api/v1/executions?status=error&limit=1`,
  headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
}, res => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', () => {
    const list = JSON.parse(body);
    if (!list.data || list.data.length === 0) {
      console.log("No recent error executions found.");
      return;
    }
    const execId = list.data[0].id;
    console.log("Found error execution ID:", execId);
    
    https.get({
      hostname: N8N_BASE_URL,
      path: `/api/v1/executions/${execId}`,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
    }, res2 => {
      let body2 = '';
      res2.on('data', d => body2 += d);
      res2.on('end', () => {
        const exec = JSON.parse(body2);
        const runData = exec.data?.executionData?.contextData ?? exec.data?.resultData?.runData ?? exec.data?.data?.resultData?.runData;
        console.log(Object.keys(exec.data || {}), Object.keys(exec.data?.data?.resultData || {}));
        
        let tgNode, validation;
        if (runData) {
            tgNode = runData['Telegram Send'];
            validation = runData['Validation'] || runData['Safe To Send'];
        }

        console.log(JSON.stringify(tgNode, null, 2));
      });
    });
  });
}).on('error', e => console.error(e));
