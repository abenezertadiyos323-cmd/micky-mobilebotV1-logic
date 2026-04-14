const fs = require('fs');
const wf = JSON.parse(fs.readFileSync('live_workflow.json', 'utf8'));

const reply = wf.nodes.find(n => n.name === 'Reply AI');
let body = reply.parameters.jsonBody;

// Fix 1: Remove "Shop Now" button mention
body = body.replace(
  /- If resolver_output\.result_mode is 'no_products' or the phone is out of stock, politely apologize and tell the customer to tap the Shop Now button below this chat to see the full list of available phones and accessories\./g,
  "- If resolver_output.result_mode is 'no_products' or the phone is out of stock, politely apologize and tell them we don't have it right now. DO NOT mention any 'Shop Now' button."
);

// Fix 2: Force it to list products instead of asking for clarification
body = body.replace(
  /- If resolver_output has multiple products \(e\.g\. different storage sizes\), DO NOT ask the customer to choose first\. Immediately list all available options and their prices in a clean way so they can see everything at once\./g,
  "- If resolver_output has multiple products (even completely different phones), YOU MUST list EVERY single option and its exact price immediately. NEVER ask the customer to clarify what brand or model they want if you already received products."
);

// Fix 3: Force line gaps for readability
body = body.replace(
  /- STRICT FORMATTING: Join short answers \(1-2 lines\) into a SINGLE paragraph with no blank lines\. Use ONE blank line to separate paragraphs ONLY when your response has 3 or more distinct ideas\. NEVER start a message with an empty line\./g,
  "- STRICT FORMATTING: Use DOUBLE LINE BREAKS (\\n\\n) between every distinct product or idea so there is a clear visible gap! Join short answers (1-2 sentences) into a single line. NEVER start a message with an empty line."
);

reply.parameters.jsonBody = body;
fs.writeFileSync('live_workflow.json', JSON.stringify(wf, null, 2));
console.log('Fixed Reply AI Prompt');
