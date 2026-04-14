const fs = require('fs');

function extract() {
    const raw = fs.readFileSync('hey_exec.json', 'utf8');
    const data = JSON.parse(raw);
    const runData = data.data.resultData.runData;
    
    console.log("=== HEY EXECUTION DEBUG REPORT ===");
    console.log("Execution ID:", data.data.id);
    console.log("Started At:", data.data.startedAt);
    console.log("");
    
    // Telegram Input or Event Normalizer?
    let userText = "N/A";
    let norm = runData['Event Normalizer']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (norm) {
        userText = norm.event?.text || norm.text;
    }
    console.log("## 2. Meaning Path");
    console.log("- raw text:", userText);
    
    let undItem = runData['Understanding JSON Guard - Pure Validator']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (undItem && undItem.understanding_output) {
        console.log("- message_function:", undItem.understanding_output.message_function);
        console.log("- confidence:", undItem.understanding_output.confidence);
        console.log("- ambiguity:", undItem.understanding_output.ambiguity);
    } else {
        console.log("No understanding_output found (might be failed or null)");
    }
    
    console.log("");
    console.log("## 3. Rules Path");
    let rulesItem = runData['Rules Layer']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (rulesItem && rulesItem.rules_output) {
        console.log("- should_call_resolver:", rulesItem.rules_output.should_call_resolver);
        console.log("- reply_mode:", rulesItem.rules_output.reply_mode);
        console.log("- handoff_needed:", rulesItem.rules_output.handoff_needed);
        console.log("- next_action:", rulesItem.rules_output.next_action);
    } else {
        console.log("No rules_output found");
    }
    
    console.log("");
    console.log("## 4. Reply Path");
    let replyItem = runData['Reply AI']?.[0]?.data?.main?.[0]?.[0]?.json?.message?.content;
    console.log("- Reply AI output:", replyItem ? replyItem.substring(0, 100).replace(/\n/g, ' ') + '...' : 'N/A');
    
    let validationItem = runData['Validation']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (validationItem) {
        console.log("- Validation output (reply_text):", validationItem.reply_text);
        console.log("- Validation overrode original:", validationItem.overrode_original ? 'YES' : 'NO');
    } else {
         console.log("- Validation output: N/A");
    }
    
    let shouldResolveItem = runData['Should Resolve']?.[0]?.data?.main?.[0]?.[0]?.json;
    if (shouldResolveItem) {
        // Did we go to false branch and execute Set No-Resolver Output?
        let noResolveItem = runData['Set No-Resolver Output']?.[0]?.data?.main?.[0]?.[0]?.json;
        if (noResolveItem) {
            console.log("\nNote: 'Set No-Resolver Output' was executed.");
        }
    }
    
    console.log("");
    console.log("## 5. Telegram Send Status");
    let tgSendNode = runData['Telegram Send'];
    let tgSendErr = runData['Telegram Send']?.[0]?.error;
    if (tgSendNode) {
        let tgSendItem = tgSendNode[0]?.data?.main?.[0]?.[0]?.json;
        if(tgSendItem) {
             console.log("- executed successfully:", true);
             console.log("- payload sent:", JSON.stringify(tgSendItem).substring(0, 150));
        } else if (tgSendErr) {
             console.log("- failed in this execution? YES");
             console.log("- details:", tgSendErr.message || tgSendErr);
             
             // Where is payload for a failed node?
             // Usually in tgSendNode[0].sourceData or parameters
        } else {
             console.log("- status: Node exists but no main output or error printed cleanly.");
        }
    } else {
        console.log("- failed in this execution? Not executed at all.");
    }

    console.log("");
    console.log("## 6. Session Save Status");
    let sessionNode = runData['Session Save'];
    if (sessionNode) {
        let err = sessionNode[0]?.error;
        if (err) {
            console.log("- failed? YES");
            console.log("- exact bad request reason:", err.message || err.description || err);
            
            // To get payload, we can check node parameters or input data
            let inputs = sessionNode[0]?.data?.main?.[0] || [];
            console.log("- input data shape to Session Save:", Object.keys(inputs[0]?.json || {}));
            // Let's print the actual JSON that was sent:
             console.log("- full input JSON:", JSON.stringify(inputs[0]?.json || {}));
        } else {
            console.log("- failed? NO");
        }
    } else {
        console.log("- failed? Not executed at all.");
    }
}
extract();
