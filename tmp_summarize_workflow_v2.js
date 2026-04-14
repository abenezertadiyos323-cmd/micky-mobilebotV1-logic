const fs = require('fs');

const workflowPath = 'd:\\Abenier\\Abenier Bot Logic\\workflow.json';
const workflowStr = fs.readFileSync(workflowPath, 'utf8');
const workflow = JSON.parse(workflowStr);

const nodes = workflow.nodes || [];
const connections = workflow.connections || {};

let output = '';

output += "==================================================\n";
output += "NODE LIST\n";
output += "==================================================\n";
nodes.forEach(n => {
    output += `- ${n.name} (${n.type})\n`;
});

output += "\n==================================================\n";
output += "CONNECTIONS\n";
output += "==================================================\n";
for (const [source, targets] of Object.entries(connections)) {
    for (const [outputIndex, targetList] of Object.entries(targets)) {
        targetList.forEach(t => {
            output += `[${source}] -> [${t.node}] (output ${outputIndex} -> input ${t.index || t.type})\n`;
        });
    }
}

const keyNodes = [
    'Event Normalizer',
    'Session Load',
    'Session Bootstrap',
    'Callback Action?',
    'Understanding AI',
    'Understanding JSON Guard',
    'Merge Node',
    'Rules Layer',
    'Should Resolve?',
    'Product Search',
    'Business Data Resolver',
    'Reply AI',
    'Prepare Keyboard',
    'Validation',
    'Safe To Send',
    'Telegram Send',
    'Session Save',
    'Memory / Intention Update',
    'Callback Action Handler',
    'Confirmed Handoff IF',
    'Admin Notification',
    'Callback Telegram Send',
    'Callback Session Save'
];

output += "\n==================================================\n";
output += "KEY NODE CODES / PROMPTS\n";
output += "==================================================\n";
nodes.forEach(n => {
    let nameToMatch = n.name;
    // try to match with or without exact strings, but let's just check if it contains parts of the key names or is exactly it
    if (keyNodes.some(kn => n.name.includes(kn) || kn.includes(n.name))) {
        output += `\n--- NODE: ${n.name} ---\n`;
        if (n.parameters && n.parameters.jsCode) {
            output += n.parameters.jsCode + "\n";
        } else if (n.parameters && n.parameters.prompt) {
            output += `PROMPT:\n${n.parameters.prompt.value || n.parameters.prompt}\n`;
            if (n.parameters.messages) {
               output += `MESSAGES:\n${JSON.stringify(n.parameters.messages)}\n`;
            }
        } else if (n.parameters && n.parameters.conditions) {
             output += `CONDITIONS:\n${JSON.stringify(n.parameters.conditions, null, 2)}\n`;
        } else if (n.parameters && n.parameters.assignments) {
             output += `ASSIGNMENTS:\n${JSON.stringify(n.parameters.assignments, null, 2)}\n`;
        } else {
            output += "No jsCode or prompt. Parameters: " + Object.keys(n.parameters).join(", ") + "\n";
        }
    }
});

fs.writeFileSync('d:\\Abenier\\Abenier Bot Logic\\tmp_workflow_analysis.txt', output);
console.log('Analysis saved to tmp_workflow_analysis.txt');
