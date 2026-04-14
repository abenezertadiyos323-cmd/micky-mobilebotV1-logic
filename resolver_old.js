const input = $json ?? {};
const event = input.event && typeof input.event === 'object' ? input.event : {};
const session = input.session && typeof input.session === 'object' ? input.session : {};
const client_config = input.client_config && typeof input.client_config === 'object' ? input.client_config : {};
const understanding_output = input.understanding_output && typeof input.understanding_output === 'object' ? input.understanding_output : {};
const rules_output = input.rules_output && typeof input.rules_output === 'object' ? input.rules_output : {};
const resolverInput = rules_output.resolver_input && typeof rules_output.resolver_input === 'object' ? rules_output.resolver_input : {};

const normalizeProduct = (value, index) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') {
    return { id: String(value), brand: null, model: null, price_etb: null, storage: null, condition: null, stock_status: null };
  }
  if (typeof value !== 'object') return null;
  const priceValue = value.price_etb ?? value.price ?? value.amount ?? null;
  return {
    id: String(value.id ?? value.product_id ?? value.sku ?? ('product_' + index)),
    brand: value.brand ?? null,
    model: value.model ?? value.name ?? value.title ?? null,
    price_etb: Number.isFinite(Number(priceValue)) ? Number(priceValue) : null,
    storage: value.storage ?? null,
    condition: value.condition ?? null,
    stock_status: value.stock_status ?? null,
  };
};

const shownProducts = Array.isArray(session.flow_context?.buy_flow?.shown_products)
  ? session.flow_context.buy_flow.shown_products.map(normalizeProduct).filter(Boolean)
  : [];
const currentInterest = normalizeProduct(session.flow_context?.buy_flow?.current_interest, shownProducts.length + 10);
const requestedName = typeof resolverInput.resolved_product_name === 'string' && resolverInput.resolved_product_name.trim()
  ? resolverInput.resolved_product_name.trim().toLowerCase()
  : null;
let selectedProduct = null;
if (resolverInput.resolved_reference?.id) {
  selectedProduct = shownProducts.find((product) => product.id === resolverInput.resolved_reference.id) ?? null;
}
if (!selectedProduct && requestedName) {
  selectedProduct = shownProducts.find((product) => {
    const name = [product.brand, product.model].filter(Boolean).join(' ').trim().toLowerCase();
    return Boolean(name) && name === requestedName;
  }) ?? null;
}
if (!selectedProduct && currentInterest) {
  selectedProduct = currentInterest;
}

const products = selectedProduct ? [selectedProduct] : shownProducts.slice(0, 3);
const numericPrices = products.map((product) => product.price_etb).filter((value) => Number.isFinite(value));
const priceRange = numericPrices.length > 0 ? { min: Math.min(...numericPrices), max: Math.max(...numericPrices) } : null;
let result_type = 'no_match';
let next_step = 'ask_clarification';
let exchange_context = null;

if (rules_output.reply_mode === 'clarify_reference') {
  result_type = 'clarification_needed';
  next_step = 'ask_clarification';
} else if (resolverInput.flow === 'exchange') {
  result_type = 'exchange_offer';
  next_step = 'ask_clarification';
  exchange_context = { current_interest: session.flow_context?.buy_flow?.current_interest ?? null, extracted_need: understanding_output.extracted_need ?? null };
} else if (selectedProduct) {
  result_type = 'single_product';
  next_step = 'show_single';
} else if (products.length > 1) {
  result_type = 'multiple_options';
  next_step = 'show_options';
} else if ((resolverInput.missing_fields ?? []).length > 0) {
  result_type = 'clarification_needed';
  next_step = 'ask_clarification';
}

const resolver_output = {
  result_type,
  products,
  exchange_context,
  next_step,
  facts_for_reply: {
    product_found: Boolean(selectedProduct || products.length > 0),
    how_many_options: products.length,
    stock_status: selectedProduct?.stock_status ?? null,
    price_range: priceRange,
  },
};

return [{ json: { event, session, client_config, understanding_output, rules_output, resolver_output } }];