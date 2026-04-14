import json
import re

def process():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error:", e)
        return

    json_str = json.dumps(data).lower()
    
    # Audit for client-specific leakage
    terms_to_check = ['tedytech', 'tedy tech', 'tedy', 'teddy', 'tedy_tech']
    found_terms = [t for t in terms_to_check if t in json_str]
    
    # Audit for industry-specific identifiers (Phones)
    industry_terms = ['iphone', 'samsung', 'huawei', 'xiaomi', 'pixel', 'phone', 'storage', 'ram', 'condition', 'network']
    found_industry = [t for t in industry_terms if t in json_str]

    # Find the exact context for found terms (first 5 matches)
    contexts = []
    for term in found_terms:
        matches = re.findall(r'.{0,30}' + re.escape(term) + r'.{0,30}', json_str)
        contexts.append({"term": term, "matches": matches[:3]})

    # Check for hardcoded config values in Session Bootstrap
    nodes = data.get('data', {}).get('nodes', []) or data.get('nodes', [])
    bootstrap = next((n for n in nodes if n['name'] == 'Session Bootstrap'), None)
    
    report = {
        "client_leakage": found_terms,
        "industry_coupling": found_industry,
        "contexts": contexts
    }

    with open('scripts/clone_audit.json', 'w', encoding='utf-8') as out:
        json.dump(report, out, indent=2)

process()
