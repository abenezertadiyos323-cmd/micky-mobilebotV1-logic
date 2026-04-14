import json
import shutil
from datetime import datetime

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

# Backup
ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/detach-handoff-{ts}.json'
shutil.copy('workflow.json', backup_path)
print(f'Backup saved: {backup_path}')

# Find Rules Layer connections
conns = w.get('connections', {})
if 'Rules Layer' in conns and 'main' in conns['Rules Layer']:
    main_conns = conns['Rules Layer']['main']
    
    # main_conns is usually a list of lists of connections, typically just one output index: main_conns[0]
    if len(main_conns) > 0:
        targets = main_conns[0]
        
        # Filter out the 'Admin Handoff Notify?' connection
        new_targets = [t for t in targets if t['node'] != 'Admin Handoff Notify?']
        
        if len(new_targets) < len(targets):
            print(f"Removed {len(targets) - len(new_targets)} connection(s) from Rules Layer -> Admin Handoff Notify?")
            conns['Rules Layer']['main'][0] = new_targets
            
            with open('workflow.json', 'w', encoding='utf-8') as f:
                json.dump(w, f, indent=2, ensure_ascii=False)
            print("Successfully patched workflow.json.")
        else:
            print("Target connection not found. It might have been already removed.")
    else:
        print("No connections found for Rules Layer")
else:
    print("Rules Layer not found in connections object")
