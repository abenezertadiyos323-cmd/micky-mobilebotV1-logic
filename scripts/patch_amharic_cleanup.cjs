const fs = require('fs');

const path = 'workflow.json';
let s = fs.readFileSync(path, 'utf8');

function replaceExact(oldText, newText, label) {
  if (!s.includes(oldText)) {
    throw new Error(`Pattern not found: ${label}`);
  }
  s = s.replaceAll(oldText, newText);
}

replaceExact("text: '??? ???'", "text: 'ስልክ ይግዙ'", 'start menu buy button');
replaceExact("text: '??? ????'", "text: 'ስልክ ይቀይሩ'", 'start menu exchange button');
replaceExact("text: '??? ?????'", "text: 'መያዝ ያረጋግጡ'", 'confirm reservation button');
replaceExact("text: '?? ????'", "text: 'ሱቅ ይጎብኙ'", 'store button');

replaceExact(
  "reply_text = 'እንኳን ወደ TedyTech በደህና መጡ።\\\\nBuy phone ወይም Exchange phone ይምረጡ።';",
  "reply_text = 'እንኳን ወደ TedyTech በደህና መጡ።\\\\nስልክ ለመግዛት ወይም ለመቀየር ይምረጡ።';",
  'start reset welcome'
);

replaceExact(
  "const storeCtaText = '????? ???? ?? ???? ??? ???? ??? ????? ?? ???? ????';",
  "const storeCtaText = 'ለተጨማሪ ስልኮች እና እቃዎች ከታች ያለውን ቁልፍ ተጠቅመው ወደ ሱቃችን ይግቡ።';",
  'store cta'
);

replaceExact(
  "reply_text = 'ለexchange የምትሰጡት ስልክ ምንድነው?';",
  "reply_text = 'ለመቀየር የሚሰጡት ስልክ ምንድነው?';",
  'start exchange prompt'
);

replaceExact(
  "reply_text = 'Reservation confirmed. We’ve noted it.';",
  "reply_text = 'መያዝዎ ተመዝግቧል።';",
  'reservation confirmed'
);

replaceExact(
  "reply_text = '????? ????? ??? ??? ?? ???? ????';",
  "reply_text = 'ለመቀየር የሚሰጡት ስልክ ሞዴል እና ማከማቻ ይላኩ።';",
  'exchange prompt'
);

replaceExact(
  "reply_text = '????? ?? ??? ?? ??? ???';",
  "reply_text = 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።';",
  'store info fallback'
);

replaceExact(
  "reply_text = '????? ?? ?? ???? ????? ??? ????? ??? ???? ??? ????';",
  "reply_text = 'ፎቶዎችን እና ሙሉ መረጃን በሱቃችን ማየት ይችላሉ። ከታች ያለውን ቁልፍ ይጫኑ።';",
  'photo request reply'
);

replaceExact(
  "reply_text = '???? ??? ???? ??? ????';",
  "reply_text = 'ለመያዝ ከታች ያለውን ቁልፍ ይጫኑ።';",
  'reserve prompt'
);

replaceExact(
  "const budgetFallbackNotice = budgetFallbackUsed && !resolverIsStoreInfo\\n  ? 'No exact match in your budget, so these are the nearest options above budget.'\\n  : null;",
  "const budgetFallbackNotice = budgetFallbackUsed && !resolverIsStoreInfo\\n  ? 'በበጀትዎ ውስጥ ትክክለኛ ተዛማጅ አማራጭ አልተገኘም፤ ከበጀቱ በላይ ያሉ ቅርብ አማራጮች እነዚህ ናቸው።'\\n  : null;",
  'budget fallback'
);

replaceExact(
  "const closeQuestion = flowIsBuy && hasProductReply && !pricingFollowUp\\n  ? '???? ????? ??? ???? ???? ??? ??????'\\n  : null;",
  "const closeQuestion = flowIsBuy && hasProductReply && !pricingFollowUp\\n  ? 'ለመያዝ ይፈልጋሉ ወይስ በአካል መጥተው ማየት ይፈልጋሉ?'\\n  : null;",
  'close question'
);

replaceExact(
  "const STORE_INFO = {\\n  store_name: 'TedyTech',\\n  address_text_amharic: '????? ?? ??? ?? ??? ???',\\n  address_text_english: '????? ?? ??? ?? ??? ???',\\n  address_text: '????? ?? ??? ?? ??? ???',\\n  map_url: mapUrl,\\n};",
  "const STORE_INFO = {\\n  store_name: 'TedyTech',\\n  address_text_amharic: 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።',\\n  address_text_english: 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።',\\n  address_text: 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።',\\n  map_url: mapUrl,\\n};",
  'store info block'
);

replaceExact(
  "reply_text = 'TedyTech store location ? use the map button below.';",
  "reply_text = 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።';",
  'store info fallback text'
);

replaceExact(
  "reply_text = 'TedyTech store location on the map below.';",
  "reply_text = 'የሱቃችን ቦታ በማፕ ላይ ከታች ነው።';",
  'store info text'
);

fs.writeFileSync(path, s);
console.log('workflow.json updated');
