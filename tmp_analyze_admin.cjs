const fs = require('fs');
const w = JSON.parse(fs.readFileSync('live_workflow.json', 'utf8'));
const conns = w.connections || {};

const adminSearchTerms = ['Admin', 'Handoff', 'Notify'];

const isAdminNode = (nodeName) => {
    return adminSearchTerms.some(term => nodeName.toLowerCase().includes(term.toLowerCase()));
};

const adminNodes = w.nodes.filter(n => isAdminNode(n.name));

const getIncoming = (nodeName) => {
    const incoming = [];
    for (const [src, c] of Object.entries(conns)) {
        if (!c.main) continue;
        c.main.forEach((branch, index) => {
            if (branch) {
                branch.forEach(out => {
                    if (out.node === nodeName) {
                        incoming.push(`${src}(branch ${index})`);
                    }
                });
            }
        });
    }
    return incoming;
};

const getOutgoing = (nodeName) => {
    const c = conns[nodeName]?.main || [];
    const targets = [];
    c.forEach((branch, index) => {
        if (branch) {
            branch.forEach(out => {
                targets.push(`(branch ${index}) -> ${out.node}`);
            });
        }
    });
    return targets;
};

const results = adminNodes.map(n => {
    const incoming = getIncoming(n.name);
    const outgoing = getOutgoing(n.name);
    
    // Naively checking if it touches main flow.
    // 'Rules Layer' is definitely main flow. 'Callback Action?' might be callback flow.
    const touchesMain = incoming.some(i => i.includes('Rules Layer') || i.includes('Reply AI') || i.includes('Telegram Send'));
    
    return {
        name: n.name,
        type: n.type,
        incoming,
        outgoing,
        touchesMain
    };
});

console.log(JSON.stringify(results, null, 2));
