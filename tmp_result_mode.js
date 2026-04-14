const fs = require('fs');
let raw = fs.readFileSync('workflow.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const wf = JSON.parse(raw);

const bdr = wf.nodes.find(n => n.name === 'Business Data Resolver');
const code = bdr?.parameters?.jsCode ?? '';

// Find how result_mode is declared
const lines = code.split('\n');
lines.forEach((line, i) => {
  if (line.includes('result_mode')) {
    console.log(`Line ${i + 1}: ${line}`);
  }
});
