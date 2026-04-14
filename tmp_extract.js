const fs = require('fs');

try {
    const rawData = fs.readFileSync('workflow.json', 'utf8');
    const workflow = JSON.parse(rawData);

    let output = '';

    // 1. Node List
    output += "===== NODES =====\n";
    workflow.nodes.forEach(n => {
        output += `Name: ${n.name} | Type: ${n.type} | Notes: ${n.notes || 'None'}\n`;
    });

    // 2. Extracts for Contracts
    output += "\n===== CONTRACTS =====\n";
    const targetNodes = [
        "Understanding AI",
        "Understanding JSON Guard - Pure Validator",
        "Rules Layer",
        "Business Data Resolver",
        "Reply AI",
        "Session Load",
        "Session Save",
        "Session Bootstrap",
        "Validation"
    ];

    workflow.nodes.filter(n => targetNodes.includes(n.name)).forEach(n => {
        output += `\n--- ${n.name} ---\n`;
        if (n.parameters) {
            if (n.parameters.options && n.parameters.options.systemMessage) {
                output += "SYSTEM MESSAGE:\n";
                output += n.parameters.options.systemMessage + "\n";
            }
            if (n.parameters.jsCode) {
                output += "JS CODE:\n" + n.parameters.jsCode + "\n";
            }
            if (n.parameters.prompt) {
                output += "PROMPT:\n" + n.parameters.prompt + "\n";
            }
            if (n.parameters.mode) {
                output += "MODE: " + n.parameters.mode + "\n";
            }
            if (n.parameters.options && n.parameters.options.jsonOutput) {
                output += "JSON OUTPUT: true\n";
            }
        }
    });

    output += "\n===== ADMIN NOTIFICATIONS =====\n";
    workflow.nodes.filter(n => n.type.includes('Telegram') && n.name.includes('Admin')).forEach(n => {
        output += `\n--- ${n.name} ---\n`;
        if (n.parameters && n.parameters.text) {
             output += "TEXT:\n" + n.parameters.text + "\n";
        }
    });

    fs.writeFileSync('tmp_workflow_dump.txt', output);
    console.log("Done");

} catch (err) {
    console.error(err);
}
