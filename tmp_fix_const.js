const fs = require('fs');
let raw = fs.readFileSync('workflow.json', 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const wf = JSON.parse(raw);

const bdr = wf.nodes.find(n => n.name === 'Business Data Resolver');
if (!bdr) { console.error('BDR node not found'); process.exit(1); }

const original = bdr.parameters.jsCode;

// Change: const result_mode = ... → let result_mode = ...
const oldDecl = "const result_mode = remoteProducts.length > 0 ? 'products_found' : 'no_products';";
const newDecl = "let result_mode = remoteProducts.length > 0 ? 'products_found' : 'no_products';";

if (!original.includes(oldDecl)) {
  console.error('Target line not found — check exact string');
  console.log('Searching for partial...');
  const lines = original.split('\n');
  lines.forEach((l, i) => { if (l.includes('result_mode')) console.log(i+1, ':', l); });
  process.exit(1);
}

const patched = original.replace(oldDecl, newDecl);
bdr.parameters.jsCode = patched;

// Verify
const lines = patched.split('\n');
lines.forEach((l, i) => { if (l.includes('result_mode')) console.log(`Line ${i+1}: ${l}`); });

fs.writeFileSync('workflow.json', '\uFEFF' + JSON.stringify(wf, null, 2), 'utf8');
console.log('\n✅ Fixed: result_mode changed from const to let');
