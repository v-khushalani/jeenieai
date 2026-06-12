const fs = require('fs');
const path = require('path');
const srcFull = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'TestPage.tsx'), 'utf8');
const startMarker = 'if (!testMode) {';
const startIdx = srcFull.indexOf(startMarker);
const endMarker = '\n  if (testMode === "pyq") {';
const endIdx = srcFull.indexOf(endMarker, startIdx);
const src = srcFull.substring(startIdx, endIdx);
const regex = /<([A-Za-z][A-Za-z0-9]*)\b[^>]*?(\/?)>|<\/([A-Za-z][A-Za-z0-9]*)\b[^>]*>/g;
let match;
const stack = [];
const selfClosing = new Set(['img','input','br','hr','meta','link']);
while ((match = regex.exec(src)) !== null) {
  if (match[1]) {
    const tag = match[1];
    const isSelf = !!match[2] || selfClosing.has(tag.toLowerCase());
    if (!isSelf) {
      stack.push({tag, index: match.index});
    }
  } else if (match[3]) {
    const tag = match[3];
    let i = stack.length - 1;
    while (i >= 0 && stack[i].tag !== tag) i--;
    if (i >= 0) stack.splice(i, 1);
    else console.log('Unmatched closing tag', tag, 'at', match.index);
  }
}
console.log('Remaining stack length:', stack.length);
for (const s of stack) console.log(s.tag, 'at', s.index);
if (stack.length > 0) {
  const s = stack[0];
  console.log('\nContext around unclosed tag:');
  console.log(src.substring(Math.max(0, s.index - 200), s.index + 400));
}
