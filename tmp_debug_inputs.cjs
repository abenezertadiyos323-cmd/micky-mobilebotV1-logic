const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';

async function fetchExecutions() {
    return new Promise((resolve, reject) => {
        https.get({
            hostname: N8N_BASE_URL,
            path: '/api/v1/executions?limit=5',
            headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
        }, res => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body).data);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function dumpInputs(obj, indent = "") {
    if(!obj) return;
    if (obj['Telegram Input'] && obj['Telegram Input'][0] && obj['Telegram Input'][0].data && obj['Telegram Input'][0].data.main) {
        console.log(indent, "Telegram Input:", JSON.stringify(obj['Telegram Input'][0].data.main[0][0].json).substring(0, 100));
    }
    if (obj['Event Normalizer'] && obj['Event Normalizer'][0] && obj['Event Normalizer'][0].data && obj['Event Normalizer'][0].data.main) {
        console.log(indent, "Event Normalizer Output:", JSON.stringify(obj['Event Normalizer'][0].data.main[0][0].json).substring(0, 100));
    }
}

async function fetchExecutionData(id) {
    return new Promise((resolve, reject) => {
        https.get({
            hostname: N8N_BASE_URL,
            path: `/api/v1/executions/${id}`,
            headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
        }, res => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => resolve(JSON.parse(body)));
        }).on('error', reject);
    });
}

async function run() {
    const list = await fetchExecutions();
    for (const item of list) {
        const data = await fetchExecutionData(item.id);
        const runData = data.data?.resultData?.runData;
        console.log(`Execution ${item.id} status: ${item.status}`);
        if(runData) dumpInputs(runData, "  ");
    }
}
run();
