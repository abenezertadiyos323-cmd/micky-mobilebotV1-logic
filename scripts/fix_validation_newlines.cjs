const fs = require('fs');

const path = 'workflow.json';
const workflow = JSON.parse(fs.readFileSync(path, 'utf8'));
const validationNode = workflow.nodes.find((node) => node.name === 'Validation');

if (!validationNode) {
  throw new Error('Validation node not found');
}

let code = validationNode.parameters.jsCode;

const replacements = [
  [
    `const valid = blockingIssues.length === 0;
const safe_to_send = Boolean(reply_text) && blockingIssues.length === 0;
const now = Date.now();
const isStartReset = event.event_type === 'start_reset';
const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];`,
    `const valid = blockingIssues.length === 0;
const safe_to_send = Boolean(reply_text) && blockingIssues.length === 0;
const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];`,
  ],
];

for (const [oldStr, newStr] of replacements) {
  if (!code.includes(oldStr)) {
    throw new Error(`Missing replacement target: ${oldStr.slice(0, 80)}`);
  }
  code = code.replaceAll(oldStr, newStr);
}

validationNode.parameters.jsCode = code;
fs.writeFileSync(path, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
console.log('workflow.json updated');
