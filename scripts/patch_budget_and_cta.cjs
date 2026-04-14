const fs = require('fs');

const workflowPath = 'workflow.json';
const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf8'));

function getNode(name) {
  const node = workflow.nodes.find((item) => item.name === name);
  if (!node) {
    throw new Error(`${name} node not found`);
  }
  return node;
}

function replaceOnce(source, search, replacement) {
  if (!source.includes(search)) {
    throw new Error(`Missing snippet: ${search.slice(0, 120)}`);
  }
  return source.replace(search, replacement);
}

function updateCode(name, replacements) {
  let code = getNode(name).parameters.jsCode;
  for (const [search, replacement] of replacements) {
    code = replaceOnce(code, search, replacement);
  }
  getNode(name).parameters.jsCode = code;
}

updateCode('Rules Layer', [
  [
    `const extractBudgetEtb = (value) => {
  const source = String(value ?? eventText ?? '').trim().toLowerCase();
  if (!source) return null;
  const kMatch = source.match(/(\\d+(?:\\.\\d+)?)\\s*k\\b/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const currencyMatch = source.match(/(?:etb|birr|br|brr|ብር)\\s*[:\\-]?\\s*(\\d{3,6})/i);
  if (currencyMatch) return Number(currencyMatch[1]);
  const plainMatch = source.match(/\\b(\\d{4,6})\\b/);
  return plainMatch ? Number(plainMatch[1]) : null;
};`,
    `const extractBudgetEtb = (value) => {
  const source = String(value ?? eventText ?? '').trim().toLowerCase();
  if (!source) return null;
  const parseNumeric = (raw) => {
    const numeric = Number(String(raw).replace(/[\\s,]/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  };
  const kMatch = source.match(/\\b(\\d+(?:\\.\\d+)?)\\s*(?:k|thousand)\\b/);
  if (kMatch) return Math.round(Number(kMatch[1]) * 1000);
  const currencyMatch = source.match(/(?:etb|birr|br|brr|ብር)\\s*[:\\-]?\\s*(\\d{1,3}(?:[\\s,]\\d{3})+|\\d{4,6}|\\d+(?:\\.\\d+)?)/i);
  if (currencyMatch) return parseNumeric(currencyMatch[1]);
  const plainMatch = source.match(/\\b(\\d{1,3}(?:[\\s,]\\d{3})+|\\d{4,6})\\b/);
  return plainMatch ? parseNumeric(plainMatch[1]) : null;
};`,
  ],
  [
    `const existingConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const mergedConstraints = {`,
    `const budgetSignal = extractBudgetEtb(eventText);
const existingConstraintsSource = isRecord(session.collected_constraints) ? session.collected_constraints : {};
const mergedConstraints = {`,
  ],
  [
    `  budget_etb: extractBudgetEtb(existingConstraintsSource.budget_etb) ?? normalizePositiveNumber(existingConstraintsSource.budget_etb),`,
    `  budget_etb: budgetSignal ?? extractBudgetEtb(existingConstraintsSource.budget_etb) ?? normalizePositiveNumber(existingConstraintsSource.budget_etb),`,
  ],
  [
    `return [{ json: { event, session, client_config, understanding_output, understanding_meta, rules_output } }];`,
    `if (budgetSignal !== null && businessIntent !== 'exchange' && currentFlow !== 'exchange') {
  rules_output = {
    ...rules_output,
    reply_mode: 'business_resolve',
    should_call_resolver: true,
    resolver_input: {
      ...rules_output.resolver_input,
      flow: 'buy',
      product_context: {
        ...productContext,
        budget_etb: budgetSignal,
      },
      missing_fields: [],
    },
    session_update: {
      ...rules_output.session_update,
      last_topic: understandingTopic ?? rules_output.session_update?.last_topic ?? 'pricing',
      flow_stage: 'buy',
      collected_constraints: {
        ...mergedConstraints,
        budget_etb: budgetSignal,
      },
      last_asked_key: rules_output.session_update?.last_asked_key ?? 'budget_etb',
    },
    reasoning: 'budget_signal_forces_product_search',
  };
}

return [{ json: { event, session, client_config, understanding_output, understanding_meta, rules_output } }];`,
  ],
]);

updateCode('Validation', [
  [
    `const priceShown = Boolean(resolver_output?.facts_for_reply?.price_range);`,
    `const priceShown = Boolean(resolver_output?.facts_for_reply?.price_range);
const budgetFallbackUsed = Boolean(resolver_output?.facts_for_reply?.budget_fallback_used);`,
  ],
  [
    `} else if (flowIsBuy && hasProductReply) {
  reply_text = reply_text.replace(/\\s*\\n+\\s*/g, ' ').trim();
  if (priceShown && !pricingFollowUp && !reply_text.includes('Do you want to reserve it or come see it in person?')) {
    reply_text = reply_text.replace(/\\s*$/, '') + '\\nDo you want to reserve it or come see it in person?';
  }
  if (!reply_text.includes(storeCtaText)) {
    reply_text = reply_text.replace(/\\s*$/, '') + '\\n' + storeCtaText;
  }
  telegram_markup = storeMarkup;
} else if (flowIsBuy && !reply_text.includes(storeCtaText) && (priceShown || /\\b(price|cost|availability|available|stock|budget)\\b/i.test(lowerText))) {
  reply_text = reply_text.replace(/\\s*$/, '') + '\\n' + storeCtaText;
  telegram_markup = storeMarkup;
}`,
    `} else if (flowIsBuy && hasProductReply) {
  reply_text = reply_text.replace(/\\s*\\n+\\s*/g, ' ').trim();
  if (budgetFallbackUsed) {
    const budgetFallbackNotice = 'No exact match in your budget, so these are the nearest options above budget.';
    if (!reply_text.includes(budgetFallbackNotice)) {
      reply_text = budgetFallbackNotice + '\\n' + reply_text;
    }
  }
  if (!pricingFollowUp && !reply_text.includes('Do you want to reserve it or come see it in person?')) {
    reply_text = reply_text.replace(/\\s*$/, '') + '\\nDo you want to reserve it or come see it in person?';
  }
  if (!reply_text.includes(storeCtaText)) {
    reply_text = reply_text.replace(/\\s*$/, '') + '\\n' + storeCtaText;
  }
  telegram_markup = storeMarkup;
} else if (flowIsBuy && !reply_text.includes(storeCtaText) && (priceShown || budgetFallbackUsed || /\\b(price|cost|availability|available|stock|budget)\\b/i.test(lowerText))) {
  reply_text = reply_text.replace(/\\s*$/, '') + '\\n' + storeCtaText;
  telegram_markup = storeMarkup;
}`,
  ],
  [
    `reply_text = reply_text
  .split(/\\r?\\n/)
  .filter((line) => line.trim())
  .slice(0, 3)
  .join('\\n')
  .trim();`,
    `const closeQuestion = flowIsBuy && hasProductReply && !pricingFollowUp
  ? 'Do you want to reserve it or come see it in person?'
  : null;
const budgetFallbackNotice = budgetFallbackUsed
  ? 'No exact match in your budget, so these are the nearest options above budget.'
  : null;
const replyLines = reply_text
  .split(/\\r?\\n/)
  .map((line) => line.trim())
  .filter(Boolean);
const closingLines = [];
if (budgetFallbackNotice) closingLines.push(budgetFallbackNotice);
if (closeQuestion) closingLines.push(closeQuestion);
if (!replyLines.includes(storeCtaText)) closingLines.push(storeCtaText);
const bodyLines = replyLines.filter((line) => !closingLines.includes(line));
const maxBodyLines = Math.max(0, 3 - closingLines.length);
reply_text = bodyLines.slice(0, maxBodyLines).concat(closingLines).join('\\n').trim();`,
  ],
]);

fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + '\n', 'utf8');
console.log('workflow.json updated');
