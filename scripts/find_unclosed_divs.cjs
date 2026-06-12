const fs = require('fs');
const path = require('path');
const srcFull = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'TestPage.tsx'), 'utf8');
const startMarker = 'if (!testMode) {';
const endMarker = '\n  if (testMode === "pyq") {';
const startIdx = srcFull.indexOf(startMarker);
const endIdx = srcFull.indexOf(endMarker, startIdx);
const src = srcFull.substring(startIdx, endIdx);
const regexOpen = /<div\b[^>]*>/g;
const regexClose = /<\/div>/g;
let openMatch;
let opens = [];
while ((openMatch = regexOpen.exec(src)) !== null) {
  opens.push({index: openMatch.index, text: openMatch[0]});
}
let closeMatch;
let closes = [];
while ((closeMatch = regexClose.exec(src)) !== null) {
  closes.push({index: closeMatch.index, text: closeMatch[0]});
}
// match stack
let stack = [];
let oi = 0, ci = 0;
while (oi < opens.length || ci < closes.length) {
  if (ci >= closes.length || (oi < opens.length && opens[oi].index < closes[ci].index)) {
    stack.push(opens[oi]); oi++;
  } else {
    if (stack.length > 0) stack.pop(); else console.log('Unmatched close at', closes[ci].index);
    ci++;
  }
}
if (stack.length === 0) console.log('All divs matched');
else {
  console.log('Unclosed <div> count:', stack.length);
  stack.forEach(s => {
    const globalIdx = startIdx + s.index;
    const before = srcFull.slice(Math.max(0, globalIdx - 120), globalIdx + 120);
    const line = srcFull.slice(0, globalIdx).split('\n').length;
    console.log('\n--- unclosed <div> at file index', globalIdx, 'line', line, '---');
    console.log('tag:', s.text);
    console.log('context:\n', before);
  });
}
