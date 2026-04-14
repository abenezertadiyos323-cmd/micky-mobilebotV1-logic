
const fs = require('fs');
const path = require('path');

// ── Load workflow ──────────────────────────────────────────────────────────────
const wfPath = path.join(__dirname, 'workflow.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

// ── Backup ─────────────────────────────────────────────────────────────────────
const backupPath = path.join(__dirname, 'backups', `workflow_pre_merge_${Date.now()}.json`);
fs.mkdirSync(path.join(__dirname, 'backups'), { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(wf, null, 2), 'utf8');
console.log('✅ Backup written:', backupPath);

// ── Guard: verify required nodes exist ────────────────────────────────────────
const GUARD_NAME   = 'Understanding JSON Guard - Pure Validator';
const SB_NAME      = 'Session Bootstrap';
const RULES_NAME   = 'Rules Layer';
const MERGE_NAME   = 'Merge Node';

const guardNode = wf.nodes.find(n => n.name === GUARD_NAME);
const sbNode    = wf.nodes.find(n => n.name === SB_NAME);
const rulesNode = wf.nodes.find(n => n.name === RULES_NAME);

if (!guardNode) throw new Error('ABORT: Guard node not found: ' + GUARD_NAME);
if (!sbNode)    throw new Error('ABORT: Session Bootstrap not found');
if (!rulesNode) throw new Error('ABORT: Rules Layer not found');

// ── Guard: Merge Node must not already exist ───────────────────────────────────
if (wf.nodes.find(n => n.name === MERGE_NAME)) {
  throw new Error('ABORT: Merge Node already exists in workflow. Halting to prevent duplication.');
}

console.log('✅ Pre-checks passed. All required nodes present, Merge Node absent.');

// ── Position: place Merge Node between Guard and Rules Layer ───────────────────
// Guard: [1520, 300], Rules: [1760, 300] → Merge at [1640, 300]
// Push Rules Layer and everything beyond it to the right (+260)
const MERGE_X = 1640;
const MERGE_Y = 300;
const RULES_OLD_X = rulesNode.position[0]; // 1760

// Shift nodes that are at or beyond the old Rules Layer X position
wf.nodes.forEach(n => {
  if (n.position[0] >= RULES_OLD_X) {
    n.position[0] += 260;
  }
});
console.log('✅ Shifted downstream nodes right by 260px to make room.');

// ── Build the Merge Node ───────────────────────────────────────────────────────
const mergeNodeCode = `const inputs = $input.all();

if (inputs.length < 2) {
  throw new Error('Merge node missing required inputs');
}

const base = inputs[0].json;
const guard = inputs[1].json;

if (!base || !guard) {
  throw new Error('Merge node received invalid inputs');
}

return [{
  json: {
    event: base.event,
    session: base.session,
    client_config: base.client_config,
    understanding_output: guard.understanding_output,
    understanding_meta: guard.understanding_meta || {
      valid: false,
      fallback_applied: true,
      issues: ['missing_meta']
    }
  }
}];`;

const mergeNode = {
  id: 'merge-node',
  name: MERGE_NAME,
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [MERGE_X, MERGE_Y],
  parameters: {
    numberInputs: 2,
    jsCode: mergeNodeCode
  }
};

wf.nodes.push(mergeNode);
console.log('✅ Merge Node added to nodes array.');

// ── Update connections ─────────────────────────────────────────────────────────

// 1. REMOVE: Understanding JSON Guard - Pure Validator → Rules Layer
const guardConns = wf.connections[GUARD_NAME];
if (!guardConns || !guardConns.main || !guardConns.main[0]) {
  throw new Error('ABORT: Guard node has no output connections to modify');
}
const beforeRemove = guardConns.main[0].length;
guardConns.main[0] = guardConns.main[0].filter(t => t.node !== RULES_NAME);
const afterRemove = guardConns.main[0].length;
if (beforeRemove === afterRemove) {
  throw new Error('ABORT: Expected to remove Guard→Rules connection but it was not found');
}
console.log(`✅ Removed connection: ${GUARD_NAME} → ${RULES_NAME}`);

// 2. ADD: Understanding JSON Guard → Merge Node (input index 1)
guardConns.main[0].push({ node: MERGE_NAME, type: 'main', index: 1 });
console.log(`✅ Added connection: ${GUARD_NAME} → ${MERGE_NAME} [input 1]`);

// 3. ADD: Session Bootstrap → Merge Node (input index 0)
if (!wf.connections[SB_NAME]) {
  wf.connections[SB_NAME] = { main: [[]] };
}
if (!wf.connections[SB_NAME].main[0]) {
  wf.connections[SB_NAME].main[0] = [];
}
// Prevent duplicate
const sbAlreadyConnected = wf.connections[SB_NAME].main[0].some(t => t.node === MERGE_NAME && t.index === 0);
if (!sbAlreadyConnected) {
  wf.connections[SB_NAME].main[0].push({ node: MERGE_NAME, type: 'main', index: 0 });
  console.log(`✅ Added connection: ${SB_NAME} → ${MERGE_NAME} [input 0]`);
} else {
  console.log(`⚠️  Connection ${SB_NAME} → ${MERGE_NAME} already existed (skipped)`);
}

// 4. ADD: Merge Node → Rules Layer (output 0 → input 0)
if (!wf.connections[MERGE_NAME]) {
  wf.connections[MERGE_NAME] = { main: [[]] };
}
wf.connections[MERGE_NAME].main[0].push({ node: RULES_NAME, type: 'main', index: 0 });
console.log(`✅ Added connection: ${MERGE_NAME} → ${RULES_NAME} [input 0]`);

// ── Verification ───────────────────────────────────────────────────────────────
console.log('\n── POST-PATCH VERIFICATION ──');

const mergeExists = wf.nodes.find(n => n.name === MERGE_NAME);
console.log('Merge Node in nodes:', !!mergeExists);

const sbToMerge = wf.connections[SB_NAME].main[0].some(t => t.node === MERGE_NAME && t.index === 0);
console.log('Session Bootstrap → Merge Node [0]:', sbToMerge);

const guardToMerge = wf.connections[GUARD_NAME].main[0].some(t => t.node === MERGE_NAME && t.index === 1);
console.log('Guard → Merge Node [1]:', guardToMerge);

const mergeToRules = wf.connections[MERGE_NAME] && wf.connections[MERGE_NAME].main[0].some(t => t.node === RULES_NAME);
console.log('Merge Node → Rules Layer:', mergeToRules);

const guardToRulesStillExists = wf.connections[GUARD_NAME].main[0].some(t => t.node === RULES_NAME);
console.log('Guard → Rules Layer (should be false):', guardToRulesStillExists);

if (!mergeExists || !sbToMerge || !guardToMerge || !mergeToRules || guardToRulesStillExists) {
  throw new Error('ABORT: Post-patch verification FAILED. workflow.json NOT saved.');
}

console.log('\n✅ All verifications passed.');

// ── Save ───────────────────────────────────────────────────────────────────────
fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2), 'utf8');
console.log('✅ workflow.json saved successfully.');
console.log('\n── SUMMARY ──');
console.log('  Node added   : Merge Node (Code, typeVersion 2, numberInputs: 2)');
console.log('  Position     : [' + MERGE_X + ', ' + MERGE_Y + ']');
console.log('  Input 0      : Session Bootstrap');
console.log('  Input 1      : Understanding JSON Guard - Pure Validator');
console.log('  Output 0     : Rules Layer');
console.log('  Removed conn : Guard → Rules Layer');
