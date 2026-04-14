let base = {};
try {
  base = $item(0).$node['Rules Layer'].json ?? {};
} catch {
  base = {};
}
const event = base.event && typeof base.event === 'object' ? base.event : {};
const session = base.session && typeof base.session === 'object' ? base.session : {};
const client_config = base.client_config && typeof base.client_config === 'object' ? base.client_config : {};
const understanding_output = base.understanding_output && typeof base.understanding_output === 'object' ? base.understanding_output : {};
const rules_output = base.rules_output && typeof base.rules_output === 'object' ? base.rules_output : {};
const resolverInput = rules_output.resolver_input && typeof rules_output.resolver_input === 'object' ? rules_output.resolver_input : {};
const inputItems = $input.all().map((item) => item.json ?? {});

const isRecord = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;
const normalizeNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};
const normalizeStorageValue = (value) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const gbMatch = trimmed.match(/\b(32|64|128|256|512|1024)\b/i);
  return gbMatch ? (gbMatch[1] + 'GB') : trimmed;
};
const extractStorage = (value) => {
  if (typeof value !== 'string') return null;
  const match = value.match(/\b(32|64|128|256|512|1024)\s*gb\b/i);
  return match ? (match[1] + 'GB') : null;
};
const normalizeProduct = (value, index) => {
  if (value === null || value === undefined || !isRecord(value)) return null;
  const priceValue = value.price_etb ?? value.price ?? value.amount ?? null;
  const stockQty = normalizeNullableNumber(value.stockQuantity ?? value.stock_quantity ?? value.stock ?? null);
  return {
    id: String(value.id ?? value._id ?? value.product_id ?? value.sku ?? ('product_' + index)),
    brand: normalizeText(value.brand),
    model: normalizeText(value.model ?? value.phoneType ?? value.name ?? value.title),
    price_etb: normalizeNullableNumber(priceValue),
    storage: normalizeStorageValue(String(value.storage ?? '')),
    ram: value.ram === null || value.ram === undefined ? null : String(value.ram),
    condition: normalizeText(value.condition),
    stock_status: stockQty === null ? null : (stockQty > 0 ? 'in_stock' : 'out_of_stock'),
    stock_quantity: stockQty,
    raw: value,
  };
};
const looksLikeProductRecord = (value) => isRecord(value) && ['id', '_id', 'product_id', 'sku', 'brand', 'model', 'phoneType', 'name', 'title', 'price', 'price_etb', 'amount'].some((key) => Object.prototype.hasOwnProperty.call(value, key));
const collectRemoteProducts = (items) => {
  const flattened = [];
  for (const item of items) {
    if (Array.isArray(item)) {
      flattened.push(...item.filter(looksLikeProductRecord));
      continue;
    }
    if (isRecord(item) && Array.isArray(item.products)) {
      flattened.push(...item.products.filter(looksLikeProductRecord));
      continue;
    }
    if (looksLikeProductRecord(item)) {
      flattened.push(item);
    }
  }
  const deduped = [];
  const seen = new Set();
  for (const value of flattened) {
    const normalized = normalizeProduct(value, deduped.length + 1);
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    deduped.push(normalized);
  }
  return deduped;
};

const remoteProducts = collectRemoteProducts(inputItems);
const result_mode = remoteProducts.length > 0 ? 'products_found' : 'no_products';
const products = remoteProducts;

const shownProducts = Array.isArray(session.flow_context?.buy_flow?.shown_products)
  ? session.flow_context.buy_flow.shown_products.map(normalizeProduct).filter(Boolean)
  : [];
const currentInterest = normalizeProduct(session.flow_context?.buy_flow?.current_interest, shownProducts.length + 10);
const sessionConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const sessionConstraints = {
  budget_etb: normalizeNullableNumber(sessionConstraintsSource.budget_etb),
  brand: normalizeText(sessionConstraintsSource.brand ?? currentInterest?.brand ?? null),
  model: normalizeText(sessionConstraintsSource.model ?? currentInterest?.model ?? null),
  storage: normalizeStorageValue(sessionConstraintsSource.storage ?? currentInterest?.storage ?? null),
  condition: normalizeText(sessionConstraintsSource.condition ?? currentInterest?.condition ?? null),
};
const productContextSource = isRecord(resolverInput.product_context) ? resolverInput.product_context : {};
let effectiveConstraints = {
  budget_etb: normalizeNullableNumber(productContextSource.budget_etb) ?? sessionConstraints.budget_etb,
  brand: normalizeText(productContextSource.brand) ?? sessionConstraints.brand,
  model: normalizeText(productContextSource.model) ?? sessionConstraints.model,
  storage: normalizeStorageValue(productContextSource.storage) ?? sessionConstraints.storage ?? extractStorage(String(event.text ?? '')),
  condition: normalizeText(productContextSource.condition) ?? sessionConstraints.condition,
};

const candidateProducts = products.length > 0 ? products : shownProducts;
const productNameForMatch = (product) => [product.brand, product.model].filter(Boolean).join(' ').trim().toLowerCase();
if (products.length > 0) {
  if (effectiveConstraints.model) {
    const hasModelMatch = candidateProducts.some((product) => productNameForMatch(product).includes(effectiveConstraints.model.toLowerCase()));
    if (!hasModelMatch) effectiveConstraints = { ...effectiveConstraints, model: null };
  }
  if (effectiveConstraints.brand) {
    const hasBrandMatch = candidateProducts.some((product) => product.brand && product.brand.toLowerCase().includes(effectiveConstraints.brand.toLowerCase()));
    if (!hasBrandMatch) effectiveConstraints = { ...effectiveConstraints, brand: null };
  }
  if (effectiveConstraints.storage) {
    const hasStorageMatch = candidateProducts.some((product) => product.storage && normalizeStorageValue(product.storage) === normalizeStorageValue(effectiveConstraints.storage));
    if (!hasStorageMatch) effectiveConstraints = { ...effectiveConstraints, storage: null };
  }
  if (effectiveConstraints.condition) {
    const hasConditionMatch = candidateProducts.some((product) => product.condition && product.condition.toLowerCase() === effectiveConstraints.condition.toLowerCase());
    if (!hasConditionMatch) effectiveConstraints = { ...effectiveConstraints, condition: null };
  }
}
const requestedName = normalizeText(resolverInput.resolved_product_name)
  ?? ([effectiveConstraints.brand, effectiveConstraints.model].filter(Boolean).join(' ').trim() || null);
let selectedProduct = null;
if (resolverInput.resolved_reference?.id) {
  selectedProduct = candidateProducts.find((product) => product.id === resolverInput.resolved_reference.id) ?? null;
}
if (!selectedProduct && requestedName) {
  const lowered = requestedName.toLowerCase();
  selectedProduct = candidateProducts.find((product) => {
    const name = productNameForMatch(product);
    return Boolean(name) && name === lowered;
  }) ?? null;
}
if (!selectedProduct && currentInterest && products.length === 0) {
  const sameModel = effectiveConstraints.model && currentInterest.model && currentInterest.model.toLowerCase() === effectiveConstraints.model.toLowerCase();
  const sameBrand = effectiveConstraints.brand && currentInterest.brand && currentInterest.brand.toLowerCase() === effectiveConstraints.brand.toLowerCase();
  if (!effectiveConstraints.model || sameModel || sameBrand) {
    selectedProduct = currentInterest;
  }
}

const matchesConstraints = (product) => {
  if (!product) return false;
  if (effectiveConstraints.brand && (!product.brand || !product.brand.toLowerCase().includes(effectiveConstraints.brand.toLowerCase()))) return false;
  if (effectiveConstraints.model) {
    const name = productNameForMatch(product);
    if (!name.includes(effectiveConstraints.model.toLowerCase())) return false;
  }
  if (effectiveConstraints.storage && (!product.storage || normalizeStorageValue(product.storage) !== normalizeStorageValue(effectiveConstraints.storage))) return false;
  if (effectiveConstraints.condition && (!product.condition || product.condition.toLowerCase() !== effectiveConstraints.condition.toLowerCase())) return false;
  return true;
};

const filteredProducts = candidateProducts.filter(matchesConstraints);
const effectiveProducts = filteredProducts.length > 0 ? filteredProducts : (products.length > 0 ? candidateProducts : []);
const replyProducts = selectedProduct
  ? [selectedProduct]
  : effectiveProducts.slice(0, 5);
const numericPrices = replyProducts.map((product) => product.price_etb).filter((value) => Number.isFinite(value));
const priceRange = numericPrices.length > 0 ? { min: Math.min(...numericPrices), max: Math.max(...numericPrices) } : null;
let result_type = 'no_match';
let next_step = 'ask_clarification';
let exchange_context = null;
const isExchangeClarification = resolverInput.flow === 'exchange'
  && Array.isArray(resolverInput.missing_fields)
  && resolverInput.missing_fields.length > 0;
const exchangeContext = resolverInput.flow === 'exchange'
  ? {
      current_interest: session.flow_context?.buy_flow?.current_interest ?? null,
      collected_constraints: effectiveConstraints,
    }
  : null;

if (rules_output.reply_mode === 'clarify_reference') {
  result_type = 'clarification_needed';
  next_step = 'ask_clarification';
} else if (isExchangeClarification) {
  result_type = 'clarification_needed';
  next_step = 'ask_clarification';
  exchange_context = exchangeContext;
} else if (resolverInput.flow === 'exchange') {
  result_type = 'exchange_offer';
  next_step = 'ask_clarification';
  exchange_context = exchangeContext;
} else if (resolverInput.flow === 'info' || resolverInput.flow === 'support') {
  result_type = 'no_match';
  next_step = 'ask_clarification';
} else if (selectedProduct) {
  result_type = 'single_product';
  next_step = 'show_single';
} else if (effectiveProducts.length > 1) {
  result_type = 'multiple_options';
  next_step = 'show_options';
} else if (effectiveProducts.length === 1) {
  result_type = 'single_product';
  next_step = 'show_single';
} else if ((resolverInput.missing_fields ?? []).length > 0) {
  result_type = 'clarification_needed';
  next_step = 'ask_clarification';
}

const post_price_mode =
  result_type === 'single_product'
  && replyProducts.length === 1
  && resolverInput.flow === 'buy'
    ? 'price_shown'
    : null;
const exchange_invitation_variant =
  post_price_mode === 'price_shown'
    ? ((Number.isFinite(Number(session.message_count ?? null)) ? Number(session.message_count) : 0) % 4) + 1
    : null;
const product_detail_fields = (() => {
  if (post_price_mode !== 'price_shown' || !replyProducts[0]) return [];
  const product = replyProducts[0];
  return ['storage', 'ram', 'condition']
    .filter((key) => product[key] != null)
    .map((key) => ({ key, value: String(product[key]) }));
})();
const exchange_collection = resolverInput.flow === 'exchange'
  ? (() => {
      const target_phone_raw = session.flow_context?.buy_flow?.current_interest;
      const target_phone = isRecord(target_phone_raw)
        ? {
            brand: normalizeText(target_phone_raw.brand ?? null),
            model: normalizeText(target_phone_raw.model ?? target_phone_raw.phoneType ?? null),
            storage: normalizeStorageValue(target_phone_raw.storage ?? null),
          }
        : null;
      const exchangeDetails = isRecord(session.exchange_details) ? session.exchange_details : {};
      const collectedConstraints = isRecord(session.collected_constraints) ? session.collected_constraints : {};
      return {
        target_phone,
        collected: {
          model: normalizeText(exchangeDetails.model ?? collectedConstraints.model ?? null),
          storage: normalizeStorageValue(exchangeDetails.storage ?? collectedConstraints.storage ?? null),
          ram: exchangeDetails.ram === null || exchangeDetails.ram === undefined ? null : String(exchangeDetails.ram),
          condition: normalizeText(exchangeDetails.condition ?? collectedConstraints.condition ?? null),
          battery_health: exchangeDetails.battery_health === null || exchangeDetails.battery_health === undefined ? null : String(exchangeDetails.battery_health),
        },
      };
    })()
  : null;

const resolver_output = {
  result_mode,
  result_type,
  products: replyProducts,
  exchange_context,
  next_step,
  post_price_mode,
  exchange_invitation_variant,
  product_detail_fields,
  exchange_collection,
  facts_for_reply: {
    product_found: Boolean(selectedProduct || replyProducts.length > 0),
    how_many_options: replyProducts.length,
    stock_status: selectedProduct?.stock_status ?? (replyProducts[0]?.stock_status ?? null),
    price_range: priceRange,
  },
};

return [{
  json: {
    event,
    session,
    client_config,
    understanding_output,
    rules_output,
    result_mode,
    products,
    resolver_output,
  },
}];