import fs from 'fs';

const baseUrl = "https://n8n-production-c119.up.railway.app";
const apiKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIzNTVhMDE1ZS02ZDY0LTQ5MjYtYWEyNC01MTVjMzg0ZDhkNWYiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiMDc2NDljOTQtYzNhOC00NjRmLTkzOTYtZDk0NTJjMWNhZmNhIiwiaWF0IjoxNzc1NDIxMTkyLCJleHAiOjE3Nzc5NTM2MDB9.xrscOvX9B6wPBOV4lO-OAQBkOSN4uJyFoMB4-X9t_7A";

const headers = {
    "accept": "application/json",
    "X-N8N-API-KEY": apiKey
};

async function main() {
    try {
        const resp = await fetch(`${baseUrl}/api/v1/workflows`, { headers });
        if (!resp.ok) throw new Error(`HTTP error! status: ${resp.status}`);
        const data = await resp.json();
        const workflows = data.data || [];
        const active_ids = workflows.filter(w => w.active === true).map(w => w.id);
        
        for (const wid of active_ids) {
            const resp_w = await fetch(`${baseUrl}/api/v1/workflows/${wid}`, { headers });
            if (!resp_w.ok) throw new Error(`HTTP error! status: ${resp_w.status}`);
            const w_data = await resp_w.json();
            console.log(`--- WORKFLOW ${wid} START ---`);
            console.log(JSON.stringify(w_data, null, 2));
            console.log(`--- WORKFLOW ${wid} END ---`);
            fs.writeFileSync(`active_workflow_${wid}.json`, JSON.stringify(w_data, null, 2));
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
