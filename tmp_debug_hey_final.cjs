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
                    resolve(JSON.parse(body).data);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

function recursiveSearch(obj, target) {
    if (obj == null) return false;
    if (typeof obj === 'string') {
        if (obj.toLowerCase().includes(target.toLowerCase())) return true;
        return false;
    }
    if (typeof obj === 'object') {
        for (let key in obj) {
            if (recursiveSearch(obj[key], target)) return true;
        }
    }
    return false;
}

async function fetchExecutionData(id) {
    return new Promise((resolve, reject) => {
        https.get({
            hostname: N8N_BASE_URL,
            path: `/api/v1/executions/${id}?includeData=true`,
            headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' }
        }, res => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch(e) { resolve(null); }
            });
        }).on('error', reject);
    });
}

async function run() {
    const list = await fetchExecutions();
    for (const item of list) {
        console.log(`Checking execution: ${item.id}`);
        const data = await fetchExecutionData(item.id);
        const runData = data?.data?.resultData?.runData;
        
        let hasHey = false;
        if (runData) {
            hasHey = recursiveSearch(runData, 'Hey');
        }
        
        if (hasHey) {
            console.log(`Found 'Hey' in execution ${item.id}`);
            require('fs').writeFileSync('hey_exec.json', JSON.stringify(data, null, 2));
            return;
        }
    }
    console.log("Not found in the first 20");
}
run();
