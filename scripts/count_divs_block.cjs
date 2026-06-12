const fs = require('fs');
const path = require('path');
const srcFull = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'TestPage.tsx'), 'utf8');
const startMarker = 'if (!testMode) {';
const endMarker = '\n  if (testMode === "pyq") {';
const startIdx = srcFull.indexOf(startMarker);
const endIdx = srcFull.indexOf(endMarker, startIdx);
if (startIdx === -1 || endIdx === -1) {
  console.error('Markers not found');
  process.exit(1);
}
const src = srcFull.substring(startIdx, endIdx);
const open = (src.match(/<div\b/g) || []).length;
const close = (src.match(/<\/div>/g) || []).length;
console.log('open <div>:', open);
console.log('close </div>:', close);
let diff = open - close;
console.log('difference (open - close):', diff);
// show last 200 chars before end
console.log('\n--- tail of block (last 400 chars) ---\n');
console.log(src.slice(-400));
