import json
import re

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

    report = []
    
    for node in nodes:
        if node['name'] == 'Validation':
            code = node.get('parameters', {}).get('jsCode', '')
            
            # Logic to insert observability calculations before the return
            obs_logic = """
  // ── Step 8: Minimal Observability Layer ─────────────────────
  const is_fallback = Boolean(base.understanding_meta?.fallback_applied || base.understanding_meta?.valid === false);
  const is_clarification = ['clarification_needed', 'clarify_reference'].includes(rules_output.reply_mode);
  const ai_confidence = Number(understanding_output.confidence ?? 0);

  const _observability = {
    ai_confidence,
    is_fallback,
    is_clarification,
    timestamp: now
  };
"""
            # Insert before 'return {' or 'return ['
            if 'return {' in code:
                code = code.replace('return {', obs_logic + '\n  return {')
            elif 'return [{ ' in code:
                code = code.replace('return [{', obs_logic + '\n  return [{')
            
            # Add to session_update_payload
            code = code.replace('session: updatedSession,', 'session: updatedSession,\n      _observability,')
            
            node['parameters']['jsCode'] = code
            report.append("- **Validation**: Injected minimal observability block to track AI confidence, fallback status, and clarification triggers.")

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('step8_observability_report.md', 'w', encoding='utf-8') as f:
        f.write("# Step 8 Observability Report\n\n")
        f.write("\n".join(report))

process()
