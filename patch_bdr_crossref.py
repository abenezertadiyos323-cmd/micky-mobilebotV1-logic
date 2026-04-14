import json

def try_fix_bdr():
    with open('workflow.json', 'r', encoding='utf-8') as f:
        w = json.load(f)

    bdr = next((n for n in w.get('nodes', []) if n.get('name') == 'Business Data Resolver'), None)
    
    code = bdr['parameters'].get('jsCode') or bdr['parameters'].get('code')
    
    if "const ref = $json;" in code:
        new_code = code.replace("const ref = $json;", "const ref = $('Rules Layer').item.json || $item(0).$node['Rules Layer'].json || $json;")
        bdr['parameters']['jsCode'] = new_code
        with open('workflow.json', 'w', encoding='utf-8') as f:
            json.dump(w, f, indent=2)
        print("Patched BDR to cross-reference Rules Layer!")
    else:
        print("Did not find target string in BDR")
        
try_fix_bdr()
