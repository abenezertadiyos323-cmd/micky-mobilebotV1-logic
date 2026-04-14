const fs = require('fs');

const w = JSON.parse(fs.readFileSync('live_workflow.json', 'utf8'));
const conns = w.connections || {};

const getConnectionTargets = (nodeName) => {
    const c = conns[nodeName]?.main || [];
    const targets = [];
    c.forEach((branch, index) => {
        const type = index === 0 ? 'TRUE (0)' : index === 1 ? 'FALSE (1)' : index.toString();
        if (branch) {
            branch.forEach(out => {
                targets.push(`branch ${type} -> ${out.node}`);
            });
        }
    });
    return targets;
};

const getIncoming = (nodeName) => {
    const incoming = [];
    for (const [src, c] of Object.entries(conns)) {
        if (!c.main) continue;
        c.main.forEach(branch => {
            if (branch) {
                branch.forEach(out => {
                    if (out.node === nodeName) {
                        incoming.push(src);
                    }
                });
            }
        });
    }
    return incoming;
};

const status = {
    "Rules Layer Outgoing": getConnectionTargets('Rules Layer'),
    "Should Resolve Outgoing": getConnectionTargets('Should Resolve'),
    "Set No-Resolver Output Outgoing": getConnectionTargets('Set No-Resolver Output'),
    "Product Search Outgoing": getConnectionTargets('Product Search (Convex Test)'),
    "Business Data Resolver Outgoing": getConnectionTargets('Business Data Resolver'),
    "Reply AI Incoming": getIncoming('Reply AI')
};

console.log("=== 1. LIVE BEFORE FIX ===");
console.log(JSON.stringify(status, null, 2));

// -------------------------------------------------------------------------------- //
// APPLY FIXES TO IN-MEMORY OBJECT
// -------------------------------------------------------------------------------- //
const changes = [];

// Clean up Should Resolve Outgoing connections
// TRUE (0) must ONLY connect to "Product Search (Convex Test)"
// FALSE (1) must ONLY connect to "Set No-Resolver Output"
if (!conns['Should Resolve']) conns['Should Resolve'] = { main: [[], []] };
if (!conns['Should Resolve'].main[0]) conns['Should Resolve'].main[0] = [];
if (!conns['Should Resolve'].main[1]) conns['Should Resolve'].main[1] = [];

// Overwrite Should Resolve branch 0 to point strictly to Product Search
const currentTrue = conns['Should Resolve'].main[0];
const hasProductSearch = currentTrue.some(c => c.node === 'Product Search (Convex Test)');
if (!hasProductSearch || currentTrue.length !== 1) {
    conns['Should Resolve'].main[0] = [{
        node: "Product Search (Convex Test)",
        type: "main",
        index: 0
    }];
    changes.push("Wired Should Resolve TRUE strictly to Product Search (Convex Test)");
}

// Overwrite Should Resolve branch 1 to point strictly to Set No-Resolver Output
const currentFalse = conns['Should Resolve'].main[1];
const hasNoResolver = currentFalse.some(c => c.node === 'Set No-Resolver Output');

// Also remove Product Search from FALSE branch if it accidentally went there
if (currentFalse.some(c => c.node === 'Product Search (Convex Test)')) {
    changes.push("Removed forbidden connection: Should Resolve FALSE -> Product Search (Convex Test)");
}

if (!hasNoResolver || currentFalse.length !== 1) {
    conns['Should Resolve'].main[1] = [{
        node: "Set No-Resolver Output",
        type: "main",
        index: 0
    }];
    changes.push("Wired Should Resolve FALSE strictly to Set No-Resolver Output");
}

// Ensure Set No-Resolver Output feeds exactly into Reply AI
if (!conns['Set No-Resolver Output']) conns['Set No-Resolver Output'] = { main: [[]] };
if (!conns['Set No-Resolver Output'].main[0]) conns['Set No-Resolver Output'].main[0] = [];

const currentNoRslvOut = conns['Set No-Resolver Output'].main[0];
if (!currentNoRslvOut.some(c => c.node === 'Reply AI') || currentNoRslvOut.length !== 1) {
    conns['Set No-Resolver Output'].main[0] = [{
        node: "Reply AI",
        type: "main",
        index: 0
    }];
    changes.push("Wired Set No-Resolver Output strictly to Reply AI");
}

console.log("=== 2. CHANGES APPLIED ===");
changes.forEach(c => console.log("- " + c));

const statusAfter = {
    "Rules Layer Outgoing": getConnectionTargets('Rules Layer'),
    "Should Resolve Outgoing": getConnectionTargets('Should Resolve'),
    "Set No-Resolver Output Outgoing": getConnectionTargets('Set No-Resolver Output'),
    "Reply AI Incoming": getIncoming('Reply AI')
};

console.log("=== 3. VALIDATION AFTER FIX ===");
console.log(JSON.stringify(statusAfter, null, 2));

w.connections = conns;
fs.writeFileSync('live_workflow_fixed.json', JSON.stringify(w, null, 2));
