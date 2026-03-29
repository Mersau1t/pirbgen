const fs = require('fs');
const code = fs.readFileSync('./src/pages/OracleBenchmark.tsx', 'utf-8');
const lines = code.split('\n');
const stripped = lines.map((line, idx) => {
  if (line.length > 200) return `<LONG LINE STRIPPED>`;
  return `${line}`;
}).join('\n');
fs.writeFileSync('./stripped.tsx', stripped);
