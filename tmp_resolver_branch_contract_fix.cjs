const fs = require('fs');
const path = require('path');

function readEnv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter(Boolean)
      .filter((line) => !line.trim().startsWith('#'))
      .map((line) => {
        const idx = line.indexOf('=');
        return [line.slice(0, idx), line.slice(idx + 1)];
      }),
  );
}

const env = readEnv(path.join(process.cwd(), '.env'));
const workflowId = 'hc55q2zfas7gG1yu';
const baseUrl = env.N8N_BASE_URL;
const apiKey = env.N8N_API_KEY;

const resolverMergeNode = {
  parameters: {
    mode: 'combine',
    combineBy: 'combineByPosition',
    numberInputs: 2,
    options: {},
  },
  id: 'resolver-context-merge-20260408',
  name: 'Resolver Context Merge',
  type: 'n8n-nodes-base.merge',
  typeVersion: 3.1,
  position: [2640, 304],
};

async function main() {
  const getRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`, {
    headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
  });
  if (!getRes.ok) {
    throw new Error(`GET workflow failed: ${getRes.status} ${await getRes.text()}`);
  }
  const workflow = await getRes.json();

  const backupDir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(
    backupDir,
    `resolver-branch-contract-fix-prod-${workflowId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
  );
  fs.writeFileSync(backupPath, JSON.stringify(workflow, null, 2));

  const productSearch = workflow.nodes.find((node) => node.name === 'Product Search (Convex Test)');
  if (!productSearch) {
    throw new Error('Product Search (Convex Test) node not found');
  }

  productSearch.parameters.url = '={{ "https://fastidious-schnauzer-265.convex.site/http/products-search" }}';
  productSearch.parameters.authentication = 'none';
  productSearch.parameters.sendHeaders = true;
  productSearch.parameters.headerParameters = {
    parameters: [{ name: 'Content-Type', value: 'application/json' }],
  };
  productSearch.parameters.sendBody = true;
  productSearch.parameters.specifyBody = 'json';
  productSearch.parameters.options = {
    responsePropertyName: 'convex_response',
  };
  productSearch.alwaysOutputData = true;
  productSearch.onError = 'continueRegularOutput';

  const hasResolverMerge = workflow.nodes.some((node) => node.name === 'Resolver Context Merge');
  if (!hasResolverMerge) {
    workflow.nodes.push(resolverMergeNode);
  } else {
    const node = workflow.nodes.find((item) => item.name === 'Resolver Context Merge');
    node.parameters = resolverMergeNode.parameters;
    node.type = resolverMergeNode.type;
    node.typeVersion = resolverMergeNode.typeVersion;
    node.position = resolverMergeNode.position;
    node.id = resolverMergeNode.id;
  }

  const shouldResolve = workflow.connections['Should Resolve'];
  if (!shouldResolve?.main?.[0]) {
    throw new Error('Should Resolve true branch connection missing');
  }

  const trueBranch = shouldResolve.main[0];
  const withoutExistingMerge = trueBranch.filter((item) => item.node !== 'Resolver Context Merge');
  const hasProductSearch = withoutExistingMerge.some((item) => item.node === 'Product Search (Convex Test)');
  if (!hasProductSearch) {
    withoutExistingMerge.push({ node: 'Product Search (Convex Test)', type: 'main', index: 0 });
  }
  withoutExistingMerge.push({ node: 'Resolver Context Merge', type: 'main', index: 0 });
  shouldResolve.main[0] = withoutExistingMerge;

  workflow.connections['Product Search (Convex Test)'] = {
    main: [[{ node: 'Resolver Context Merge', type: 'main', index: 1 }]],
  };

  workflow.connections['Resolver Context Merge'] = {
    main: [[{ node: 'Business Data Resolver', type: 'main', index: 0 }]],
  };

  const baseLocal = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'workflow.json'), 'utf8'));
  const payload = {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: baseLocal.settings,
    staticData: workflow.staticData ?? {},
    pinData: workflow.pinData ?? {},
  };

  const putRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const putText = await putRes.text();
  if (!putRes.ok) {
    throw new Error(`PUT workflow failed: ${putRes.status} ${putText}`);
  }

  console.log(JSON.stringify({
    backupPath,
    status: putRes.status,
    response: JSON.parse(putText),
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
