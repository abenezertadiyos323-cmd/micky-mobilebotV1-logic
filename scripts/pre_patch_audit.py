import json

wf = json.load(open('workflow.json', encoding='utf-8'))
results = {}

for node in wf.get('nodes', []):
    nid = node.get('id')

    if nid == 'business-data-resolver':
        code = node['parameters'].get('jsCode', '')
        idx = code.find("resolverInput.flow === 'info'")
        results['bdr_info_block'] = code[idx-4:idx+180] if idx >= 0 else 'NOT FOUND'
        results['bdr_has_store_info'] = 'store_info' in code

    if nid == 'side-effects':
        code = node['parameters'].get('jsCode', '')
        idx = code.find('effective_reply_text =')
        results['val_effective'] = code[idx:idx+140] if idx >= 0 else 'NOT FOUND'
        idx2 = code.find("'exchange_offer'")
        results['val_allowlist'] = code[max(0,idx2-100):idx2+50] if idx2 >= 0 else 'NOT FOUND'
        idx3 = code.find('safe_to_send: true')
        results['val_safe'] = code[idx3:idx3+60] if idx3 >= 0 else 'NOT FOUND'
        results['val_has_store_info_allowed'] = 'store_info' in code.split("'exchange_offer'")[0][-150:] if "'exchange_offer'" in code else False

    if nid == 'rules-layer':
        code = node['parameters'].get('jsCode', '')
        idx = code.find('hasAnchoredContext')
        results['rules_negotiation'] = code[idx:idx+250] if idx >= 0 else 'NOT FOUND'

conns = wf.get('connections', {})
rl = conns.get('Rules Layer', {}).get('main', [[]])
results['admin_conn'] = [n.get('node') for n in rl[0]] if rl else []

with open('tmp_patch_audit.txt', 'w', encoding='utf-8') as f:
    for k, v in results.items():
        f.write(f'=== {k} ===\n{v}\n\n')

print('Written to tmp_patch_audit.txt')
