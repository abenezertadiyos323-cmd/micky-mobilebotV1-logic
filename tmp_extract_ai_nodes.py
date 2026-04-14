import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf.get('nodes', [])

# Extract Understanding AI (4), Product Search (7), Reply AI (9)
for i in [4, 7, 9]:
    n = nodes[i]
    name_safe = n['name'].replace(' ', '_').replace('(', '').replace(')', '')[:35]
    fname = f'tmp_ainode_{i}_{name_safe}.txt'
    with open(fname, 'w', encoding='utf-8') as out:
        out.write(f'NODE {i}: {n["name"]}\n')
        out.write(f'TYPE: {n["type"]}\n\n')
        params = n.get('parameters', {})
        # Write full params as JSON
        out.write(json.dumps(params, indent=2)[:20000])
    print(f'Written {fname}')

print('done')
