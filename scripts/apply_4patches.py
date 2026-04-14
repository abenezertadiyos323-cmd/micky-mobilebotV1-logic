"""
4 Surgical Patches — Abenier Bot Logic
Applied in sequence, each verified before saving.
"""
import json, shutil, re
from pathlib import Path
from datetime import datetime

WORKFLOW_PATH = Path(__file__).parent.parent / "workflow.json"
BACKUP_DIR    = Path(__file__).parent.parent / "backups"

def load():
    with open(WORKFLOW_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save(data):
    with open(WORKFLOW_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def backup():
    BACKUP_DIR.mkdir(exist_ok=True)
    ts  = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = BACKUP_DIR / f"workflow_pre_4patches_{ts}.json"
    shutil.copy2(WORKFLOW_PATH, dst)
    print(f"  ✓ Backup: {dst.name}")

def nodes_by_id(data, nid):
    """Return all matching nodes across nodes[] and activeVersion.nodes[]."""
    out = []
    for n in data.get("nodes", []):
        if n.get("id") == nid: out.append(n)
    for n in data.get("activeVersion", {}).get("nodes", []):
        if n.get("id") == nid: out.append(n)
    return out

def patch(node, old, new, label, field="jsCode"):
    code = node["parameters"].get(field, "")
    if old not in code:
        print(f"    ⚠  [{label}] snippet not found — skip")
        return False
    node["parameters"][field] = code.replace(old, new, 1)
    print(f"    ✓  [{label}]")
    return True

# ──────────────────────────────────────────────────────────────
# PATCH 1 — BDR: info/support result_type → 'store_info'
#   + Validation allowlist extended to include 'store_info'
# ──────────────────────────────────────────────────────────────
def patch1(data):
    print("\n[PATCH 1] BDR — info/support result_type + Validation allowlist")

    # The info/support block (after Phase1 fix5, result_mode='info' already set above)
    # Current state:
    #   } else if (resolverInput.flow === 'info' || resolverInput.flow === 'support') {
    #     result_type = 'no_match';
    #     result_mode = 'info';
    #     next_step = 'direct_answer';
    # We only need to change result_type = 'no_match' → 'store_info'
    # (result_mode and next_step are already correct from Phase1)

    OLD_BDR = "result_type = 'no_match';\n  result_mode = 'info';\n  next_step = 'direct_answer';"
    NEW_BDR = "result_type = 'store_info';\n  result_mode = 'info';\n  next_step = 'direct_answer';"

    for n in nodes_by_id(data, "business-data-resolver"):
        patch(n, OLD_BDR, NEW_BDR, "BDR result_type store_info")

    # Validation allowlist — add 'store_info' so it doesn't block
    OLD_VAL_LIST = (
        "!['single_product', 'multiple_options', 'no_match', 'out_of_stock', "
        "'clarification_needed', 'exchange_offer'].includes(resolver_output.result_type)"
    )
    NEW_VAL_LIST = (
        "!['single_product', 'multiple_options', 'no_match', 'out_of_stock', "
        "'clarification_needed', 'exchange_offer', 'store_info'].includes(resolver_output.result_type)"
    )
    for n in nodes_by_id(data, "side-effects"):
        patch(n, OLD_VAL_LIST, NEW_VAL_LIST, "Validation allowlist + store_info")


# ──────────────────────────────────────────────────────────────
# PATCH 2 — Validation: add length guard to effective_reply_text
# (Does NOT replace session/telegram payload — keeps workflow intact)
# ──────────────────────────────────────────────────────────────
def patch2(data):
    print("\n[PATCH 2] Validation — length guard on effective_reply_text")

    # Current (after Phase 1):
    #   const effective_reply_text = raw_safe_to_send ? reply_text : fallback_reply_text;
    # Proposed: also reject if reply is >600 chars (LLM runaway)
    OLD_EFF = "const effective_reply_text = raw_safe_to_send ? reply_text : fallback_reply_text;"
    NEW_EFF = (
        "const effective_reply_text = "
        "(raw_safe_to_send && reply_text.length > 0 && reply_text.length < 600) "
        "? reply_text : fallback_reply_text;"
    )
    for n in nodes_by_id(data, "side-effects"):
        patch(n, OLD_EFF, NEW_EFF, "Validation length guard")


# ──────────────────────────────────────────────────────────────
# PATCH 3 — Admin handoff notification: ALREADY EXISTS
# Admin Handoff Notify? + Admin Handoff Telegram Send run in
# parallel from Rules Layer (confirmed in connections audit).
# Adding new nodes would DUPLICATE the existing path and cause
# double admin messages. No code change needed.
# ──────────────────────────────────────────────────────────────
def patch3_verify(data):
    print("\n[PATCH 3] Admin handoff — verifying existing path")
    conns = data.get("connections", {})
    rl = conns.get("Rules Layer", {}).get("main", [[]])
    targets = [n.get("node") for n in rl[0]] if rl else []
    if "Admin Handoff Notify?" in targets:
        print("    ✓  Admin Handoff Notify? already connected from Rules Layer")
        print("    ✓  Admin Handoff Telegram Send already in workflow")
        print("    ℹ  No new nodes added — existing path is correct, adding would duplicate")
    else:
        print("    ✗  Admin Handoff Notify? NOT found in connections — manual check needed")


# ──────────────────────────────────────────────────────────────
# PATCH 4 — Rules Layer: negotiation only needs current_interest
# (removes the && current_flow requirement)
# ──────────────────────────────────────────────────────────────
def patch4(data):
    print("\n[PATCH 4] Rules Layer — negotiation: anchor on current_interest only")

    OLD_NEG = (
        "const hasAnchoredContext = Boolean(\n"
        "    session.flow_context?.buy_flow?.current_interest\n"
        "    && session.conversation_state?.current_flow\n"
        "  );"
    )
    NEW_NEG = (
        "const hasAnchoredContext = Boolean(\n"
        "    session.flow_context?.buy_flow?.current_interest\n"
        "  );"
    )
    for n in nodes_by_id(data, "rules-layer"):
        patch(n, OLD_NEG, NEW_NEG, "Rules negotiation anchor")


# ──────────────────────────────────────────────────────────────
# VERIFY
# ──────────────────────────────────────────────────────────────
def verify(data):
    print("\n" + "="*60)
    print("  FINAL VERIFICATION (nodes[] only)")
    print("="*60)

    passed, failed = [], []

    def check(cond, msg):
        (passed if cond else failed).append(msg)
        print(f"  {'✓' if cond else '✗'}  {msg}")

    by_id = {n.get("id"): n for n in data.get("nodes", [])}

    # Patch 1
    bdr = by_id.get("business-data-resolver", {})
    bdrc = bdr.get("parameters", {}).get("jsCode", "")
    check("result_type = 'store_info'" in bdrc,
          "P1  BDR: result_type = store_info for info/support")
    check("result_type = 'no_match';\n  result_mode = 'info'" not in bdrc,
          "P1  BDR: old no_match for info/support removed")
    val = by_id.get("side-effects", {})
    valc = val.get("parameters", {}).get("jsCode", "")
    check("'store_info'].includes(resolver_output.result_type)" in valc,
          "P1  Validation: store_info in allowed result_types")

    # Patch 2
    check(
        "(raw_safe_to_send && reply_text.length > 0 && reply_text.length < 600)" in valc,
        "P2  Validation: length guard on effective_reply_text"
    )

    # Patch 3
    conns = data.get("connections", {})
    rl    = conns.get("Rules Layer", {}).get("main", [[]])
    targets = [n.get("node") for n in rl[0]] if rl else []
    check("Admin Handoff Notify?" in targets,
          "P3  Admin handoff: connected from Rules Layer (existing path confirmed)")

    # Patch 4
    rl_node = by_id.get("rules-layer", {})
    rlc = rl_node.get("parameters", {}).get("jsCode", "")
    check(
        "session.flow_context?.buy_flow?.current_interest\n    && session.conversation_state?.current_flow" not in rlc,
        "P4  Rules: current_flow removed from hasAnchoredContext"
    )
    check(
        "Boolean(\n    session.flow_context?.buy_flow?.current_interest\n  );" in rlc,
        "P4  Rules: hasAnchoredContext checks current_interest only"
    )

    print(f"\n  Results: {len(passed)} passed / {len(failed)} failed")
    if failed:
        for f in failed: print(f"    ✗ {f}")
    return len(failed) == 0


# ──────────────────────────────────────────────────────────────
# MAIN
# ──────────────────────────────────────────────────────────────
def main():
    print("="*60)
    print("  Abenier Bot Logic — 4 Surgical Patches")
    print("="*60)

    print("\n[BACKUP]")
    backup()

    data = load()
    print(f"  Loaded {len(data.get('nodes', []))} nodes")

    patch1(data)
    patch2(data)
    patch3_verify(data)
    patch4(data)

    ok = verify(data)
    save(data)

    if ok:
        print("\n✅ All 4 patches applied and verified.")
        print("   Upload workflow.json to n8n and run the 8 test cases.")
    else:
        print("\n⚠  Saved with failures — review above before uploading.")

if __name__ == "__main__":
    main()
