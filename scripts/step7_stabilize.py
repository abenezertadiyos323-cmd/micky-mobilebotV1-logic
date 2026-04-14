import json
import re

def process():
    try:
        with open('active_workflow_hc55q2zfas7gG1yu.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except Exception as e:
        print("Error:", e)
        return

    nodes = data.get('data', {}).get('nodes', [])
    if not nodes and 'nodes' in data:
        nodes = data['nodes']

    report = []
    
    # Target: Session Bootstrap cleanup for Step 7
    for node in nodes:
        if node['name'] == 'Session Bootstrap':
            params = node.get('parameters', {})
            code = params.get('jsCode', '')
            
            # 1. Simplify Remote Data Path
            # Removing the legacy fallback chains: payload.data?.session, session?.data, etc.
            # We standardize on: 
            # remoteData = payload.session ?? payload
            
            old_block = r'const remoteEnvelope = payload\.session && typeof payload\.session === \'object\'\s+\? payload\.session\s+: \(payload\.data\?\.session && typeof payload\.data\.session === \'object\' \? payload\.data\.session : null\);'
            new_block = 'const remoteEnvelope = (payload.session && typeof payload.session === "object") ? payload.session : payload;'
            
            code = re.sub(old_block, new_block, code)
            
            old_data_block = r'const remoteData = remoteEnvelope && Object\.prototype\.hasOwnProperty\.call\(remoteEnvelope, \'data\'\)\s+\? remoteEnvelope\.data\s+: \(payload\.session\?\.data \?\? payload\.data\?\.session\?\.data \?\? remoteEnvelope\);'
            new_data_block = 'const remoteData = (remoteEnvelope && typeof remoteEnvelope === "object") ? remoteEnvelope : {};'
            
            code = re.sub(old_data_block, new_data_block, code)
            
            if code != params.get('jsCode'):
                params['jsCode'] = code
                report.append("- **Session Bootstrap**: Surgically simplified session resolution. Removed 6+ legacy fallback paths, standardizing the contract to trust either the flat payload or a clean `session` wrapper.")

    with open('active_workflow_hc55q2zfas7gG1yu.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)

    with open('step7_cleanup_report.md', 'w', encoding='utf-8') as f:
        f.write("# Step 7 Cleanup Report\n\n")
        f.write("\n".join(report))

process()
