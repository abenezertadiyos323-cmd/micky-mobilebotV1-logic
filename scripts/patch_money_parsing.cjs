const fs = require("fs");

const workflowPath = "workflow.json";
const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));

const simpleOldSnippet = `const normalizeNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
};`;

const simpleNewSnippet = `const normalizeNullableNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;
  const source = value.trim().toLowerCase();
  if (!source) return null;
  const thousandMatch = source.match(/\\b(\\d+(?:[.,]\\d+)?)\\s*(?:k|thousand)\\b/);
  if (thousandMatch) {
    const multiplier = Number(thousandMatch[1].replace(',', '.'));
    return Number.isFinite(multiplier) ? Math.round(multiplier * 1000) : null;
  }
  const numericChunks = source.match(/\\d[\\d\\s,._]*/g);
  if (!numericChunks) return null;
  for (const chunk of numericChunks) {
    const compact = chunk.replace(/[\\s_]/g, '');
    if (!compact) continue;
    const grouped = compact.split(/[.,]/);
    if (grouped.length > 1 && grouped.every((part, index) => (index === 0 ? /^\\d+$/.test(part) : /^\\d{3}$/.test(part)))) {
      const groupedValue = Number(grouped.join(''));
      if (Number.isFinite(groupedValue)) return groupedValue;
    }
    const plainValue = Number(compact.replace(/,/g, ''));
    if (Number.isFinite(plainValue)) return plainValue;
  }
  return null;
};`;

const fallbackOldSnippet = `const normalizeNullableNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};`;

const fallbackNewSnippet = `const normalizeNullableNumber = (value, fallback = null) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return fallback;
  }
  const source = value.trim().toLowerCase();
  if (!source) {
    return fallback;
  }
  const thousandMatch = source.match(/\\b(\\d+(?:[.,]\\d+)?)\\s*(?:k|thousand)\\b/);
  if (thousandMatch) {
    const multiplier = Number(thousandMatch[1].replace(',', '.'));
    return Number.isFinite(multiplier) ? Math.round(multiplier * 1000) : fallback;
  }
  const numericChunks = source.match(/\\d[\\d\\s,._]*/g);
  if (!numericChunks) {
    return fallback;
  }
  for (const chunk of numericChunks) {
    const compact = chunk.replace(/[\\s_]/g, '');
    if (!compact) {
      continue;
    }
    const grouped = compact.split(/[.,]/);
    if (grouped.length > 1 && grouped.every((part, index) => (index === 0 ? /^\\d+$/.test(part) : /^\\d{3}$/.test(part)))) {
      const groupedValue = Number(grouped.join(''));
      if (Number.isFinite(groupedValue)) {
        return groupedValue;
      }
    }
    const plainValue = Number(compact.replace(/,/g, ''));
    if (Number.isFinite(plainValue)) {
      return plainValue;
    }
  }
  return fallback;
};`;

const targetNodes = ["Session Bootstrap", "Rules Layer", "Business Data Resolver", "Validation"];
let totalMatches = 0;

for (const nodeName of targetNodes) {
  const node = workflow.nodes.find((item) => item.name === nodeName);
  if (!node || !node.parameters || typeof node.parameters.jsCode !== "string") {
    throw new Error(`${nodeName} node not found or missing jsCode`);
  }
  const code = node.parameters.jsCode;
  if (nodeName === "Session Bootstrap") {
    const oldMatches = code.split(fallbackOldSnippet).length - 1;
    const newMatches = code.split(fallbackNewSnippet).length - 1;
    if (oldMatches === 1) {
      node.parameters.jsCode = code.replace(fallbackOldSnippet, fallbackNewSnippet);
      totalMatches += 1;
      continue;
    }
    if (newMatches === 1) {
      continue;
    }
    throw new Error(`Session Bootstrap normalizeNullableNumber snippet count was ${oldMatches + newMatches}`);
  }
  const oldMatches = code.split(simpleOldSnippet).length - 1;
  const newMatches = code.split(simpleNewSnippet).length - 1;
  if (oldMatches === 1) {
    node.parameters.jsCode = code.replace(simpleOldSnippet, simpleNewSnippet);
    totalMatches += 1;
    continue;
  }
  if (newMatches === 1) {
    continue;
  }
  throw new Error(`${nodeName} normalizeNullableNumber snippet count was ${oldMatches + newMatches}`);
}

if (totalMatches === 0) {
  console.log("workflow.json already up to date");
  process.exit(0);
}

if (totalMatches !== 1) {
  throw new Error(`Expected 1 total normalizeNullableNumber snippet update, found ${totalMatches}`);
}

fs.writeFileSync(workflowPath, JSON.stringify(workflow, null, 2) + "\n", "utf8");
console.log("workflow.json updated");
