const fs = require('fs');
let raw = fs.readFileSync('workflow.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const wf = JSON.parse(raw);

// Print credentials for ALL Telegram nodes
console.log('=== TELEGRAM NODE CREDENTIALS ===\n');
wf.nodes
  .filter(n => n.type === 'n8n-nodes-base.telegram' || n.type === 'n8n-nodes-base.telegramTrigger')
  .forEach(n => {
    console.log(`Node: "${n.name}"`);
    console.log(`  Type: ${n.type}`);
    console.log(`  Credential: ${JSON.stringify(n.credentials?.telegramApi ?? 'NOT SET')}`);
    console.log('');
  });
