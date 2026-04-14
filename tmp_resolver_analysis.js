const fs = require('fs');

const w = JSON.parse(fs.readFileSync('workflow.json', 'utf8'));

const nodesToExtract = [
    'Should Resolve?',
    'Product Search (Convex Test)',
    'Business Data Resolver',
    'Reply AI'
];

const nodes = Object.fromEntries(nodesToExtract.map(name => [name, w.nodes.find(n => n.name === name)]));

const getIncomingConnections = (nodeName) => {
    const incoming = [];
    for (const [srcNode, connections] of Object.entries(w.connections)) {
        for (const [portType, ports] of Object.entries(connections)) {
            for (const c of ports.flat()) {
                if (c && c.node === nodeName) {
                    incoming.push(`${srcNode} -> (${portType})`);
                }
            }
        }
    }
    return incoming;
};

const getOutgoingConnections = (nodeName) => {
    const outgoing = [];
    const conns = w.connections[nodeName];
    if (conns) {
        for (const [portType, ports] of Object.entries(conns)) {
            let i = 0;
            for (const outputs of ports) {
                if(outputs) {
                    for (const out of outputs) {
                        outgoing.push(`(${portType}[${i}]) -> ${out.node}`);
                    }
                }
                i++;
            }
        }
    }
    return outgoing;
};

const report = {};
for (const [name, node] of Object.entries(nodes)) {
    report[name] = {
        exists: !!node,
        incoming: getIncomingConnections(name),
        outgoing: getOutgoingConnections(name),
        type: node ? node.type : null,
        parameters: node ? node.parameters : null
    };
}

fs.writeFileSync('tmp_resolver_analysis.json', JSON.stringify(report, null, 2));

