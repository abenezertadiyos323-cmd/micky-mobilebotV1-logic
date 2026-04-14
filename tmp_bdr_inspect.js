const fs = require('fs');
let raw = fs.readFileSync('workflow.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const wf = JSON.parse(raw);

const bdr = wf.nodes.find(n => n.name === 'Business Data Resolver');
const code = bdr?.parameters?.jsCode ?? '';

// Find the exact info/support block
const idx = code.indexOf("resolverInput.flow === 'info'");
if (idx === -1) { console.log('Block not found'); process.exit(1); }

// Print 10 lines around that location
const before = code.lastIndexOf('\n', idx - 1);
const segment = code.substring(before, idx + 400);
console.log('=== EXACT CODE IN FILE ===');
console.log(segment);
