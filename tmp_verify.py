from pathlib import Path
import json
text = Path('workflow.json').read_text('utf-8')
found = 'or more details?' in text and "'I can show you'" in text
print('found' if found else 'not found')
idx = text.find('If resolver_output.post_price_mode is price_shown')
print(idx)
print(text[idx:idx+400])
json.loads(text)
print('valid_json')
