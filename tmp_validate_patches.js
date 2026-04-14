const fs = require('fs');
let raw = fs.readFileSync('workflow.json', 'utf8');
// Strip UTF-8 BOM if present
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const wf = JSON.parse(raw);

const checks = {
  fix1_result_mode_info: false,
  fix1_direct_answer: false,
  fix1_old_code_removed: true, // will set false if old pattern still exists
  fix2_raw_safe_to_send: false,
  fix2_effective_reply_text: false,
  fix2_safe_to_send_true: false,
  fix2_fallback_text: false,
  fix3_hasAnchoredContext: false,
  fix3_anchored_reasoning: false,
  fix4_node_admin_handoff_notify: false,
  fix4_node_admin_handoff_send: false,
  fix4_connection_rules_to_handoff: false,
};

const nodeMap = {};
wf.nodes.forEach(n => { nodeMap[n.name] = n; });

// FIX 1 — Business Data Resolver
const bdr = nodeMap['Business Data Resolver'];
if (bdr) {
  const code = bdr.parameters?.jsCode ?? '';
  checks.fix1_result_mode_info = code.includes("result_mode = 'info'");
  checks.fix1_direct_answer = code.includes("next_step = 'direct_answer'");
  // Precisely check the info/support block does NOT contain ask_clarification
  // by extracting the block between the info/support condition and the next else if
  const infoIdx = code.indexOf("resolverInput.flow === 'info'");
  const nextElse = code.indexOf('} else if (selectedProduct)', infoIdx);
  const infoBlock = infoIdx !== -1 && nextElse !== -1 ? code.slice(infoIdx, nextElse) : '';
  checks.fix1_old_code_removed = infoBlock.length > 0 && !infoBlock.includes("'ask_clarification'");
}

// FIX 2 — Validation
const val = nodeMap['Validation'];
if (val) {
  const code = val.parameters?.jsCode ?? '';
  checks.fix2_raw_safe_to_send = code.includes('raw_safe_to_send');
  checks.fix2_effective_reply_text = code.includes('effective_reply_text');
  checks.fix2_fallback_text = code.includes('fallback_reply_text');
  checks.fix2_safe_to_send_true = code.includes('safe_to_send: true');
}

// FIX 3 — Rules Layer
const rl = nodeMap['Rules Layer'];
if (rl) {
  const code = rl.parameters?.jsCode ?? '';
  checks.fix3_hasAnchoredContext = code.includes('hasAnchoredContext');
  checks.fix3_anchored_reasoning = code.includes('negotiation_anchored_to_existing_interest');
}

// FIX 4 — New nodes
checks.fix4_node_admin_handoff_notify = Boolean(nodeMap['Admin Handoff Notify?']);
checks.fix4_node_admin_handoff_send = Boolean(nodeMap['Admin Handoff Telegram Send']);

// FIX 4 — Connection check
const rlConnections = wf.connections?.['Rules Layer']?.main?.[0] ?? [];
checks.fix4_connection_rules_to_handoff = rlConnections.some(c => c.node === 'Admin Handoff Notify?');

// Print report
console.log('\n══════════════════════════════════════════');
console.log('  CODEX PATCH VALIDATION REPORT');
console.log('══════════════════════════════════════════\n');

const pass = '✅ PASS';
const fail = '❌ FAIL';

console.log('FIX 1 — Business Data Resolver');
console.log(`  result_mode = 'info' added:          ${checks.fix1_result_mode_info ? pass : fail}`);
console.log(`  next_step = 'direct_answer' added:   ${checks.fix1_direct_answer ? pass : fail}`);
console.log(`  Old ask_clarification removed:        ${checks.fix1_old_code_removed ? pass : fail}`);

console.log('\nFIX 2 — Validation');
console.log(`  raw_safe_to_send declared:            ${checks.fix2_raw_safe_to_send ? pass : fail}`);
console.log(`  effective_reply_text declared:        ${checks.fix2_effective_reply_text ? pass : fail}`);
console.log(`  fallback_reply_text declared:         ${checks.fix2_fallback_text ? pass : fail}`);
console.log(`  safe_to_send: true in return:         ${checks.fix2_safe_to_send_true ? pass : fail}`);

console.log('\nFIX 3 — Rules Layer (Negotiation Anchor)');
console.log(`  hasAnchoredContext declared:          ${checks.fix3_hasAnchoredContext ? pass : fail}`);
console.log(`  Anchored reasoning string present:    ${checks.fix3_anchored_reasoning ? pass : fail}`);

console.log('\nFIX 4 — Admin Handoff Nodes & Connection');
console.log(`  "Admin Handoff Notify?" node exists:  ${checks.fix4_node_admin_handoff_notify ? pass : fail}`);
console.log(`  "Admin Handoff Telegram Send" exists:  ${checks.fix4_node_admin_handoff_send ? pass : fail}`);
console.log(`  Rules Layer → Admin Handoff wired:    ${checks.fix4_connection_rules_to_handoff ? pass : fail}`);

const allPassed = Object.values(checks).every(Boolean);
console.log('\n══════════════════════════════════════════');
console.log(`  OVERALL: ${allPassed ? '✅ ALL PATCHES APPLIED CORRECTLY' : '❌ PATCHES MISSING OR INCOMPLETE'}`);
console.log('══════════════════════════════════════════\n');

// Extra: list current Rules Layer port-0 connections
console.log('Rules Layer port-0 connections:');
rlConnections.forEach(c => console.log('  →', c.node));
