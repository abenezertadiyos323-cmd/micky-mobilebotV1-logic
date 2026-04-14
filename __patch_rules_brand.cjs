const fs = require('fs');
const file = 'workflow.json';
const wf = JSON.parse(fs.readFileSync(file, 'utf8'));
const node = wf.nodes.find((entry) => entry.name === 'Rules Layer');
if (!node || !node.parameters || typeof node.parameters.jsCode !== 'string') {
  throw new Error('Rules Layer code not found');
}
const brandNeedle = "const currentTurnBrand = currentTurnPhoneType ? currentTurnPhoneType.split(/s+/)[0] : null;";
const brandInsert = `const lowerEventTextForBrand = eventText.toLowerCase();
const brandCandidates = ['iphone', 'samsung', 'pixel', 'redmi', 'xiaomi', 'tecno', 'infinix', 'oppo', 'vivo', 'realme', 'itel', 'nokia'];
const brandMatch = brandCandidates.find((brand) => lowerEventTextForBrand.includes(brand));
const currentTurnBrand = currentTurnPhoneType ? currentTurnPhoneType.split(' ')[0] : (brandMatch ? (brandMatch === 'iphone' ? 'iPhone' : brandMatch.charAt(0).toUpperCase() + brandMatch.slice(1)) : null);`;
if (!node.parameters.jsCode.includes(brandNeedle)) {
  throw new Error('brand needle not found');
}
node.parameters.jsCode = node.parameters.jsCode.replace(brandNeedle, brandInsert);
const modelNeedle = "const currentTurnModel = currentTurnPhoneType ? currentTurnPhoneType.split(/s+/).slice(1).join(' ').trim() || null : null;";
const modelInsert = "const currentTurnModel = currentTurnPhoneType ? currentTurnPhoneType.split(' ').slice(1).join(' ').trim() || null : null;";
if (!node.parameters.jsCode.includes(modelNeedle)) {
  throw new Error('model needle not found');
}
node.parameters.jsCode = node.parameters.jsCode.replace(modelNeedle, modelInsert);
const structNeedle = `const currentTurnHasStructuredProductConstraint = Boolean(
  reference_resolution.reference_type !== 'none'
  || reference_resolution.resolved
  || currentTurnPhoneType
  || currentTurnStorage
  || currentTurnRam
  || currentTurnCondition
);`;
const structInsert = `const currentTurnHasStructuredProductConstraint = Boolean(
  reference_resolution.reference_type !== 'none'
  || reference_resolution.resolved
  || currentTurnPhoneType
  || currentTurnBrand
  || currentTurnStorage
  || currentTurnRam
  || currentTurnCondition
);`;
if (!node.parameters.jsCode.includes(structNeedle)) {
  throw new Error('structured constraint needle not found');
}
node.parameters.jsCode = node.parameters.jsCode.replace(structNeedle, structInsert);
fs.writeFileSync(file, JSON.stringify(wf, null, 2));
console.log('patched Rules Layer brand detection');
