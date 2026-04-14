const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';

async function fetchExecutions() {
    return new Promise((resolve, reject) => {
        https.get({
            hostname: N8N_BASE_URL,
            path: '/api/v1/executions?limit=50',
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
    console.log("Fetching executions...");
    const list = await fetchExecutions();
    let found = false;
    for (const item of list) {
        const data = await fetchExecutionData(item.id);
        const runData = data.data?.resultData?.runData;
        
        let textFound = "";
        
        // n8n Webhook?
        if (runData && runData['Telegram Input']) {
             try {
                let body = runData['Telegram Input'][0].data.main[0][0].json;
                textFound = body.message?.text || body.body?.message?.text || '';
             } catch(e) {}
        }
        
        if (runData && runData['Webhook']) {
            try {
                let body = runData['Webhook'][0].data.main[0][0].json;
                textFound = body.body?.message?.text || body.message?.text || '';
            } catch(e) {}
        }
        
        console.log(`Exec ${item.id}: status=${item.status}, text="${textFound}"`);
        
        if (textFound.toLowerCase().includes('hey') && !found) {
            require('fs').writeFileSync('hey_exec.json', JSON.stringify(data, null, 2));
            console.log(`>>> Saved Exec ${item.id} to hey_exec.json`);
            found = true;
        }
    }
}
run();
