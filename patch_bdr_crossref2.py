import json

def try_fix_bdr():
    with open('workflow.json', 'r', encoding='utf-8') as f:
        w = json.load(f)

    bdr = next((n for n in w.get('nodes', []) if n.get('name') == 'Business Data Resolver'), None)
    
    code = bdr['parameters'].get('jsCode') or bdr['parameters'].get('code')
    
    old_str = """let base = {};
try {
  const ref = $json;
  if (!ref || !ref.rules_output) {
    console.error(JSON.stringify({ node: 'Business Data Resolver', error: 'cross_node_ref_empty_or_no_rules', ref_node: RULES_NODE }));
  }
  base = ref ?? {};
} catch (e) {
  console.error(JSON.stringify({ node: 'Business Data Resolver', error: 'cross_node_ref_failed', ref_node: RULES_NODE, message: e.message }));
}"""

    new_str = """let base = {};
try {
  let ref = $json;
  if (!ref || !ref.rules_output) {
     try {
       ref = $('Rules Layer').first().json;
     } catch (e2) {}
  }
  if (!ref || !ref.rules_output) {
     try {
       ref = $item(0).$node['Rules Layer'].json;
     } catch (e3) {}
  }
  base = ref ?? {};
} catch (e) {
  console.error(JSON.stringify({ node: 'Business Data Resolver', error: 'cross_node_ref_failed', ref_node: RULES_NODE, message: e.message }));
}"""

    if old_str in code:
        new_code = code.replace(old_str, new_str)
        bdr['parameters']['jsCode'] = new_code
        with open('workflow.json', 'w', encoding='utf-8') as f:
            json.dump(w, f, indent=2)
        print("Patched BDR to cross-reference Rules Layer!")
    else:
        print("Did not find target string in BDR")
        
try_fix_bdr()
