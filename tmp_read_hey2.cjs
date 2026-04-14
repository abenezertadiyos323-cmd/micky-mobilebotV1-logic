const fs = require('fs');

function clean(str) {
    if (!str) return 'N/A';
    if (typeof str !== 'string') return JSON.stringify(str);
    return str.replace(/\r/g, '').replace(/\n/g, ' ');
}

function extract() {
    const raw = fs.readFileSync('hey_exec.json', 'utf8');
    const data = JSON.parse(raw);
    const runData = data.data.resultData.runData;
    
    let out = [];
    out.push("=== HEY EXECUTION DEBUG REPORT ===");
    out.push("Execution ID: " + data.data.id);
    out.push("Started At: " + data.data.startedAt);
    out.push("");
    
    let userText = "N/A";
    let norm = runData['Event Normalizer']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (norm) {
        userText = norm.event?.text || norm.text;
    }
    out.push("## 2. Meaning Path");
    out.push("- raw text: " + clean(userText));
    
    let undItem = runData['Understanding JSON Guard - Pure Validator']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (undItem && undItem.understanding_output) {
        out.push("- message_function: " + clean(undItem.understanding_output.message_function));
        out.push("- confidence: " + undItem.understanding_output.confidence);
        out.push("- ambiguity: " + undItem.understanding_output.ambiguity);
    } else {
        out.push("No understanding_output found");
    }
    
    out.push("");
    out.push("## 3. Rules Path");
    let rulesItem = runData['Rules Layer']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (rulesItem && rulesItem.rules_output) {
        out.push("- should_call_resolver: " + rulesItem.rules_output.should_call_resolver);
        out.push("- reply_mode: " + clean(rulesItem.rules_output.reply_mode));
        out.push("- handoff_needed: " + rulesItem.rules_output.handoff_needed);
        out.push("- next_action: " + clean(rulesItem.rules_output.next_action));
    } else {
        out.push("No rules_output found");
    }
    
    out.push("");
    out.push("## 4. Reply Path");
    let replyItem = runData['Reply AI']?.[0]?.data?.main?.[0]?.[0]?.json?.message?.content;
    out.push("- Reply AI output: " + clean(replyItem).substring(0, 150));
    
    let validationItem = runData['Validation']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (validationItem) {
        out.push("- Validation output: " + clean(validationItem.reply_text));
        out.push("- Validation overrode original: " + (validationItem.overrode_original ? 'YES' : 'NO'));
    } else {
        out.push("- Validation output: N/A");
    }
    
    let noResolveItem = runData['Set No-Resolver Output']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (noResolveItem) {
        out.push("Note: Set No-Resolver Output was executed.");
    }
    
    out.push("");
    out.push("## 5. Telegram Send Status");
    let tgSendNode = runData['Telegram Send'];
    let tgSendErr = runData['Telegram Send']?.[0]?.error;
    if (tgSendNode) {
        let tgSendItem = tgSendNode[0]?.data?.main?.[0]?.[0]?.json;
        if(tgSendItem) {
             out.push("- failed in this execution? NO");
             out.push("- response payload: " + clean(JSON.stringify(tgSendItem)).substring(0, 150));
        } else if (tgSendErr) {
             out.push("- failed in this execution? YES");
             out.push("- details: " + clean(tgSendErr.message || tgSendErr.description || "error"));
        } else {
             out.push("- status: Executed but no output found.");
        }
    } else {
        out.push("- failed in this execution? YES/NO - Node did not run.");
    }

    out.push("");
    out.push("## 6. Session Save Status");
    let sessionNode = runData['Session Save'];
    if (sessionNode) {
        let err = sessionNode[0]?.error;
        let inputs = sessionNode[0]?.data?.main?.[0] || [];
        // if no error but also no main? Wait, if it errors, main array is sometimes empty or absent. But we can check error property.
        if (err) {
            out.push("- failed? YES");
            out.push("- exact bad request reason: " + clean(err.message || err.description || err));
            // Let's get the payload from the node BEFORE it
            let beforeNodeItem = runData['Format For DB']?.[0]?.data?.main?.[0]?.[0]?.json;
            if (!beforeNodeItem) beforeNodeItem = runData['Validation']?.[0]?.data?.main?.[0]?.[0]?.json; // fallback if Format For DB doesn't exist
            
            out.push("- payload shape that was sent: " + JSON.stringify(Object.keys(beforeNodeItem || {})));
            out.push("- exact payload: " + clean(JSON.stringify(beforeNodeItem || {})).substring(0, 300));
        } else {
            out.push("- failed? NO");
        }
    } else {
        out.push("- failed? Not executed at all.");
    }

    fs.writeFileSync('hey_report.txt', out.join('\n'));
}
extract();
