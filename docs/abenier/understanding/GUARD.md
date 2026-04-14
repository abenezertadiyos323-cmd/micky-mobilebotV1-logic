# Understanding Guard (LOCKED)

## Used In
n8n → Understanding JSON Guard node

## Code
```javascript
const SESSION_BOOTSTRAP_NODE = 'Session Bootstrap';
const base = (() => {
  try {
    const ref = $item(0).$node[SESSION_BOOTSTRAP_NODE].json;
    if (!ref || typeof ref !== 'object') {
      console.error(JSON.stringify({ node: 'Understanding JSON Guard', error: 'cross_node_ref_empty', ref_node: SESSION_BOOTSTRAP_NODE }));
      return {};
    }
    return ref;
  } catch (e) {
    console.error(JSON.stringify({ node: 'Understanding JSON Guard', error: 'cross_node_ref_failed', ref_node: SESSION_BOOTSTRAP_NODE, message: e.message }));
    return {};
  }
})();
const payload = $json ?? {};
const event = base.event && typeof base.event === 'object' ? base.event : {};
const session = base.session && typeof base.session === 'object' ? base.session : {};
const client_config = base.client_config && typeof base.client_config === 'object' ? base.client_config : {};

const allowedMessageFunctions = ['info_request', 'refinement', 'negotiation', 'acknowledgment', 'clarification', 'fresh_request'];
const allowedBusinessIntents = ['store_info', 'product_search', 'pricing', 'exchange', 'support'];
const allowedTopics = ['store_info', 'product', 'exchange', 'pricing', 'location'];
const hardFallback = {
  message_function: 'clarification',
  business_intent: null,
  topic: null,
  confidence: 0.0,
  ambiguity: 1.0,
  missing_information: [],
  reference_resolution: {
    refers_to: null,
    resolved_id: null,
  },
  last_asked_key: null,
};

const issues = [];
const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const parseJsonObject = (value) => {
  if (!value) return null;
  if (isRecord(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const normalizeEnum = (value, allowed, label) => {
  if (typeof value !== 'string') {
    issues.push(label + '_type');
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!allowed.includes(normalized)) {
    issues.push(label + '_invalid');
    return null;
  }
  return normalized;
};
const normalizeNullableEnum = (value, allowed, label) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim().toLowerCase() === 'null') return null;
  return normalizeEnum(value, allowed, label);
};
const normalizeUnitNumber = (value, label) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    issues.push(label + '_type');
    return null;
  }
  if (value < 0 || value > 1) {
    issues.push(label + '_range');
    return null;
  }
  return value;
};
const normalizeStringArray = (value, label) => {
  if (!Array.isArray(value)) {
    issues.push(label + '_type');
    return null;
  }
  const normalized = [];
  for (const item of value) {
    if (typeof item !== 'string') {
      issues.push(label + '_item_type');
      return null;
    }
    const text = item.trim();
    if (text) normalized.push(text);
  }
  return normalized;
};
const normalizeNullableString = (value, label) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    issues.push(label + '_type');
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
};
const validateReferenceResolution = (value) => {
  if (!isRecord(value)) {
    issues.push('reference_resolution_type');
    return null;
  }
  return {
    refers_to: normalizeNullableString(value.refers_to, 'reference_resolution.refers_to'),
    resolved_id: normalizeNullableString(value.resolved_id, 'reference_resolution.resolved_id'),
  };
};

const rawResponse = parseJsonObject(payload.choices?.[0]?.message?.content)
  || parseJsonObject(payload.output_text)
  || parseJsonObject(payload.text)
  || parseJsonObject(payload.data)
  || parseJsonObject(payload.result)
  || parseJsonObject(payload);

let understanding_output = hardFallback;
if (!rawResponse) {
  issues.push('understanding_response_not_parseable');
} else {
  const validated = {
    message_function: normalizeEnum(rawResponse.message_function, allowedMessageFunctions, 'message_function'),
    business_intent: normalizeNullableEnum(rawResponse.business_intent, allowedBusinessIntents, 'business_intent'),
    topic: normalizeNullableEnum(rawResponse.topic, allowedTopics, 'topic'),
    confidence: normalizeUnitNumber(rawResponse.confidence, 'confidence'),
    ambiguity: normalizeUnitNumber(rawResponse.ambiguity, 'ambiguity'),
    missing_information: normalizeStringArray(rawResponse.missing_information, 'missing_information'),
    reference_resolution: validateReferenceResolution(rawResponse.reference_resolution),
    last_asked_key: normalizeNullableString(rawResponse.last_asked_key, 'last_asked_key'),
  };

  const validationFailed = [
    validated.message_function,
    validated.confidence,
    validated.ambiguity,
    validated.missing_information,
    validated.reference_resolution,
  ].some((value) => value === null) || issues.length > 0;

  if (!validationFailed) {
    understanding_output = {
      message_function: validated.message_function,
      business_intent: validated.business_intent,
      topic: validated.topic,
      confidence: validated.confidence,
      ambiguity: validated.ambiguity,
      missing_information: validated.missing_information,
      reference_resolution: validated.reference_resolution,
      last_asked_key: validated.last_asked_key,
    };
  }
}

const understanding_meta = {
  validator_mode: 'pure_schema_validator',
  schema_mode: 'minimal_guard_v2',
  valid: issues.length === 0,
  issues,
  raw_response: rawResponse,
  fallback_applied: issues.length > 0,
  timestamp: Date.now(),
};
console.log(JSON.stringify({
  node: 'Understanding JSON Guard - Pure Validator',
  valid: understanding_meta.valid,
  fallback_applied: understanding_meta.fallback_applied,
  issues: understanding_meta.issues,
  raw_response: rawResponse,
}));

return [{
  json: {
    event,
    session,
    client_config,
    understanding_output,
    understanding_meta,
  },
}];
```

## Notes
- `business_intent` and `topic` are nullable enum fields
- Real JSON `null` is valid
- The guard also normalizes the legacy string `"null"` to real `null`
- Any other invalid enum value still triggers fallback
