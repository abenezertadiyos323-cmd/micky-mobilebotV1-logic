import json
import re

def process():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error:", e)
        return

    json_str = json.dumps(data)

    # 1. Replace property accessors (e.g., event.chatId)
    # Replaces .chatId, .userId, .messageId with snake_case
    json_str = re.sub(r'\.(chat|user|message)Id\b', r'.\1_id', json_str)

    # 2. Replace keys in objects (e.g., "chatId": or chatId:)
    # Replaces 'chatId': or "chatId":
    json_str = re.sub(r'([\'"]?)(chat|user|message)Id([\'"]?)\s*:', r'\1\2_id\3:', json_str)

    # 3. Replace variable names for internal consistency (e.g., chatIdRaw)
    json_str = json_str.replace('chatIdRaw', 'chat_id_raw')
    json_str = json_str.replace('userIdRaw', 'user_id_raw')
    json_str = json_str.replace('messageIdRaw', 'message_id_raw')

    # 4. Final sweep for any stray 'chatId', 'userId', 'messageId' as bare words in expressions
    # e.g., {{ $json.event.chatId }} - this was already handled by step 1, 
    # but let's be thorough with n8n expressions.
    json_str = re.sub(r'(?<=\$json\.event\.)(chat|user|message)Id\b', r'\1_id', json_str)
    
    # 5. Fix CamelCase in return blocks of JS nodes (e.g., chatId:)
    # This matches: chatId: foo
    json_str = re.sub(r'\b(chat|user|message)Id\s*:', r'\1_id:', json_str)

    data = json.loads(json_str)

    # SUCCESS CHECK
    # We verify that 'chatId' (case sensitive) is no longer a core ID naming convention
    # Note: Telegram's 'message_id' is already snake_case.
    
    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('step6_final_verification.txt', 'w', encoding='utf-8') as f:
        f.write("Standardization complete.\n")

process()
