import dotenv from 'dotenv';
import { resolve } from 'node:path';

dotenv.config({ path: resolve(process.cwd(), '.env') });
dotenv.config({ path: resolve(process.cwd(), '.env.local'), override: true });

const workflowId = 'hc55q2zfas7gG1yu';
const baseUrl = process.env.N8N_BASE_URL?.trim();
const apiKey = process.env.N8N_API_KEY?.trim();

if (!baseUrl || !apiKey) {
  throw new Error('Missing N8N_BASE_URL or N8N_API_KEY');
}

let raw = '';
for await (const chunk of process.stdin) {
  raw += chunk;
}

if (!raw.trim()) {
  throw new Error('Expected workflow JSON on stdin');
}

const workflow = JSON.parse(raw);

const findNode = (name) => {
  const node = workflow.nodes.find((item) => item?.name === name);
  if (!node) {
    throw new Error(`Node not found: ${name}`);
  }
  return node;
};

const eventNormalizer = findNode('Event Normalizer');
eventNormalizer.parameters.jsCode = eventNormalizer.parameters.jsCode.replace(
  "      chatId: String(chatIdRaw || ''),",
  "      chatId: String(chatIdRaw || ''),\n      chat_id: String(chatIdRaw || ''),",
);

const validation = findNode('Validation');
validation.parameters.jsCode = validation.parameters.jsCode
  .replace(
    "const session = base.session && typeof base.session === 'object' ? base.session : {};",
    "const session = base.session && typeof base.session === 'object' ? base.session : {};\nconst chat_id = event.chat_id ?? event.chatId ?? session.chat_id ?? null;",
  )
  .replace(
    /const fallback_reply_text = '.*?';/s,
    "const fallback_reply_text = 'Sorry, I didn\\'t understand. Please ask about price, location, or exchange.';",
  )
  .replace(
    "    event,\n    session,\n    client_config,",
    "    event,\n    session,\n    chat_id,\n    client_config,",
  )
  .replace(
    "telegram_payload: { chat_id: event.chatId ?? null, text: effective_reply_text }",
    "telegram_payload: { chat_id, text: effective_reply_text }",
  )
  .replace(
    "session_update_payload: { userId: event.userId ?? null, chatId: event.chatId ?? null, session: updatedSession }",
    "session_update_payload: { userId: event.userId ?? null, chatId: chat_id, session: updatedSession }",
  );

const telegramSend = findNode('Telegram Send');
telegramSend.parameters = {
  chatId: "={{ $json.event?.chat_id || $json.chat_id || $json.message?.chat?.id }}",
  text: "={{ $json.reply_text || 'Sorry, something went wrong. Please try again.' }}",
  parse_mode: 'HTML',
};

const authHeaders = {
  accept: 'application/json',
  Authorization: `Bearer ${apiKey}`,
  'X-N8N-API-KEY': apiKey,
};

const url = new URL(`api/v1/workflows/${encodeURIComponent(workflowId)}`, baseUrl).toString();
const payload = {
  name: workflow.name,
  nodes: workflow.nodes,
  connections: workflow.connections,
};

if (workflow.settings && typeof workflow.settings === 'object' && !Array.isArray(workflow.settings)) {
  payload.settings = workflow.settings;
}

const putResponse = await fetch(url, {
  method: 'PUT',
  headers: {
    ...authHeaders,
    'content-type': 'application/json',
  },
  body: JSON.stringify(payload),
});
const putText = await putResponse.text();
if (!putResponse.ok) {
  throw new Error(`PUT failed (${putResponse.status} ${putResponse.statusText}): ${putText}`);
}

const getResponse = await fetch(url, {
  method: 'GET',
  headers: authHeaders,
});
const getText = await getResponse.text();
if (!getResponse.ok) {
  throw new Error(`GET failed (${getResponse.status} ${getResponse.statusText}): ${getText}`);
}

const parsed = JSON.parse(getText);
const live = parsed?.data ?? parsed?.workflow ?? parsed;
console.log(JSON.stringify({
  workflowId,
  name: live?.name ?? null,
  active: Boolean(live?.active),
  nodes: ['Event Normalizer', 'Validation', 'Telegram Send'].map((name) => ({
    name,
    parameters: live?.nodes?.find((node) => node?.name === name)?.parameters ?? null,
  })),
}, null, 2));
