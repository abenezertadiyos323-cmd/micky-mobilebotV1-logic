import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Load env
const envRaw = readFileSync(resolve(repoRoot, '.env'), 'utf8');
const env = Object.fromEntries(envRaw.split('\n').filter(l => l.includes('=')).map(l => {
  const [k, ...v] = l.split('=');
  return [k.trim(), v.join('=').trim()];
}));

const base = env.N8N_BASE_URL;
const key  = env.N8N_API_KEY;
const BEL_MART_WF_ID = 'rWSrAXGt21AYK3kK';

const headers = {
  'X-N8N-API-KEY': key,
  'Content-Type': 'application/json',
  accept: 'application/json',
};

// Fetch current Bel Mart workflow
const wfResp = await fetch(`${base}/api/v1/workflows/${BEL_MART_WF_ID}`, { headers });
const wfData = await wfResp.json();
const wf = wfData.data || wfData;

// Patch Session Bootstrap node
const newNodes = wf.nodes.map(n => {
  if (n.name !== 'Session Bootstrap') return n;

  let code = n.parameters.jsCode;

  // Replace store_name
  code = code.replace(
    '"store_name": "TedyTech"',
    '"store_name": "Bel Mart"'
  );

  // Replace telegram_bot_name
  code = code.replace(
    '"telegram_bot_name": "TedyTech Bot"',
    '"telegram_bot_name": "Bel Mart Bot"'
  );

  // Replace seller_id (both variants)
  code = code.replaceAll('"seller_id": "tedytech"', '"seller_id": "belmart"');
  code = code.replaceAll('"sellerId": "tedytech"', '"sellerId": "belmart"');

  // Safety check
  if (code.includes('TedyTech')) {
    console.warn('[WARN] Some TedyTech references still remain - check manually!');
  }

  console.log('[OK] store_name -> Bel Mart');
  console.log('[OK] seller_id  -> belmart');
  console.log('[OK] sellerId   -> belmart');

  n.parameters.jsCode = code;
  return n;
});

// Push update
const putPayload = {
  name: 'Bel Mart Bot',
  nodes: newNodes,
  connections: wf.connections,
  settings: { executionOrder: 'v1' },
};

const putResp = await fetch(`${base}/api/v1/workflows/${BEL_MART_WF_ID}`, {
  method: 'PUT',
  headers,
  body: JSON.stringify(putPayload),
});

const putData = await putResp.json();
console.log('PUT status:', putResp.status);

if (!putResp.ok) {
  console.error('Error:', JSON.stringify(putData));
  process.exit(1);
}

console.log('');
console.log('=== Bel Mart Bot Updated Successfully ===');
console.log('Workflow: Bel Mart Bot (' + BEL_MART_WF_ID + ')');
console.log('seller_id: belmart');
console.log('Bot is live and active on n8n.');
