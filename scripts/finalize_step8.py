import json

def process():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error:", e)
        return

    nodes = data.get('data', {}).get('nodes', [])
    if not nodes and 'nodes' in data:
        nodes = data['nodes']

    for node in nodes:
        if node['name'] == 'Validation':
            # Clean, stabilized Validation code for Step 8
            code = """
// Validation — Guaranteed Reply (clean, encoding-safe)

// ── Step 1: parse reply_text from Reply AI output ────────────
const replyPayload = $json ?? {};

const parseReply = (v) => {
  if (!v) return '';
  if (typeof v === 'object' && typeof v.reply_text === 'string') return v.reply_text.trim();
  if (typeof v === 'string') {
    try {
      const p = JSON.parse(v);
      if (p && typeof p.reply_text === 'string') return p.reply_text.trim();
    } catch {}
  }
  return '';
};

const raw_reply = parseReply(replyPayload.choices?.[0]?.message?.content)
  || parseReply(replyPayload.output_text)
  || parseReply(replyPayload.text)
  || parseReply(replyPayload)
  || '';

// ── Step 2: safety guard (user-specified logic) ───────────────
const isSafe = raw_reply.length > 0 && raw_reply.length < 600;
const fallback = "Sorry, I didn't catch that clearly. Please ask about price, location, delivery or exchange.";
const reply_text = isSafe ? raw_reply : fallback;

// ── Step 3: get event + session for downstream nodes ─────────
let base = {};
try {
  // We prioritize the most recent data from the Business Data Resolver
  // but fallback to Rules Layer if resolver was bypassed.
  const bdr = $json;
  if (bdr && bdr.rules_output) { base = bdr; }
  else {
    base = $json ?? {};
  }
} catch {}

const event = (base.event && typeof base.event === 'object') ? base.event : {};
const session = (base.session && typeof base.session === 'object') ? base.session : {};
const understanding_output = (base.understanding_output && typeof base.understanding_output === 'object') ? base.understanding_output : {};
const rules_output = (base.rules_output && typeof base.rules_output === 'object') ? base.rules_output : {};
const chat_id = event.chat_id ?? session.chat_id ?? null;
const now = Date.now();

// ── Step 4: session update logic ────────────────────────────
const isStartReset = event.event_type === 'start_reset' || event.event_type === 'deep_link_start';
const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
const nextHistory = (isStartReset ? [] : history)
  .concat([{ role: 'assistant', text: reply_text, timestamp: now }])
  .slice(-12);

const rulesUpdate = rules_output.session_update || {};
const updatedSession = {
  ...session,
  ...rulesUpdate,
  last_message_at: now,
  message_count: isStartReset ? 1 : (Math.max(0, Number(session.message_count ?? 0)) + 1),
  conversation_history: nextHistory,
};

// ── Step 5: Minimal Observability Layer (Step 8) ──────────────
const is_fallback = Boolean(base.understanding_meta?.fallback_applied || base.understanding_meta?.valid === false);
const is_clarification = ['clarification_needed', 'clarify_reference'].includes(rules_output.reply_mode);
const ai_confidence = Number(understanding_output.confidence ?? 0);

const _observability = {
  ai_confidence,
  is_fallback,
  is_clarification,
  timestamp: now
};

// ── Step 6: Return all fields downstream nodes depend on ─────
return {
  json: {
    event,
    chat_id,
    safe_to_send: true,
    reply_text,
    used_fallback: !isSafe,
    raw_reply_text: raw_reply,
    telegram_payload: {
      chat_id,
    },
    session_update_payload: {
      user_id: event.user_id ?? null,
      chat_id: chat_id,
      session: updatedSession,
      _observability,
    },
  },
};
"""
            node['parameters']['jsCode'] = code.strip()

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

process()
