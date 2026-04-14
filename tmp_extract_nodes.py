import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf.get('nodes', [])

for i in [3, 5, 6, 7, 8]:
    n = nodes[i]
    name_safe = n['name'].replace(' ', '_').replace('(', '').replace(')', '')[:30]
    fname = f'tmp_node_{i}_{name_safe}.txt'
    with open(fname, 'w', encoding='utf-8') as out:
        out.write(f'NODE {i}: {n["name"]}\n')
        out.write(f'TYPE: {n["type"]}\n\n')
        jsc = n.get('parameters', {}).get('jsCode', '')
        if jsc:
            out.write('--- jsCode ---\n')
            out.write(jsc)
        else:
            out.write(json.dumps(n.get('parameters', {}), indent=2)[:12000])
    print(f'Written {fname}')

print('done')
