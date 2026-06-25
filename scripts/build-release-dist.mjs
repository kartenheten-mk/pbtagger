import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import PizZip from 'pizzip';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const distDir = path.join(repoRoot, 'dist');
const outputPath = path.join(repoRoot, `pbtagger-v${version}-dist.zip`);

if (!fs.existsSync(distDir)) {
  console.error('dist/ does not exist. Run npm run build before packaging the release artifact.');
  process.exit(1);
}

const zip = new PizZip();

function addDirectory(directory, zipPrefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) addDirectory(fullPath, zipPath);
    else zip.file(zipPath, fs.readFileSync(fullPath));
  }
}

addDirectory(distDir);

for (const fileName of ['LICENSE', 'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md']) {
  const filePath = path.join(repoRoot, fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`Required release metadata file is missing: ${fileName}`);
    process.exit(1);
  }
  zip.file(fileName, fs.readFileSync(filePath));
}

const buffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync(outputPath, buffer);
console.log(`Wrote ${path.relative(repoRoot, outputPath)} (${buffer.length} bytes)`);