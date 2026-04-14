import json

with open('workflow.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes = wf.get('nodes', [])

# Extract Should Resolve (14)
for i in [14]:
    n = nodes[i]
    fname = f'tmp_ifnode_{i}_{n["name"].replace(" ","_")}.txt'
    with open(fname, 'w', encoding='utf-8') as out:
        out.write(f'NODE {i}: {n["name"]}\n')
        out.write(f'TYPE: {n["type"]}\n\n')
        out.write(json.dumps(n.get('parameters', {}), indent=2))
    print(f'Written {fname}')
print('done')
