import fs from 'fs';

const filePath = 'workflow.json';
const wStr = fs.readFileSync(filePath, 'utf8');
const w = JSON.parse(wStr);

const prodSearch = w.nodes.find(n => n.name === 'Product Search (Convex Test)');
const bizResolver = w.nodes.find(n => n.name === 'Business Data Resolver');

if (!prodSearch) throw new Error('Product Search node not found');
if (!bizResolver) throw new Error('Business Data Resolver node not found');

// 1. Rewrite Product Search payload and options
prodSearch.parameters.jsonBody = `={{ JSON.stringify({\n  sellerId: $json.client_config?.store_name ?? 'tedytech',\n  rules_output: $json.rules_output,\n  understanding_output: $json.understanding_output,\n  session: $json.session\n}) }}`;
prodSearch.parameters.options = { ...prodSearch.parameters.options, responsePropertyName: 'convex_response' };

// 2. Rewrite Business Data Resolver
bizResolver.parameters.jsCode = `const input = $json ?? {};
const convex = input.convex_response ?? {};

// Strict error handling
let result_mode = convex.result_mode ?? 'found';

if (convex.error || input.error) {
  result_mode = 'error';
}

// Build strict resolver_output
const resolver_output = {
  result_mode,
  products: convex.products ?? [],
  metadata: convex.metadata ?? {},
  missing_fields: convex.missing_fields ?? [],
  source: 'convex'
};

// Clean output (remove convex_response completely)
return [{
  json: {
    event: input.event,
    client_config: input.client_config,
    rules_output: input.rules_output,
    understanding_output: input.understanding_output,
    session: input.session,
    resolver_output
  }
}];`;

fs.writeFileSync(filePath, JSON.stringify(w, null, 2));
console.log('Resolver nodes patched successfully!');
