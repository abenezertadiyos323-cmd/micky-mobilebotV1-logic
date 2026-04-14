const fs = require('fs');

// Read PROMPT.md system prompt
const promptMd = fs.readFileSync('docs/abenier/understanding/PROMPT.md', 'utf8');
const promptMatch = promptMd.match(/## Prompt\n([\s\S]+)/);
if (!promptMatch) { console.error('ERROR: Could not find ## Prompt section'); process.exit(1); }
const newSystemPrompt = promptMatch[1].trim();
console.log('System prompt length:', newSystemPrompt.length);

// Read workflow.json as RAW STRING — do NOT JSON.parse, work with the raw file bytes
const rawWorkflow = fs.readFileSync('workflow.json', 'utf8');

// Find the Understanding AI node block — locate "name": "Understanding AI"
// Then find jsonBody within that, and replace messages[0].content in place.

// The raw file has the jsonBody value stored as a JSON string,
// so content appears with double-escaped sequences like \\n, \"
// The system content marker in the raw file will be:
//   content: \"You are a neutral...\"
// But in the raw JSON file it's stored as: content: \\\"You are...\\\"
// Let's just check what's actually in the raw file around the system content

const rawIdx = rawWorkflow.indexOf('"Understanding AI"');
if (rawIdx === -1) { console.error('Node not found in raw'); process.exit(1); }
console.log('Node found at raw index:', rawIdx);

// Show what the jsonBody section looks like in the raw file
const bodyIdx = rawWorkflow.indexOf('"jsonBody"', rawIdx);
console.log('jsonBody at raw index:', bodyIdx);
console.log('Raw chars at jsonBody (first 600):', rawWorkflow.substring(bodyIdx, bodyIdx + 600));
