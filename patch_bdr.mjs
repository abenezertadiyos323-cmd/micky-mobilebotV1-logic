import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));

const ACTIVE_WORKFLOW_FILE = resolve(repoRoot, 'active_workflow_hc55q2zfas7gG1yu.json');
const WORKFLOW_FILE = resolve(repoRoot, 'workflow.json');
const BDR_NODE_NAME = 'Business Data Resolver';

async function main() {
  console.log('--- Step 1: Read good BDR code from active_workflow ---');
  const activeRaw = await readFile(ACTIVE_WORKFLOW_FILE, 'utf8');
  const activeWf = JSON.parse(activeRaw);
  const activeBdrNode = activeWf.nodes.find(n => n.name === BDR_NODE_NAME);
  if (!activeBdrNode) throw new Error('Could not find BDR node in active_workflow');
  
  const correctCode = activeBdrNode.parameters?.jsCode ?? activeBdrNode.parameters?.code;
  if (!correctCode) throw new Error('Found BDR node but jsCode is empty in active_workflow');
  console.log(`  Extracted BDR: ${correctCode.length} chars`);

  console.log('--- Step 2: Read current workflow.json ---');
  const workflowRaw = await readFile(WORKFLOW_FILE, 'utf8');
  const workflow = JSON.parse(workflowRaw);
  
  const bdrNode = workflow.nodes.find(n => n.name === BDR_NODE_NAME);
  if (!bdrNode) throw new Error('Could not find BDR node in workflow.json');
  console.log(`  Found node in workflow.json: ${bdrNode.name} (id: ${bdrNode.id})`);
  const oldCode = bdrNode.parameters?.jsCode ?? bdrNode.parameters?.code ?? '';
  console.log(`  Current bad code length: ${oldCode.length} chars`);

  // Patch
  if (bdrNode.parameters.jsCode !== undefined) {
    bdrNode.parameters.jsCode = correctCode;
  } else if (bdrNode.parameters.code !== undefined) {
    bdrNode.parameters.code = correctCode;
  } else {
    bdrNode.parameters.jsCode = correctCode;
  }
  
  // Apply Fix 3 (the raw extraction fix) to the full code as well, since it might not be applied in the old active_workflow!
  const fix3Target = `  return {
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
  };`;
  
  const fix3Replacement = `  const strippedRaw = (() => {
    if (!isRecord(value)) return value;
    const { raw: _raw, ...rest } = value;
    return rest;
  })();
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
    raw: strippedRaw,
  };`;

  let finalCode = correctCode;
  if (finalCode.includes(fix3Target)) {
    finalCode = finalCode.replace(fix3Target, fix3Replacement);
    console.log("  Successfully applied Fix 3 (strippedRaw) to the restored code");
  } else if (finalCode.includes('strippedRaw')) {
    console.log("  Fix 3 appears to already be applied to the restored code");
  } else {
    console.log("  WARNING: Could not apply Fix 3, and it doesn't seem to be there!");
  }

  if (bdrNode.parameters.jsCode !== undefined) bdrNode.parameters.jsCode = finalCode;
  else if (bdrNode.parameters.code !== undefined) bdrNode.parameters.code = finalCode;

  console.log('--- Step 3: Save workflow.json ---');
  await writeFile(WORKFLOW_FILE, JSON.stringify(workflow, null, 2), 'utf8');
  console.log('  Saved successfully. Now we need to push it.');
}

main().catch(console.error);
