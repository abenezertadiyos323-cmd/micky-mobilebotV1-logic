"""
Phase 1 — Fix5 Targeted Patch + Final Verification
Patches activeVersion.nodes[] for Fix5, then verifies all fixes
across the operational nodes[] array only (which n8n actually uses).
"""
import json
import re
from pathlib import Path

WORKFLOW_PATH = Path(__file__).parent.parent / "workflow.json"


def load():
    with open(WORKFLOW_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save(data):
    with open(WORKFLOW_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def patch_js(node, old, new, label):
    code = node["parameters"].get("jsCode", "")
    if old not in code:
        print(f"    ⚠  [{label}] Snippet NOT FOUND")
        return False
    node["parameters"]["jsCode"] = code.replace(old, new, 1)
    print(f"    ✓  [{label}] patched")
    return True


# ─────────────────────────────────────────────────────────────
# FIX 5 — apply to activeVersion.nodes[] (nodes[] already done)
# ─────────────────────────────────────────────────────────────
OLD_5A = (
    "let constraintMatchFailed = false;\n"
    "if (products.length > 0) {"
)
NEW_5A = (
    "let constraintMatchFailed = false;\n"
    "const isNonProductFlow = resolverInput.flow === 'info' || resolverInput.flow === 'support';\n"
    "if (products.length > 0) {"
)

OLD_5B = (
    "if (constraintMatchFailed && result_type !== 'clarification_needed' "
    "&& result_type !== 'exchange_offer') {"
)
NEW_5B = (
    "if (!isNonProductFlow && constraintMatchFailed && result_type !== 'clarification_needed' "
    "&& result_type !== 'exchange_offer') {"
)


def fix5_active_version(data):
    print("\n[FIX 5 — activeVersion.nodes] BDR info/support guard")
    for node in data.get("activeVersion", {}).get("nodes", []):
        if node.get("id") == "business-data-resolver":
            # Check what state it's in
            code = node["parameters"].get("jsCode", "")
            if "isNonProductFlow" in code:
                print("    ℹ  already patched — skip 5A")
            else:
                patch_js(node, OLD_5A, NEW_5A, "Fix5A activeVersion")

            if "!isNonProductFlow &&" in code:
                print("    ℹ  already patched — skip 5B")
            else:
                patch_js(node, OLD_5B, NEW_5B, "Fix5B activeVersion")


# ─────────────────────────────────────────────────────────────
# Also ensure Fix5 snippets are consistent in nodes[] too
# (in case OLD_5A style exists there instead of the partial one)
# ─────────────────────────────────────────────────────────────
def fix5_nodes(data):
    print("\n[FIX 5 — nodes[]] BDR info/support guard (ensure complete)")
    for node in data.get("nodes", []):
        if node.get("id") == "business-data-resolver":
            code = node["parameters"].get("jsCode", "")
            if "isNonProductFlow" not in code:
                patch_js(node, OLD_5A, NEW_5A, "Fix5A nodes[]")
            else:
                print("    ℹ  Fix5A already applied in nodes[]")

            code = node["parameters"].get("jsCode", "")
            if "!isNonProductFlow &&" not in code:
                patch_js(node, OLD_5B, NEW_5B, "Fix5B nodes[]")
            else:
                print("    ℹ  Fix5B already applied in nodes[]")


# ─────────────────────────────────────────────────────────────
# VERIFY — operational nodes[] only
# ─────────────────────────────────────────────────────────────
def verify(data):
    print("\n" + "=" * 60)
    print("  FINAL VERIFICATION (nodes[] only — what n8n uses)")
    print("=" * 60)

    passed = []
    failed = []

    def check(condition, msg):
        if condition:
            passed.append(msg)
            print(f"  ✓  {msg}")
        else:
            failed.append(msg)
            print(f"  ✗  {msg}")

    nodes_by_id = {}
    for node in data.get("nodes", []):
        nodes_by_id[node.get("id")] = node

    # Fix 1 — Validation
    v = nodes_by_id.get("side-effects", {})
    vc = v.get("parameters", {}).get("jsCode", "")
    check("reply_text: effective_reply_text," in vc,         "Fix1  Validation: reply_text = effective_reply_text")
    check("raw_reply_text: reply_text," in vc,               "Fix1  Validation: raw_reply_text exposed")
    check("used_fallback: !raw_safe_to_send," in vc,         "Fix1  Validation: used_fallback flag")
    check("ይቅርታ፣ ያልተረዳሁት" in vc,                          "Fix1  Validation: Amharic fallback text (no mojibake)")
    check(
        "text: effective_reply_text, timestamp: now" in vc or
        ".concat([{ role: 'assistant', text: effective_reply_text" in vc,
        "Fix1  Validation: history records effective_reply_text"
    )
    check("'ÃƒÆ'" not in vc,                                 "Fix1  Validation: mojibake removed")

    # Fix 2 — Rules Layer
    r = nodes_by_id.get("rules-layer", {})
    rc = r.get("parameters", {}).get("jsCode", "")
    check(
        "'start_reset' || event.event_type === 'deep_link_start'" not in rc,
        "Fix2  Rules: deep_link_start removed from start_reset condition"
    )
    check(
        "event.event_type === 'start_reset')" in rc,
        "Fix2  Rules: isolated start_reset condition"
    )
    check(
        "else if (event.event_type === 'deep_link_start')" in rc,
        "Fix2  Rules: deep_link_start has own reachable branch"
    )

    # Fix 3 — cross-node error logging
    jg = nodes_by_id.get("validation-node", {})
    jgc = jg.get("parameters", {}).get("jsCode", "")
    check("SESSION_BOOTSTRAP_NODE" in jgc or "console.error" in jgc,
          "Fix3  JSON Guard: error logging present")

    bdr = nodes_by_id.get("business-data-resolver", {})
    bdrc = bdr.get("parameters", {}).get("jsCode", "")
    check("RULES_NODE" in bdrc or ("console.error" in bdrc and "cross_node_ref" in bdrc),
          "Fix3  BDR: error logging present")

    val = nodes_by_id.get("side-effects", {})
    valc = val.get("parameters", {}).get("jsCode", "")
    check("BDR_NODE" in valc or ("console.error" in valc and "cross_node_ref" in valc),
          "Fix3  Validation: error logging present")

    # Fix 4 — sellerId dynamic
    ps = nodes_by_id.get("product-search-convex-test", {})
    psc = ps.get("parameters", {}).get("jsonBody", "")
    check("sellerId: 'tedytech'" not in psc,       "Fix4  Product Search: hardcoded sellerId removed")
    check("cfg.store_name" in psc,                  "Fix4  Product Search: dynamic sellerId via store_name")

    # Fix 5 — BDR info guard
    check("isNonProductFlow" in bdrc,               "Fix5  BDR: isNonProductFlow flag declared")
    check("!isNonProductFlow && constraintMatchFailed" in bdrc,
          "Fix5  BDR: constraintMatchFailed guarded by isNonProductFlow")

    # Fix 8 — Callback
    cb = nodes_by_id.get("callback-action-handler", {})
    cbc = cb.get("parameters", {}).get("jsCode", "")
    check("ልውውጡ ተረጋግጧል" in cbc,               "Fix8  Callback: Amharic confirm text")
    check("ልውውጡ ተሰርዟል" in cbc,                "Fix8  Callback: Amharic cancel text")
    check("unknown_callback" in cbc,               "Fix8  Callback: unknown_callback warning log")

    print(f"\n  Results: {len(passed)} passed / {len(failed)} failed")

    if failed:
        print("\n  ✗ FAILED checks:")
        for f in failed:
            print(f"    - {f}")
        return False

    print("\n  ✅ ALL CHECKS PASSED — workflow.json is ready to import into n8n")
    return True


def main():
    print("=" * 60)
    print("  Phase 1 — Fix5 Fixup + Final Verification")
    print("=" * 60)

    data = load()

    fix5_nodes(data)
    fix5_active_version(data)

    ok = verify(data)

    save(data)

    if ok:
        print("\n✅ workflow.json saved. Upload to n8n and run all 8 test cases.")
    else:
        print("\n⚠  Saved with failures. Check output above before uploading.")


if __name__ == "__main__":
    main()
