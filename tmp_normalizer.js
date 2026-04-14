const fs = require('fs');
let raw = fs.readFileSync('workflow.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const wf = JSON.parse(raw);

const normalizer = wf.nodes.find(n => n.name === 'Event Normalizer');
console.log('=== EVENT NORMALIZER CODE ===');
console.log(normalizer?.parameters?.jsCode);
