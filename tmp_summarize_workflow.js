const fs = require('fs');

try {
    const rawData = fs.readFileSync('workflow.json', 'utf8');
    const workflow = JSON.parse(rawData);

    // 1. Node List
    console.log("=== FULL NODE LIST ===");
    workflow.nodes.forEach(n => {
        console.log(`- Name: ${n.name}`);
        console.log(`  Type: ${n.type}`);
        // let's grab a small hint of what it does based on type or notes
        let desc = n.notes || "No notes.";
        console.log(`  Notes: ${desc}`);
    });

    console.log("\n=== CODE EXTRACTS FOR DATA CONTRACTS ===");
    
    const targetNodes = [
        "Understanding AI",
        "Understanding JSON Guard",
        "Rules Layer",
        "Business Data Resolver",
        "Reply AI",
        "Session Bootstrap",
        "Validation"
    ];

    workflow.nodes.filter(n => targetNodes.includes(n.name)).forEach(n => {
        console.log(`\n--- ${n.name} ---`);
        if (n.parameters && n.parameters.options && n.parameters.options.systemMessage) {
            console.log("System Message schema/instructions:");
            console.log(n.parameters.options.systemMessage.substring(0, 1000) + "...");
        }
        if (n.parameters && n.parameters.jsCode) {
            console.log("JS Code Extract:");
            // print first ~30 lines
            const lines = n.parameters.jsCode.split('\n');
            console.log(lines.slice(0, 40).join('\n'));
        }
        if (n.parameters && n.parameters.prompt) {
            console.log("Prompt schema/instructions:");
            console.log(n.parameters.prompt.substring(0, 1000) + "...");
        }
        if (n.parameters && n.parameters.text) {
            console.log("Text parameter:");
            console.log(n.parameters.text);
        }
    });

    console.log("\n=== CONNECTIONS & FLOW PATHS ===");
    for (const [sourceName, connectionsByType] of Object.entries(workflow.connections)) {
        for (const [type, typeConnections] of Object.entries(connectionsByType)) {
            typeConnections.forEach((connList, index) => {
                connList.forEach(conn => {
                    console.log(`[${sourceName}] --(${type}, port ${index})--> [${conn.node}]`);
                });
            });
        }
    }

} catch (err) {
    console.error(err);
}
