const fs = require("fs");

const workflowPath = "workflow.json";
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

function getNode(name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node || !node.parameters || typeof node.parameters.jsCode !== "string") {
    throw new Error(name + " node not found or missing jsCode");
  }
  return node;
}

function replaceExact(source, oldText, newText, label) {
  if (!source.includes(oldText)) {
    throw new Error(label + " block not found");
  }
  return source.replace(oldText, newText);
}

const rulesNode = getNode("Rules Layer");
const resolverNode = getNode("Business Data Resolver");
const validationNode = getNode("Validation");

let rulesCode = rulesNode.parameters.jsCode;
let resolverCode = resolverNode.parameters.jsCode;
let validationCode = validationNode.parameters.jsCode;

const rulesOldBlock = `const budgetSignal = extractBudgetEtb(eventText);
const existingConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const mergedConstraints = {
  budget_etb: budgetSignal ?? extractBudgetEtb(existingConstraintsSource.budget_etb) ?? normalizePositiveNumber(existingConstraintsSource.budget_etb),
  brand: normalizeText(existingConstraintsSource.brand ?? currentInterest?.brand ?? null),
  model: normalizeText(existingConstraintsSource.model ?? currentInterest?.model ?? null),
  storage: normalizeText(existingConstraintsSource.storage ?? currentInterest?.storage ?? null),
  condition: normalizeText(existingConstraintsSource.condition ?? currentInterest?.condition ?? null),
};

const referenceSource = isRecord(understanding_output.reference_resolution) ? understanding_output.reference_resolution : {};
const reference_resolution = {
  reference_type: normalizeText(referenceSource.refers_to) ?? 'none',
  resolved: Boolean(normalizeText(referenceSource.resolved_id)),
  resolved_product_id: normalizeText(referenceSource.resolved_id),
  resolved_product_name: null,
};
const resolveProductById = (id) => shownProducts.find((item) => item.id === id) ?? (currentInterest?.id === id ? currentInterest : null) ?? null;
const resolvedProduct = reference_resolution.resolved && reference_resolution.resolved_product_id
  ? resolveProductById(reference_resolution.resolved_product_id)
  : null;`;

const rulesNewBlock = `const budgetSignal = extractBudgetEtb(eventText);
const existingConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const referenceSource = isRecord(understanding_output.reference_resolution) ? understanding_output.reference_resolution : {};
const reference_resolution = {
  reference_type: normalizeText(referenceSource.refers_to) ?? 'none',
  resolved: Boolean(normalizeText(referenceSource.resolved_id)),
  resolved_product_id: normalizeText(referenceSource.resolved_id),
  resolved_product_name: null,
};
const resolveProductById = (id) => shownProducts.find((item) => item.id === id) ?? (currentInterest?.id === id ? currentInterest : null) ?? null;
const resolvedProduct = reference_resolution.resolved && reference_resolution.resolved_product_id
  ? resolveProductById(reference_resolution.resolved_product_id)
  : null;
const hasExplicitProductAnchor = Boolean(
  reference_resolution.resolved
  || /\\b(?:iphone|samsung|pixel|redmi|xiaomi|tecno|infinix|oppo|vivo|realme|itel|nokia)\\b/i.test(eventText)
  || /\\b(?:32|64|128|256|512|1024)\\s*gb\\b/i.test(eventText)
  || /\\b\\d{1,3}\\s*gb\\s*ram\\b/i.test(eventText)
  || /\\b(?:pro max|pro|plus|max|mini)\\b/i.test(eventText)
  || /\\b(?:that one|this one|the one|same one)\\b/i.test(eventText)
);
const budgetOnlyQuery = Boolean(budgetSignal !== null && !hasExplicitProductAnchor);
const mergedConstraints = {
  budget_etb: budgetSignal ?? extractBudgetEtb(existingConstraintsSource.budget_etb) ?? normalizePositiveNumber(existingConstraintsSource.budget_etb),
  brand: budgetOnlyQuery ? null : normalizeText(existingConstraintsSource.brand ?? currentInterest?.brand ?? null),
  model: budgetOnlyQuery ? null : normalizeText(existingConstraintsSource.model ?? currentInterest?.model ?? null),
  storage: budgetOnlyQuery ? null : normalizeText(existingConstraintsSource.storage ?? currentInterest?.storage ?? null),
  condition: budgetOnlyQuery ? null : normalizeText(existingConstraintsSource.condition ?? currentInterest?.condition ?? null),
};`;

const rulesProductContextOld = `const productContext = {
  brand: mergedConstraints.brand,
  model: mergedConstraints.model,
  storage: mergedConstraints.storage,
  condition: mergedConstraints.condition,
  budget_etb: mergedConstraints.budget_etb,
  current_interest: currentInterest ? currentInterest.raw : null,
  current_topic: currentTopic,
  current_flow: currentFlow,
};`;

const rulesProductContextNew = `const productContext = {
  brand: budgetOnlyQuery ? null : mergedConstraints.brand,
  model: budgetOnlyQuery ? null : mergedConstraints.model,
  storage: budgetOnlyQuery ? null : mergedConstraints.storage,
  condition: budgetOnlyQuery ? null : mergedConstraints.condition,
  budget_etb: mergedConstraints.budget_etb,
  current_interest: budgetOnlyQuery ? null : (currentInterest ? currentInterest.raw : null),
  current_topic: currentTopic,
  current_flow: currentFlow,
  budget_only_query: budgetOnlyQuery,
};`;

const rulesResolverInputOld = `resolver_input: {
    flow: effectiveFlow,
    product_context: productContext,
    missing_fields,
    resolved_reference: resolvedProduct ? { id: resolvedProduct.id, raw: resolvedProduct.raw } : null,
    resolved_product_name: resolvedProduct?.name ?? null,
  },`;

const rulesResolverInputNew = `resolver_input: {
    flow: effectiveFlow,
    product_context: productContext,
    missing_fields,
    resolved_reference: resolvedProduct ? { id: resolvedProduct.id, raw: resolvedProduct.raw } : null,
    resolved_product_name: resolvedProduct?.name ?? null,
    budget_only_query: budgetOnlyQuery,
  },`;

rulesCode = replaceExact(rulesCode, rulesOldBlock, rulesNewBlock, "Rules Layer budget context");
rulesCode = replaceExact(rulesCode, rulesProductContextOld, rulesProductContextNew, "Rules Layer product context");
rulesCode = replaceExact(rulesCode, rulesResolverInputOld, rulesResolverInputNew, "Rules Layer resolver input");

const resolverOldBlock = `const sessionConstraints = {
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
};`;

const resolverNewBlock = `const budgetOnlyQuery = Boolean(resolverInput.budget_only_query);
const sessionConstraints = {
  budget_etb: normalizeNullableNumber(sessionConstraintsSource.budget_etb),
  brand: budgetOnlyQuery ? null : normalizeText(sessionConstraintsSource.brand ?? currentInterest?.brand ?? null),
  model: budgetOnlyQuery ? null : normalizeText(sessionConstraintsSource.model ?? currentInterest?.model ?? null),
  storage: budgetOnlyQuery ? null : normalizeStorageValue(sessionConstraintsSource.storage ?? currentInterest?.storage ?? null),
  condition: budgetOnlyQuery ? null : normalizeText(sessionConstraintsSource.condition ?? currentInterest?.condition ?? null),
};
const productContextSource = isRecord(resolverInput.product_context) ? resolverInput.product_context : {};
let effectiveConstraints = {
  budget_etb: normalizeNullableNumber(productContextSource.budget_etb) ?? sessionConstraints.budget_etb,
  brand: budgetOnlyQuery ? null : normalizeText(productContextSource.brand) ?? sessionConstraints.brand,
  model: budgetOnlyQuery ? null : normalizeText(productContextSource.model) ?? sessionConstraints.model,
  storage: budgetOnlyQuery ? null : normalizeStorageValue(productContextSource.storage) ?? sessionConstraints.storage ?? extractStorage(String(event.text ?? '')),
  condition: budgetOnlyQuery ? null : normalizeText(productContextSource.condition) ?? sessionConstraints.condition,
};`;

const resolverRequestedNameOld = `const requestedName = normalizeText(resolverInput.resolved_product_name)
  ?? ([effectiveConstraints.brand, effectiveConstraints.model].filter(Boolean).join(' ').trim() || null);`;

const resolverRequestedNameNew = `const requestedName = budgetOnlyQuery ? null : normalizeText(resolverInput.resolved_product_name)
  ?? ([effectiveConstraints.brand, effectiveConstraints.model].filter(Boolean).join(' ').trim() || null);`;

resolverCode = replaceExact(resolverCode, resolverOldBlock, resolverNewBlock, "Business Data Resolver budget constraints");
resolverCode = replaceExact(resolverCode, resolverRequestedNameOld, resolverRequestedNameNew, "Business Data Resolver requested name");
resolverCode = replaceExact(
  resolverCode,
  `if (!selectedProduct && currentInterest && products.length === 0) {`,
  `if (!selectedProduct && currentInterest && products.length === 0 && !budgetOnlyQuery) {`,
  "Business Data Resolver current interest fallback",
);

const validationOldBlock = `const shownProducts = isStartReset
  ? []
  : (resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length > 0
      ? resolver_output.products
      : (Array.isArray(session.flow_context?.buy_flow?.shown_products) ? session.flow_context.buy_flow.shown_products : []));
const currentInterest = isStartReset
  ? null
  : (resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length === 1
      ? resolver_output.products[0]
      : (rules_output.resolver_input?.resolved_reference?.raw ?? session.flow_context?.buy_flow?.current_interest ?? null));`;

const validationNewBlock = `const shownProducts = isStartReset
  ? []
  : (resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length > 0
      ? resolver_output.products
      : (Array.isArray(session.flow_context?.buy_flow?.shown_products) ? session.flow_context.buy_flow.shown_products : []));
const budgetOnlyQuery = Boolean(rules_output.resolver_input?.budget_only_query);
const currentInterest = isStartReset
  ? null
  : (resolver_output && Array.isArray(resolver_output.products) && resolver_output.products.length === 1
      ? resolver_output.products[0]
      : (budgetOnlyQuery
          ? null
          : (rules_output.resolver_input?.resolved_reference?.raw ?? session.flow_context?.buy_flow?.current_interest ?? null)));`;

validationCode = replaceExact(validationCode, validationOldBlock, validationNewBlock, "Validation current interest handling");

rulesNode.parameters.jsCode = rulesCode;
resolverNode.parameters.jsCode = resolverCode;
validationNode.parameters.jsCode = validationCode;

fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + "\n", "utf8");
console.log("workflow.json updated");
