import json, shutil
from datetime import datetime
from pathlib import Path

WORKFLOW_PATH = Path(__file__).parent.parent / "workflow.json"
BACKUP_DIR    = Path(__file__).parent.parent / "backups"

# ── The new clean Validation jsCode ──────────────────────────
# Implements the user's exact proposed logic:
#   - read reply_text safely
#   - length+presence guard
#   - fallback if unsafe
#   - always safe_to_send: true
# Plus the minimum two fields downstream nodes need:
#   - telegram_payload.chat_id  (Telegram Send node reads this)
#   - session_update_payload     (Session Save node reads this)
# All Amharic removed → no encoding issues.
CLEAN_VALIDATION_CODE = r"""// Validation — Guaranteed Reply (clean, encoding-safe)

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
  const bdr = $item(0).$node['Business Data Resolver'].json;
  if (bdr && bdr.rules_output) { base = bdr; }
  else {
    const rl = $item(0).$node['Rules Layer'].json;
    base = rl ?? {};
  }
} catch {}

const event   = (base.event   && typeof base.event   === 'object') ? base.event   : {};
const session = (base.session && typeof base.session === 'object') ? base.session : {};
const now = Date.now();

// ── Step 4: minimal session update for Session Save node ─────
const isStartReset = event.event_type === 'start_reset' || event.event_type === 'deep_link_start';
const history = Array.isArray(session.conversation_history) ? session.conversation_history : [];
const nextHistory = (isStartReset ? [] : history)
  .concat([{ role: 'assistant', text: reply_text, timestamp: now }])
  .slice(-12);

const updatedSession = {
  ...session,
  last_message_at: now,
  message_count: isStartReset ? 1 : (Math.max(0, Number(session.message_count ?? 0)) + 1),
  conversation_history: nextHistory,
};

// ── Step 5: return all fields downstream nodes depend on ─────
return {
  json: {
    safe_to_send: true,
    reply_text,
    used_fallback: !isSafe,
    raw_reply_text: raw_reply,
    telegram_payload: {
      chat_id: event.chatId ?? null,
    },
    session_update_payload: {
      userId: event.userId ?? null,
      chatId: event.chatId ?? null,
      session: updatedSession,
    },
  },
};"""

def main():
    # Backup
    BACKUP_DIR.mkdir(exist_ok=True)
    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = BACKUP_DIR / f"workflow_pre_valclean_{ts}.json"
    shutil.copy2(WORKFLOW_PATH, dst)
    print(f"[BACKUP] {dst.name}")

    # Load
    wf = json.load(open(WORKFLOW_PATH, encoding="utf-8"))

    # Patch both nodes[] and activeVersion.nodes[]
    patched = 0
    for node in list(wf.get("nodes", [])) + list(wf.get("activeVersion", {}).get("nodes", [])):
        if node.get("id") == "side-effects":
            node["parameters"]["jsCode"] = CLEAN_VALIDATION_CODE
            patched += 1
            print(f"  ✓ Replaced jsCode in '{node.get('name')}' (id={node.get('id')})")

    if patched == 0:
        print("  ✗ Node 'side-effects' not found!")
        return

    # Verify the code is in there and doesn't have Amharic bytes
    found_dirty = False
    for node in wf.get("nodes", []):
        if node.get("id") == "side-effects":
            code = node["parameters"]["jsCode"]
            has_amharic = any(ord(c) > 0x1300 and ord(c) < 0x1400 for c in code)
            has_reply   = "isSafe ? raw_reply : fallback" in code
            has_chat_id = "telegram_payload" in code
            has_session = "session_update_payload" in code
            print(f"\n[VERIFY]")
            print(f"  {'✓' if not has_amharic else '✗'}  No Ethiopic codepoints (encoding-safe)")
            print(f"  {'✓' if has_reply   else '✗'}  Safety guard present")
            print(f"  {'✓' if has_chat_id else '✗'}  telegram_payload.chat_id preserved")
            print(f"  {'✓' if has_session else '✗'}  session_update_payload preserved")
            if has_amharic: found_dirty = True

    # Save
    json.dump(wf, open(WORKFLOW_PATH, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    if not found_dirty:
        print("\n  ✅ workflow.json saved — ready to push")
    else:
        print("\n  ⚠  Amharic still present — check encoding")

if __name__ == "__main__":
    main()
