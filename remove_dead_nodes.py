import json
import shutil
from datetime import datetime

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

# Backup
ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/remove-dead-nodes-{ts}.json'
shutil.copy('workflow.json', backup_path)
print(f'Backup saved: {backup_path}')

nodes_to_remove = {'Admin Handoff Notify?', 'Admin Handoff Telegram Send'}

# 1. Remove the actual nodes
original_node_count = len(w.get('nodes', []))
w['nodes'] = [n for n in w.get('nodes', []) if n.get('name') not in nodes_to_remove]
new_node_count = len(w['nodes'])
print(f"Removed {original_node_count - new_node_count} nodes.")

# 2. Clean up any connections extending TO or FROM these nodes
conns = w.get('connections', {})
new_conns = {}

for source_node, targets in conns.items():
    if source_node in nodes_to_remove:
        print(f"  Removing connections FROM {source_node}")
        continue
    
    new_targets = {}
    for conn_type, outputs in targets.items():
        new_outputs = []
        for out_list in outputs:
            clean_out_list = [target for target in out_list if target.get('node') not in nodes_to_remove]
            new_outputs.append(clean_out_list)
        new_targets[conn_type] = new_outputs
        
    new_conns[source_node] = new_targets

w['connections'] = new_conns

with open('workflow.json', 'w', encoding='utf-8') as f:
    json.dump(w, f, indent=2, ensure_ascii=False)

print("Successfully cleaned up workflow.json.")
