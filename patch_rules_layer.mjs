import fs from 'fs';

const filePath = 'workflow.json';
const wStr = fs.readFileSync(filePath, 'utf8');
const w = JSON.parse(wStr);

const rulesNode = w.nodes.find(n => n.name === 'Rules Layer');
if (!rulesNode) {
    throw new Error('Rules Layer node not found!');
}

const newJsCode = `const input = $json ?? {};

const messageFunction = input.understanding_output?.message_function ?? 'off_topic';
const confidence = typeof input.understanding_output?.confidence === 'number' ? input.understanding_output.confidence : 0;
const ambiguity = typeof input.understanding_output?.ambiguity === 'number' ? input.understanding_output.ambiguity : 0;

let should_call_resolver = false;
let reply_mode = 'small_talk_redirect';
let next_action = 'redirect_to_business';
let handoff_needed = false;

// Base Mapping
if (messageFunction === 'acknowledgment') {
  reply_mode = 'small_talk_redirect';
  should_call_resolver = false;
  next_action = 'greet_or_redirect';
} else if (messageFunction === 'info_request') {
  reply_mode = 'business_resolve';
  should_call_resolver = true;
  next_action = 'provide_info';
} else if (messageFunction === 'negotiation') {
  reply_mode = 'business_resolve';
  should_call_resolver = true;
  next_action = 'handle_negotiation';
} else if (messageFunction === 'refinement' || messageFunction === 'fresh_request') {
  reply_mode = 'business_resolve';
  should_call_resolver = true;
  next_action = 'process_request';
} else {
  reply_mode = 'small_talk_redirect';
  should_call_resolver = false;
  next_action = 'redirect_to_business';
}

// Guard Fallback Rule
// Assuming high ambiguity is > 0.5 and low confidence is < 0.5 based on typical thresholds
if ((ambiguity > 0.5 && confidence < 0.5) || messageFunction === 'clarification') {
  reply_mode = 'clarify_reference';
  should_call_resolver = false;
  next_action = 'ask_clarification';
}

// Handoff Rule
// Strict threshold provided in LOCKED DOC
if (confidence < 0.3 && ambiguity > 0.8) {
  handoff_needed = true;
  reply_mode = 'handoff_admin';
  should_call_resolver = false;
  next_action = 'escalate_to_human';
}

const rules_output = {
  should_call_resolver,
  reply_mode,
  handoff_needed,
  next_action,
  confidence
};

return [{
  json: {
    ...input,
    rules_output
  }
}];`;

rulesNode.parameters.jsCode = newJsCode;

fs.writeFileSync(filePath, JSON.stringify(w, null, 2));
console.log('patched successfully');
