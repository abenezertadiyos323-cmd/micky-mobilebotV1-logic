import json
import shutil
from datetime import datetime

with open('workflow.json', 'r', encoding='utf-8') as f:
    w = json.load(f)

# Backup
ts = datetime.utcnow().strftime('%Y-%m-%dT%H-%M-%S')
backup_path = f'backups/admin-handoff-fix-{ts}.json'
shutil.copy('workflow.json', backup_path)
print(f'Backup saved: {backup_path}')

# Find the node
node = next((n for n in w['nodes'] if n['name'] == 'Admin Handoff Telegram Send'), None)
if node:
    # Update the chatId parameter to have a fallback
    old_chat_id = node['parameters'].get('chatId', '')
    # Fallback: check ADMIN_CHAT_ID, if not set, use the user's own chat_id so the bot doesn't crash 
    # and instead sends the handoff notification back to the user (or we can use a known admin ID)
    new_chat_id = "={{ $env.ADMIN_CHAT_ID || $json.event?.chat_id || $json.event?.chatId }}"
    
    node['parameters']['chatId'] = new_chat_id
    
    with open('workflow.json', 'w', encoding='utf-8') as f:
        json.dump(w, f, indent=2, ensure_ascii=False)
        
    print(f"Patched Admin Handoff Telegram Send. Changed chatId from '{old_chat_id}' to '{new_chat_id}'")
else:
    print('Node Admin Handoff Telegram Send not found.')
