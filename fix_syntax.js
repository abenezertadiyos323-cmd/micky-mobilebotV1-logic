const fs = require('fs');

const wfString = fs.readFileSync('live_workflow.json', 'utf8');
const wf = JSON.parse(wfString);

const ua = wf.nodes.find(n => n.name === 'Understanding AI');
let body = ua.parameters.jsonBody;

// Extract the exact broken chunk that contains the literal newlines instead of '\n'
// We replace the literal newlines with proper escaped '\n'
body = body.replace(/13\. STRUCTURED CONSTRAINT EXTRACTION([\s\S]*?)### MESSAGE FUNCTION DEFINITIONS/g, (match) => {
    // Replace all literal carriage returns and newlines with the string "\n"
    return match.replace(/\r?\n/g, '\\n');
});

ua.parameters.jsonBody = body;

fs.writeFileSync('live_workflow.json', JSON.stringify(wf, null, 2));
console.log('Fixed syntax error in live_workflow.json');
