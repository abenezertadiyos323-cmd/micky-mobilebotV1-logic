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
const baseUrl = env.N8N_BASE_URL;
const apiKey = env.N8N_API_KEY;
const workflowId = 'hc55q2zfas7gG1yu';
const webhookUrl = 'https://n8n-production-c119.up.railway.app/webhook/7aec4327-c483-4b7e-b3fe-0ced6466cd3e/webhook';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const text = `selam http fix ${Date.now()}`;
  const nowSeconds = Math.floor(Date.now() / 1000);

  const webhookRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        chat: { id: 5948326732, type: 'private' },
        from: { id: 5948326732, is_bot: false, first_name: 'Codex', username: 'codex_test' },
        text,
        message_id: Number(String(Date.now()).slice(-6)),
        date: nowSeconds,
      },
    }),
  });
  const webhookBody = await webhookRes.text();

  await sleep(5000);

  const listRes = await fetch(`${baseUrl}/api/v1/executions?workflowId=${workflowId}&limit=3`, {
    headers: { 'X-N8N-API-KEY': apiKey },
  });
  const list = await listRes.json();
  const latest = (list.data || [])[0];
  if (!latest) {
    throw new Error('No latest execution found after webhook test');
  }

  const execRes = await fetch(`${baseUrl}/api/v1/executions/${latest.id}?includeData=true`, {
    headers: { 'X-N8N-API-KEY': apiKey },
  });
  const exec = await execRes.json();
  const wf = exec.data || exec;
  const rd = wf.data?.resultData?.runData || {};
  const pick = (name) => rd[name]?.[0] || null;
  const json = (name) => pick(name)?.data?.main?.[0]?.[0]?.json || null;

  const replyTransport = json('Reply AI');
  const replyNormalize = json('Reply AI Normalize');
  const validation = json('Validation');
  const sessionSaveMerge = json('Session Save Merge');
  const sessionSave = json('Session Save');

  console.log(JSON.stringify({
    webhookStatus: webhookRes.status,
    webhookBody,
    executionId: wf.id,
    status: wf.status,
    replyAiTransportExecutionStatus: pick('Reply AI')?.executionStatus ?? null,
    replyAiTransportExecutionTime: pick('Reply AI')?.executionTime ?? null,
    replyAiTransportHasChoices: Boolean(replyTransport?.choices?.[0]?.message?.content),
    replyAiTransportPreservedEvent: replyTransport?.event?.chat_id ?? null,
    replyAiNormalizeExecutionStatus: pick('Reply AI Normalize')?.executionStatus ?? null,
    replyAiNormalizeReplyText: replyNormalize?.reply_text ?? null,
    validationUsedFallback: validation?.used_fallback ?? null,
    validationReplyText: validation?.reply_text ?? null,
    sessionSaveMergeChatId: sessionSaveMerge?.chat_id ?? null,
    sessionSaveMergeUserId: sessionSaveMerge?.event?.userId ?? null,
    sessionSaveExecutionStatus: pick('Session Save')?.executionStatus ?? null,
    sessionSaveOk: sessionSave?.ok ?? null,
    workflowError: wf.data?.resultData?.error ?? null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
