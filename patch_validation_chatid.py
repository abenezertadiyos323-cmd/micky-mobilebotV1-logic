"""
Targeted fix for the Validation node:
- Safely tries BDR, then Set No-Resolver Output, then Rules Layer for the event context.
- This fixes the `chat_id is empty` error on the no-resolver path.
"""
import json, shutil
from datetime import datetime

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/validation-chat-id-fix-{ts}.json'
shutil.copy('workflow.json', backup_path)
print(f'Backup saved: {backup_path}')

val_node = next((n for n in w['nodes'] if n['name'] == 'Validation'), None)
if not val_node:
    print('ERROR: Validation node not found!')
    exit(1)

old_code = val_node['parameters']['jsCode']

# The exact block to replace - the cross-node reference section
old_block = """// ── Step 3: get event + session for downstream nodes ─────────
let base = {};
try {
  const bdr = $item(0).$node['Business Data Resolver'].json;
  if (bdr && bdr.rules_output) { base = bdr; }
  else {
    const rl = $item(0).$node['Rules Layer'].json;
    base = rl ?? {};
  }
} catch {}"""

new_block = """// ── Step 3: get event + session for downstream nodes ─────────
// Safely probe multiple upstream nodes — works for BOTH resolver and no-resolver paths
let base = {};

const safeNodeJson = (nodeName) => {
  try {
    const ref = $item(0).$node[nodeName];
    if (!ref) return null;
    const j = ref.json;
    if (j && typeof j === 'object') return j;
  } catch {}
  return null;
};

// Priority: BDR (resolver path) → Set No-Resolver Output (no-resolver path) → Rules Layer → empty
const bdrJson = safeNodeJson('Business Data Resolver');
if (bdrJson && bdrJson.event && bdrJson.event.chat_id) {
  base = bdrJson;
} else {
  const nroJson = safeNodeJson('Set No-Resolver Output');
  if (nroJson && nroJson.event && nroJson.event.chat_id) {
    base = nroJson;
  } else {
    const rlJson = safeNodeJson('Rules Layer');
    if (rlJson && typeof rlJson === 'object') {
      base = rlJson;
    }
  }
}"""

if old_block in old_code:
    new_code = old_code.replace(old_block, new_block)
    val_node['parameters']['jsCode'] = new_code
    print('[OK] Validation node patched — now correctly reads event on no-resolver path')
else:
    print('[WARN] Could not find exact block. Checking for partial match...')
    if "$item(0).$node['Business Data Resolver'].json" in old_code:
        print('Found the BDR reference — manual inspection needed')
        idx = old_code.find("// ── Step 3")
        print(repr(old_code[idx:idx+400]))
    else:
        print('Block not found at all - Validation code may have changed')
    exit(1)

with open('workflow.json', 'w', encoding='utf-8') as f:
    json.dump(w, f, indent=2, ensure_ascii=False)
print('workflow.json saved.')
