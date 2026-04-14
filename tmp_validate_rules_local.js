const fs = require('fs');

const raw = fs.readFileSync('workflow.json', 'utf8');
const w = JSON.parse(raw);
const rulesNode = w.nodes.find(n => n.name === 'Rules Layer');
const code = rulesNode.parameters.jsCode;

let pass = true;
const errors = [];

// Static Code Analysis
if (!code.includes('handoff_needed')) { errors.push("Missing handoff_needed in string."); pass = false; }
if (!code.includes('next_action')) { errors.push("Missing next_action in string."); pass = false; }
if (code.includes('resolver_input')) { errors.push("Contains illicit resolver_input."); pass = false; }
if (code.includes('session_update')) { errors.push("Contains illicit session_update."); pass = false; }
if (code.includes('reasoning')) { errors.push("Contains illicit reasoning."); pass = false; }
if (code.includes('extractModelFromText')) { errors.push("Contains illicit regex logic."); pass = false; }
if (code.includes('resolveProductById')) { errors.push("Contains illicit product logic."); pass = false; }

// Dynamic Execution Sandbox
const runTest = (message_function) => {
    // We mock the n8n environment
    const sandbox = {
        $json: {
            understanding_output: { message_function, confidence: 0.8, ambiguity: 0.1 }
        }
    };
    
    // We make a function from the code
    const fn = new Function('$json', code);
    return fn(sandbox.$json)[0].json.rules_output;
};

try {
    const test1 = runTest('info_request');
    if (test1.should_call_resolver !== true) {
        errors.push("Test 1 Failed: 'info_request' did not set should_call_resolver to true.");
        pass = false;
    }
    
    const test2 = runTest('acknowledgment');
    if (test2.should_call_resolver !== false) {
        errors.push("Test 2 Failed: 'acknowledgment' did not set should_call_resolver to false.");
        pass = false;
    }
    
    // Verify output structure explicitly
    const outputKeys = Object.keys(test1).sort();
    const expectedKeys = ['should_call_resolver', 'reply_mode', 'handoff_needed', 'next_action', 'confidence'].sort();
    if (JSON.stringify(outputKeys) !== JSON.stringify(expectedKeys)) {
        errors.push("Output structure does not match EXACT 5 fields expected.");
        pass = false;
    }
} catch(e) {
    errors.push("Execution error during dynamic tests: " + e.message);
    pass = false;
}

if(pass) {
    console.log("VALIDATION RESULT: PASS");
} else {
    console.log("VALIDATION RESULT: FAIL");
    console.error(errors.join('\n'));
}
