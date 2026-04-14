import fs from 'fs';

const filePath = 'workflow.json';
const wStr = fs.readFileSync(filePath, 'utf8');
const w = JSON.parse(wStr);

// Check if node already exists
let noResolverNode = w.nodes.find(n => n.name === 'Set No-Resolver Output');

let issueFound = false;
let nodeAddedOrUpdated = true;

if (!noResolverNode) {
    issueFound = true; // Implicitly, as Reply AI currently receives directly from IF false branch
    // 1. Create the new node
    noResolverNode = {
        parameters: {
            jsCode: "const input = $json ?? {};\n\nreturn [{\n  json: {\n    ...input,\n    resolver_output: null\n  }\n}];"
        },
        id: "set-no-resolver-output-" + Date.now(),
        name: "Set No-Resolver Output",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [2500, 500] // Rough placement near Reply AI / Product Search
    };
    w.nodes.push(noResolverNode);
    
    // 2. Fix the connections
    const ifConns = w.connections['Should Resolve']?.main ?? [];
    
    // The IF node "false" branch is typically index 1
    // Let's find existing connection to Reply AI in index 1
    if (ifConns[1]) {
        // Remove Reply AI from false branch
        ifConns[1] = ifConns[1].filter(c => c.node !== 'Reply AI');
        // Add new node to false branch
        ifConns[1].push({
            node: "Set No-Resolver Output",
            type: "main",
            index: 0
        });
    }
    
    // Wire new node to Reply AI
    if (!w.connections['Set No-Resolver Output']) {
        w.connections['Set No-Resolver Output'] = {
            main: [
                [
                    {
                        node: "Reply AI",
                        type: "main",
                        index: 0
                    }
                ]
            ]
        };
    }
    
} else {
    // Just update the code just in case
    noResolverNode.parameters.jsCode = "const input = $json ?? {};\n\nreturn [{\n  json: {\n    ...input,\n    resolver_output: null\n  }\n}];";
}

fs.writeFileSync(filePath, JSON.stringify(w, null, 2));

console.log(JSON.stringify({ issueFound, nodeAddedOrUpdated }));
