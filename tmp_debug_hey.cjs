const https = require('https');

const N8N_BASE_URL = 'n8n-production-c119.up.railway.app';
const API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A';

async function fetchExecutions() {
    return new Promise((resolve, reject) => {
        https.get({
            hostname: N8N_BASE_URL,
            path: '/api/v1/executions?limit=20',
            headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
        }, res => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    if (res.statusCode !== 200) return reject(`Failed to list executions. HTTP ${res.statusCode}: ${body}`);
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
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve(parsed);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function run() {
    try {
        console.log("Fetching recent executions...");
        const list = await fetchExecutions();
        let targetExec = null;
        let execId = null;
        
        // Let's find "Hey" execution
        for (const item of list) {
            const data = await fetchExecutionData(item.id);
            const runData = data.data?.resultData?.runData;
            
            if (runData) {
                // Try Telegram Input or Event Normalizer to get user text
                const eventNorm = runData['Event Normalizer']?.[0]?.data?.main?.[0]?.[0]?.json;
                const tgInput = runData['Telegram Input']?.[0]?.data?.main?.[0]?.[0]?.json;
                const rawText = eventNorm?.event?.text || tgInput?.message?.text || tgInput?.body?.message?.text || '';
                
                if (rawText && rawText.toLowerCase().includes('hey')) {
                    targetExec = data;
                    execId = item.id;
                    break;
                }
            }
        }

        if (!targetExec) {
            console.log("No execution found for 'Hey'. Please output last execution data.");
            // Print the most recent error
            const errList = list.filter(l => l.status === 'error');
            if(errList.length > 0) {
                console.log(`Fallback: fetching most recent error ID: ${errList[0].id}`);
                const errData = await fetchExecutionData(errList[0].id);
                console.log("Writing to fallback.json...");
                require('fs').writeFileSync('fallback.json', JSON.stringify(errData, null, 2));
            } else {
                console.log(`Fallback: fetching most recent ID: ${list[0].id}`);
                const errData = await fetchExecutionData(list[0].id);
                require('fs').writeFileSync('fallback.json', JSON.stringify(errData, null, 2));
            }
            return;
        }

        console.log("Found 'Hey' Execution ID:", execId);
        require('fs').writeFileSync('hey_exec.json', JSON.stringify(targetExec, null, 2));
        console.log("Saved execution to hey_exec.json");
        
    } catch (e) {
        console.error(e);
    }
}

run();
