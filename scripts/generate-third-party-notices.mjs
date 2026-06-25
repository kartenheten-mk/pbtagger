import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function parseArgs(argv) {
  const args = {
    nodeJson: 'reports/node-licenses.json',
    pythonJson: 'reports/python-docs-licenses.json',
    output: 'THIRD_PARTY_NOTICES.md',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--node-json') args.nodeJson = argv[++i];
    else if (arg === '--python-json') args.pythonJson = argv[++i];
    else if (arg === '--output') args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readReport(filePath) {
  const fullPath = path.resolve(repoRoot, filePath);
  if (!fs.existsSync(fullPath)) return [];
  return JSON.parse(fs.readFileSync(fullPath, 'utf8')).packages ?? [];
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function table(title, packages, columns) {
  const lines = [
    `## ${title}`,
    '',
    `| ${columns.map((column) => column.label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
  ];

  for (const pkg of packages) {
    lines.push(
      `| ${columns.map((column) => escapeMarkdown(column.value(pkg))).join(' | ')} |`
    );
  }

  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const nodePackages = readReport(args.nodeJson);
const pythonPackages = readReport(args.pythonJson);

const content = `# Third-party notices

This project includes third-party software dependencies for the web application,
development tooling, tests, and documentation build.

The project's own source code is licensed under MIT. See [LICENSE](LICENSE).

The following dependency license tables were generated for the v0.1.0 release
preparation and checked against [license-policy.json](license-policy.json).

${table('Node dependencies', nodePackages, [
  { label: 'Package', value: (pkg) => pkg.name },
  { label: 'Version', value: (pkg) => pkg.version },
  { label: 'Scope', value: (pkg) => pkg.scope },
  { label: 'License', value: (pkg) => pkg.license },
])}

${table('Python documentation dependencies', pythonPackages, [
  { label: 'Package', value: (pkg) => pkg.name },
  { label: 'Version', value: (pkg) => pkg.version },
  { label: 'License', value: (pkg) => pkg.license },
])}
`;

const outputPath = path.resolve(repoRoot, args.output);
fs.writeFileSync(outputPath, content, 'utf8');
console.log(`Wrote ${path.relative(repoRoot, outputPath)}`);