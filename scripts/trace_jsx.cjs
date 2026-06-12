const fs = require('fs');
const path = require('path');
const srcFull = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'TestPage.tsx'), 'utf8');
const startMarker = 'if (!testMode) {';
const endMarker = '\n  if (testMode === "pyq") {';
const startIdx = srcFull.indexOf(startMarker);
const endIdx = srcFull.indexOf(endMarker, startIdx);
const src = srcFull.substring(startIdx, endIdx);
const regex = /<([A-Za-z][A-Za-z0-9]*)\b[^>]*?(\/?)>|<\/([A-Za-z][A-Za-z0-9]*)\b[^>]*>/g;
let match;
const stack = [];
while ((match = regex.exec(src)) !== null) {
  if (match[1]) {
    const tag = match[1];
    const isSelf = !!match[2];
    console.log('OPEN', tag, 'at', match.index, 'self?', isSelf);
    if (!isSelf) stack.push({tag, index: match.index});
  } else if (match[3]) {
    const tag = match[3];
    console.log('CLOSE', tag, 'at', match.index);
    let i = stack.length - 1;
    while (i >= 0 && stack[i].tag !== tag) i--;
    if (i >= 0) {
      console.log('  matched with', stack[i].tag, 'at', stack[i].index);
      stack.splice(i, 1);
    } else {
      console.log('  unmatched closing', tag);
    }
  }
}
console.log('Remaining stack:', stack.map(s => s.tag));
