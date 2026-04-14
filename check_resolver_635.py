import json
import sys

# Ensure stdout is utf-8
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

with open('exec_635.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

run_data = data.get('data', {}).get('resultData', {}).get('runData', {})
resolver_output = run_data['Business Data Resolver'][0]['data']['main'][0][0]['json']

print("--- Business Data Resolver Output ---")
print(json.dumps(resolver_output, indent=2))

# Check for location in client_config
config = resolver_output.get('client_config', {})
print("\n--- Client Config ---")
print(json.dumps(config, indent=2))
