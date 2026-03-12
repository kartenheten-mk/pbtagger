const fs = require('fs');
let code = fs.readFileSync('src/docx/bookmarkUtils.ts', 'utf8');
code = code.replace(
  `const base = label`,
  `let base = label`
);
fs.writeFileSync('src/docx/bookmarkUtils.ts', code);
