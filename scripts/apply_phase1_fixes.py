"""
Phase 1 Surgical Fix Script — Abenier Bot Logic Workflow
Applies all 6 active fixes to workflow.json without touching architecture.
Creates a timestamped backup before making any changes.
"""
import json
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

WORKFLOW_PATH = Path(__file__).parent.parent / "workflow.json"
BACKUP_DIR = Path(__file__).parent.parent / "backups"

# ── helpers ──────────────────────────────────────────────────────────────────

def load_workflow():
    with open(WORKFLOW_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def save_workflow(data):
    with open(WORKFLOW_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

def backup():
    BACKUP_DIR.mkdir(exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    dst = BACKUP_DIR / f"workflow_pre_phase1_{ts}.json"
    shutil.copy2(WORKFLOW_PATH, dst)
    print(f"  ✓ Backup created: {dst.name}")
    return dst

def find_nodes(data, node_id):
    """Return all node dicts matching node_id across nodes[] and activeVersion.nodes[]."""
    results = []
    for node in data.get("nodes", []):
        if node.get("id") == node_id:
            results.append(node)
    for node in data.get("activeVersion", {}).get("nodes", []):
        if node.get("id") == node_id:
            results.append(node)
    return results

def patch_js(node, old_snippet, new_snippet, label):
    """Patch jsCode in a code node. Returns True on success."""
    code = node["parameters"].get("jsCode", "")
    if old_snippet not in code:
        print(f"    ⚠  [{label}] Snippet NOT FOUND — skipping (may already be patched)")
        return False
    node["parameters"]["jsCode"] = code.replace(old_snippet, new_snippet, 1)
    print(f"    ✓  [{label}] jsCode patched")
    return True

def patch_json_body(node, old_snippet, new_snippet, label):
    """Patch jsonBody in an HTTP request node."""
    body = node["parameters"].get("jsonBody", "")
    if old_snippet not in body:
        print(f"    ⚠  [{label}] Snippet NOT FOUND in jsonBody — skipping")
        return False
    node["parameters"]["jsonBody"] = body.replace(old_snippet, new_snippet, 1)
    print(f"    ✓  [{label}] jsonBody patched")
    return True

# ── fixes ────────────────────────────────────────────────────────────────────

def fix1_validation_reply_text(data):
    """
    FIX 1 — Validation node:
    A) Fix fallback_reply_text mojibake → real Amharic + English
    B) History records effective_reply_text, not empty reply_text
    C) Expose effective_reply_text as reply_text in return
    D) Add used_fallback and raw_reply_text diagnostic fields
    """
    print("\n[FIX 1] Validation node — reply_text / fallback / history")
    nodes = find_nodes(data, "side-effects")
    if not nodes:
        print("  ✗ Node 'side-effects' not found!")
        return

    for node in nodes:
        # A) Fix mojibake fallback text
        # The original string starts with 'ÃƒÆ'... which is the garbled prefix
        code = node["parameters"].get("jsCode", "")
        # Replace the entire fallback_reply_text assignment
        old_fallback_start = "const fallback_reply_text = '"
        if old_fallback_start in code:
            # Find and replace the whole assignment line
            # It ends with the English part: "(Sorry, I didn\\'t understand...)';"
            pattern = r"const fallback_reply_text = '.*?';"
            fallback_replacement = (
                "const fallback_reply_text = "
                "'ይቅርታ፣ ያልተረዳሁት ይመስለኛል። ስለ ዋጋ፣ አድራሻ ወይም ልውውጥ ጠይቁ።\\n"
                "(Sorry, could not process your request. Please ask about price, location, or exchange.)'"
                ";"
            )
            new_code = re.sub(pattern, fallback_replacement, code, count=1, flags=re.DOTALL)
            if new_code != code:
                node["parameters"]["jsCode"] = new_code
                code = new_code
                print("    ✓  [FIX 1A] fallback_reply_text fixed (mojibake removed)")
            else:
                print("    ⚠  [FIX 1A] fallback pattern not matched — skipping")
        else:
            print("    ⚠  [FIX 1A] fallback_reply_text not found")

        # B) History records effective_reply_text
        patch_js(
            node,
            ".concat(safe_to_send ? [{ role: 'assistant', text: reply_text, timestamp: now }] : [])",
            ".concat([{ role: 'assistant', text: effective_reply_text, timestamp: now }])",
            "FIX 1B history"
        )

        # C + D) Return: expose effective_reply_text as reply_text, add diagnostics
        patch_js(
            node,
            "    reply_text,\n    valid,\n    issues,\n    safe_to_send: true,\n    original_safe_to_send: raw_safe_to_send,",
            "    reply_text: effective_reply_text,\n    raw_reply_text: reply_text,\n    used_fallback: !raw_safe_to_send,\n    valid,\n    issues,\n    safe_to_send: true,\n    original_safe_to_send: raw_safe_to_send,",
            "FIX 1C/D return fields"
        )

    print("  FIX 1 done")


def fix2_rules_deep_link(data):
    """
    FIX 2 — Rules Layer:
    Split start_reset and deep_link_start conditions so deep_link_start
    actually reaches the business_resolve branch.
    """
    print("\n[FIX 2] Rules Layer — deep_link_start unreachable branch")
    nodes = find_nodes(data, "rules-layer")
    if not nodes:
        print("  ✗ Node 'rules-layer' not found!")
        return

    for node in nodes:
        patch_js(
            node,
            "if (event.event_type === 'start_reset' || event.event_type === 'deep_link_start') {",
            "if (event.event_type === 'start_reset') {",
            "FIX 2 condition split"
        )

    print("  FIX 2 done")


def fix3_cross_node_logging(data):
    """
    FIX 3 — Harden cross-node references with explicit error logging.
    Adds console.error on empty/failed cross-node reads.
    """
    print("\n[FIX 3] Cross-node reference hardening")

    # 3A — Understanding JSON Guard
    nodes = find_nodes(data, "validation-node")
    if not nodes:
        print("  ✗ Node 'validation-node' not found!")
    else:
        for node in nodes:
            patch_js(
                node,
                "const base = (() => {\n  try {\n    return $item(0).$node['Session Bootstrap'].json ?? {};\n  } catch {\n    return {};\n  }\n})();",
                "const SESSION_BOOTSTRAP_NODE = 'Session Bootstrap';\nconst base = (() => {\n  try {\n    const ref = $item(0).$node[SESSION_BOOTSTRAP_NODE].json;\n    if (!ref || typeof ref !== 'object') {\n      console.error(JSON.stringify({ node: 'Understanding JSON Guard', error: 'cross_node_ref_empty', ref_node: SESSION_BOOTSTRAP_NODE }));\n      return {};\n    }\n    return ref;\n  } catch (e) {\n    console.error(JSON.stringify({ node: 'Understanding JSON Guard', error: 'cross_node_ref_failed', ref_node: SESSION_BOOTSTRAP_NODE, message: e.message }));\n    return {};\n  }\n})();",
                "FIX 3A JSON Guard cross-node"
            )

    # 3B — Business Data Resolver
    nodes = find_nodes(data, "business-data-resolver")
    if not nodes:
        print("  ✗ Node 'business-data-resolver' not found!")
    else:
        for node in nodes:
            patch_js(
                node,
                "let base = {};\ntry {\n  base = $item(0).$node['Rules Layer'].json ?? {};\n} catch {\n  base = {};\n}",
                "const RULES_NODE = 'Rules Layer';\nlet base = {};\ntry {\n  const ref = $item(0).$node[RULES_NODE].json;\n  if (!ref || !ref.rules_output) {\n    console.error(JSON.stringify({ node: 'Business Data Resolver', error: 'cross_node_ref_empty_or_no_rules', ref_node: RULES_NODE }));\n  }\n  base = ref ?? {};\n} catch (e) {\n  console.error(JSON.stringify({ node: 'Business Data Resolver', error: 'cross_node_ref_failed', ref_node: RULES_NODE, message: e.message }));\n}",
                "FIX 3B BDR cross-node"
            )

    # 3C — Validation
    nodes = find_nodes(data, "side-effects")
    if not nodes:
        print("  ✗ Node 'side-effects' not found for fix 3C!")
    else:
        for node in nodes:
            patch_js(
                node,
                "let base = {};\ntry {\n  base = $item(0).$node['Business Data Resolver'].json ?? {};\n} catch {\n  base = {};\n}\nif (!base.rules_output) {\n  try {\n    base = $item(0).$node['Rules Layer'].json ?? base;\n  } catch {}\n}",
                "const BDR_NODE = 'Business Data Resolver';\nconst RULES_NODE_V = 'Rules Layer';\nlet base = {};\ntry {\n  const bdrRef = $item(0).$node[BDR_NODE].json;\n  if (bdrRef && bdrRef.rules_output) {\n    base = bdrRef;\n  } else {\n    console.error(JSON.stringify({ node: 'Validation', warning: 'bdr_ref_missing_rules_output', fallback: RULES_NODE_V }));\n    const rulesRef = $item(0).$node[RULES_NODE_V].json;\n    base = rulesRef ?? {};\n  }\n} catch (e) {\n  console.error(JSON.stringify({ node: 'Validation', error: 'cross_node_ref_failed', message: e.message }));\n}",
                "FIX 3C Validation cross-node"
            )

    print("  FIX 3 done")


def fix4_seller_id(data):
    """
    FIX 4 — Product Search: dynamic sellerId from client_config.
    """
    print("\n[FIX 4] Product Search — dynamic sellerId")
    nodes = find_nodes(data, "product-search-convex-test")
    if not nodes:
        print("  ✗ Node 'product-search-convex-test' not found!")
        return

    for node in nodes:
        patch_json_body(
            node,
            "  sellerId: 'tedytech',",
            "  sellerId: (() => {\n    const cfg = $json.client_config;\n    if (cfg && typeof cfg.store_name === 'string' && cfg.store_name.trim()) {\n      return cfg.store_name.trim().toLowerCase();\n    }\n    return 'tedytech';\n  })(),",
            "FIX 4 sellerId"
        )

    print("  FIX 4 done")


def fix5_bdr_info_guard(data):
    """
    FIX 5 — Business Data Resolver: skip constraint matching for info/support flows.
    Prevents constraintMatchFailed from overwriting result_type on info/support paths.
    """
    print("\n[FIX 5] Business Data Resolver — info/support constraint guard")
    nodes = find_nodes(data, "business-data-resolver")
    if not nodes:
        print("  ✗ Node 'business-data-resolver' not found!")
        return

    # The constraint checking block starts with:
    #   let constraintMatchFailed = false;
    # and the final override is:
    #   if (constraintMatchFailed && result_type !== ...
    # We wrap the entire block in an else after the info/support early-exit.

    # Strategy: find the sentinel where info/support sets result_type = 'no_match'
    # and add a guard that skips the constraint logic for these flows.
    # The existing code:
    #   } else if (resolverInput.flow === 'info' || resolverInput.flow === 'support') {
    #     result_type = 'no_match';
    #     result_mode = 'info';
    #     next_step = 'direct_answer';
    #   }
    # After this block, the constraint matching starts.
    # We add: if (resolverInput.flow !== 'info' && resolverInput.flow !== 'support') {
    # before the constraint block, and close it after constraintMatchFailed check.

    old_constraint_start = (
        "const candidateProducts = products.length > 0 ? products : shownProducts;\n"
        "const productNameForMatch = (product) => [product.brand, product.model].filter(Boolean).join(' ').trim().toLowerCase();\n"
        "let constraintMatchFailed = false;"
    )
    new_constraint_start = (
        "const candidateProducts = products.length > 0 ? products : shownProducts;\n"
        "const productNameForMatch = (product) => [product.brand, product.model].filter(Boolean).join(' ').trim().toLowerCase();\n"
        "let constraintMatchFailed = false;\n"
        "const isNonProductFlow = resolverInput.flow === 'info' || resolverInput.flow === 'support';"
    )

    old_constraint_end = (
        "if (constraintMatchFailed && result_type !== 'clarification_needed' && result_type !== 'exchange_offer') {\n"
        "  result_type = 'no_match';\n"
        "  next_step = 'ask_clarification';\n"
        "}"
    )
    new_constraint_end = (
        "if (!isNonProductFlow && constraintMatchFailed && result_type !== 'clarification_needed' && result_type !== 'exchange_offer') {\n"
        "  result_type = 'no_match';\n"
        "  next_step = 'ask_clarification';\n"
        "}"
    )

    for node in nodes:
        patch_js(node, old_constraint_start, new_constraint_start, "FIX 5A isNonProductFlow flag")
        patch_js(node, old_constraint_end, new_constraint_end, "FIX 5B guard constraintMatchFailed")

    print("  FIX 5 done")


def fix8_callback_fallback(data):
    """
    FIX 8 — Callback Action Handler: Amharic fallback for unknown callbacks + warning log.
    """
    print("\n[FIX 8] Callback Action Handler — unknown callback fallback")
    nodes = find_nodes(data, "callback-action-handler")
    if not nodes:
        print("  ✗ Node 'callback-action-handler' not found!")
        return

    for node in nodes:
        patch_js(
            node,
            "const reply_text = callbackData === 'confirm_exchange'\n"
            "  ? 'Exchange confirmed. Admin has been notified and we will follow up with the details.'\n"
            "  : callbackData === 'cancel_exchange'\n"
            "  ? 'Exchange canceled. Let me know if you want another option.'\n"
            "  : 'I did not recognize that action. Please try again.';",
            "const REPLY_CONFIRM = 'ልውውጡ ተረጋግጧል። አስተዳዳሪው ያሳውቃቸዋል።\\n(Exchange confirmed. Admin has been notified.)';\n"
            "const REPLY_CANCEL  = 'ልውውጡ ተሰርዟል። ሌላ አማራጭ ከፈለጉ ይጠይቁ።\\n(Exchange canceled. Ask if you want another option.)';\n"
            "const REPLY_UNKNOWN = 'ይቅርታ፣ ያልታወቀ ድርጊት። እባክዎ እንደገና ይሞክሩ።\\n(Unknown action, please try again.)';\n"
            "if (!['confirm_exchange', 'cancel_exchange'].includes(callbackData)) {\n"
            "  console.warn(JSON.stringify({ node: 'Callback Action Handler', warning: 'unknown_callback', callbackData }));\n"
            "}\n"
            "const reply_text = callbackData === 'confirm_exchange'\n"
            "  ? REPLY_CONFIRM\n"
            "  : callbackData === 'cancel_exchange'\n"
            "  ? REPLY_CANCEL\n"
            "  : REPLY_UNKNOWN;",
            "FIX 8 callback fallback"
        )

    print("  FIX 8 done")


# ── validation ────────────────────────────────────────────────────────────────

def verify_fixes(data):
    """Quick post-patch sanity check."""
    print("\n[VERIFY] Post-patch checks")
    errors = []

    def check(condition, msg):
        if condition:
            print(f"  ✓  {msg}")
        else:
            print(f"  ✗  {msg}")
            errors.append(msg)

    # Fix 1: reply_text: effective_reply_text in return
    for node in find_nodes(data, "side-effects"):
        code = node["parameters"].get("jsCode", "")
        check("reply_text: effective_reply_text," in code, "Fix1: return uses effective_reply_text")
        check("raw_reply_text: reply_text," in code, "Fix1: raw_reply_text exposed")
        check("used_fallback: !raw_safe_to_send," in code, "Fix1: used_fallback exposed")
        check("ይቅርታ፣ ያልተረዳሁት" in code, "Fix1: Amharic fallback text present")
        check("text: reply_text, timestamp: now" not in code or 
              "text: effective_reply_text, timestamp: now" in code, "Fix1: history uses effective_reply_text")

    # Fix 2: deep_link_start no longer in first if
    for node in find_nodes(data, "rules-layer"):
        code = node["parameters"].get("jsCode", "")
        check("'start_reset' || event.event_type === 'deep_link_start'" not in code,
              "Fix2: deep_link_start removed from start_reset condition")
        check("event.event_type === 'start_reset')" in code and
              "else if (event.event_type === 'deep_link_start')" in code,
              "Fix2: deep_link_start has own else-if branch")

    # Fix 4: sellerId dynamic
    for node in find_nodes(data, "product-search-convex-test"):
        body = node["parameters"].get("jsonBody", "")
        check("sellerId: 'tedytech'" not in body, "Fix4: hardcoded sellerId removed")
        check("cfg.store_name" in body, "Fix4: dynamic sellerId uses store_name")

    # Fix 5: isNonProductFlow guard
    for node in find_nodes(data, "business-data-resolver"):
        code = node["parameters"].get("jsCode", "")
        check("isNonProductFlow" in code, "Fix5: isNonProductFlow guard present")
        check("!isNonProductFlow && constraintMatchFailed" in code, "Fix5: constraintMatchFailed guarded")

    # Fix 8: Amharic callback replies
    for node in find_nodes(data, "callback-action-handler"):
        code = node["parameters"].get("jsCode", "")
        check("ልውውጡ ተረጋግጧል" in code, "Fix8: Amharic confirm text")
        check("unknown_callback" in code, "Fix8: unknown_callback warning log")

    if errors:
        print(f"\n  ⚠  {len(errors)} check(s) failed. Review before deploying.")
        return False
    else:
        print("\n  All checks passed ✓")
        return True


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("  Abenier Bot Logic — Phase 1 Fix Script")
    print("=" * 60)

    if not WORKFLOW_PATH.exists():
        print(f"\n✗ workflow.json not found at: {WORKFLOW_PATH}")
        sys.exit(1)

    print("\n[BACKUP]")
    backup()

    print("\n[LOADING] workflow.json")
    data = load_workflow()
    total_nodes = len(data.get("nodes", []))
    print(f"  Loaded. {total_nodes} nodes found.")

    # Apply all fixes
    fix1_validation_reply_text(data)
    fix2_rules_deep_link(data)
    fix3_cross_node_logging(data)
    fix4_seller_id(data)
    fix5_bdr_info_guard(data)
    fix8_callback_fallback(data)

    # Verify
    ok = verify_fixes(data)

    if ok:
        print("\n[SAVING] workflow.json")
        save_workflow(data)
        print("  ✓ Saved successfully")
        print("\n✅ Phase 1 fixes applied. Upload workflow.json to n8n and run test cases.")
    else:
        print("\n[SAVING] workflow.json (with warnings — review above)")
        save_workflow(data)
        print("  ⚠  Saved with verification warnings. Review before deploying.")


if __name__ == "__main__":
    main()
