const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';

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
    const data = await fetchExecutionData(440);
    const runData = data.data?.resultData?.runData;
    if (runData) {
        console.log("Nodes in execution 440:", Object.keys(runData));
        for (let nodeName of Object.keys(runData)) {
            let firstTaskData = runData[nodeName][0]?.data?.main?.[0]?.[0]?.json;
            if (firstTaskData) {
                console.log(`  ${nodeName}:`, JSON.stringify(firstTaskData).substring(0, 100));
            } else {
                console.log(`  ${nodeName}: no main data`);
            }
        }
    } else {
        console.log("No runData found");
    }
}
run();
