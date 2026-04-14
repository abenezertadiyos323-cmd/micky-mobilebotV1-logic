const input = $json ?? {};
const convex = input.convex_response;

// Detect malformed or missing Convex response
const isInvalidConvex =
  !convex ||
  typeof convex !== 'object' ||
  Array.isArray(convex) ||
  (!convex.result_mode && !convex.products && !convex.metadata);

// Strict error handling
if (isInvalidConvex || convex.error || input.error) {
  return [{
    json: {
      event: input.event,
      client_config: input.client_config,
      rules_output: input.rules_output,
      understanding_output: input.understanding_output,
      session: input.session,
      resolver_output: {
        result_mode: "error",
        products: [],
        metadata: {
          error_source: "convex"
        },
        missing_fields: [],
        source: "convex"
      }
    }
  }];
}

// Normal mapping (valid Convex response)
const resolver_output = {
  result_mode: convex.result_mode ?? 'found',
  products: convex.products ?? [],
  metadata: convex.metadata ?? {},
  missing_fields: convex.missing_fields ?? [],
  source: 'convex'
};

return [{
  json: {
    event: input.event,
    client_config: input.client_config,
    rules_output: input.rules_output,
    understanding_output: input.understanding_output,
    session: input.session,
    resolver_output
  }
}];