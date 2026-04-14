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
    const execId = list.data[0].id;
    console.log("EXEC ID:", execId);
    
    https.get({
      hostname: N8N_BASE_URL,
      path: `/api/v1/executions/${execId}`,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
    }, res2 => {
      let body2 = '';
      res2.on('data', d => body2 += d);
      res2.on('end', () => {
        const exec = JSON.parse(body2);
        const data = exec.data.executionData || exec.data.resultData || exec.data;
        // In n8n API, execution details are inside "data". 
        // Let's just print a truncated string representation to easily spot the error.
        const output = JSON.stringify(exec, null, 2);
        const tgIndex = output.indexOf('Telegram Send');
        if(tgIndex !== -1) {
             console.log(output.substring(tgIndex - 50, tgIndex +  1000));
        } else {
             console.log("No Telegram Send in execution body.");
             // Let's print the entire result error message:
             console.log(output.substring(0, 1000));
        }
      });
    });
  });
}).on('error', e => console.error(e));
