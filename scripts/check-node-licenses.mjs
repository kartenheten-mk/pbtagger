import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function parseArgs(argv) {
  const args = {
    check: false,
    json: null,
    markdown: null,
    policy: 'license-policy.json',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') args.check = true;
    else if (arg === '--json') args.json = argv[++i];
    else if (arg === '--markdown') args.markdown = argv[++i];
    else if (arg === '--policy') args.policy = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function packageLicense(pkg) {
  const value = pkg.license ?? pkg.licenses;

  if (typeof value === 'string' && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const licenses = value
      .map((entry) => {
        if (typeof entry === 'string') return entry;
        return entry?.type ?? entry?.license ?? entry?.name ?? '';
      })
      .filter(Boolean);
    if (licenses.length > 0) return licenses.join(' OR ');
  }
  if (value && typeof value === 'object') {
    return value.type ?? value.license ?? value.name ?? 'UNKNOWN';
  }

  return 'UNKNOWN';
}

function collectPackages() {
  const nodeModulesDir = path.join(repoRoot, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) {
    throw new Error('node_modules does not exist. Run npm ci before license checks.');
  }

  const lockPath = path.join(repoRoot, 'package-lock.json');
  const lockPackages = fs.existsSync(lockPath) ? readJson(lockPath).packages ?? {} : {};
  const packages = new Map();

  function addPackage(packageDir) {
    const packageJsonPath = path.join(packageDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) return;

    const pkg = readJson(packageJsonPath);
    const relativePath = path.relative(repoRoot, packageDir).replace(/\\/g, '/');
    const lockInfo = lockPackages[relativePath] ?? {};
    const key = `${pkg.name}@${pkg.version}`;
    const existing = packages.get(key);
    const item = {
      name: pkg.name,
      version: pkg.version,
      license: packageLicense(pkg),
      scope: lockInfo.dev ? 'development' : 'runtime',
      path: relativePath,
      repository:
        typeof pkg.repository === 'string'
          ? pkg.repository
          : pkg.repository?.url ?? pkg.homepage ?? '',
    };

    if (!existing || existing.scope === 'development') {
      packages.set(key, item);
    }

    const nestedNodeModules = path.join(packageDir, 'node_modules');
    if (fs.existsSync(nestedNodeModules)) walkNodeModules(nestedNodeModules);
  }

  function walkNodeModules(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.bin') continue;

      const fullPath = path.join(directory, entry.name);
      if (entry.name.startsWith('@')) {
        for (const scopedEntry of fs.readdirSync(fullPath, { withFileTypes: true })) {
          if (scopedEntry.isDirectory()) addPackage(path.join(fullPath, scopedEntry.name));
        }
      } else {
        addPackage(fullPath);
      }
    }
  }

  walkNodeModules(nodeModulesDir);
  return [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function loadPolicy(policyPath) {
  const policy = readJson(path.resolve(repoRoot, policyPath));
  return {
    allowedLicenses: new Set(
      Array.isArray(policy.allowedLicenses)
        ? policy.allowedLicenses
        : Object.keys(policy.allowedLicenses ?? {})
    ),
    allowedPackages: policy.allowedPackages ?? {},
  };
}

function normalizeLicenseExpression(expression) {
  return String(expression ?? 'UNKNOWN')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\s+/g, ' ');
}

function licenseExpressionAllowed(expression, allowedLicenses) {
  const normalized = normalizeLicenseExpression(expression);
  if (allowedLicenses.has(normalized)) return true;
  if (normalized === 'UNKNOWN' || normalized === 'UNLICENSED') return false;

  const stripped = normalized.replace(/[()]/g, '').trim();
  if (allowedLicenses.has(stripped)) return true;

  const orParts = stripped.split(/\s+OR\s+/i).map((part) => part.trim());
  if (orParts.length > 1) {
    return orParts.some((part) => licenseExpressionAllowed(part, allowedLicenses));
  }

  const andParts = stripped.split(/\s+AND\s+/i).map((part) => part.trim());
  if (andParts.length > 1) {
    return andParts.every((part) => licenseExpressionAllowed(part, allowedLicenses));
  }

  return false;
}

function evaluatePackages(packages, policy) {
  return packages.map((pkg) => {
    const id = `${pkg.name}@${pkg.version}`;
    const packageException = policy.allowedPackages[id];
    const allowed = Boolean(packageException) || licenseExpressionAllowed(pkg.license, policy.allowedLicenses);
    return {
      ...pkg,
      id,
      allowed,
      policy: packageException ? 'package-exception' : 'license-policy',
      rationale: packageException ?? '',
    };
  });
}

function markdownTable(packages) {
  const lines = [
    '## Node dependencies',
    '',
    '| Package | Version | Scope | License |',
    '| --- | --- | --- | --- |',
  ];

  for (const pkg of packages) {
    lines.push(
      `| ${escapeMarkdown(pkg.name)} | ${escapeMarkdown(pkg.version)} | ${pkg.scope} | ${escapeMarkdown(pkg.license)} |`
    );
  }

  return `${lines.join('\n')}\n`;
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

const args = parseArgs(process.argv.slice(2));
const policy = loadPolicy(args.policy);
const packages = evaluatePackages(collectPackages(), policy);
const failures = packages.filter((pkg) => !pkg.allowed);

if (args.json) {
  const outputPath = path.resolve(repoRoot, args.json);
  ensureParentDir(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify({ packages }, null, 2)}\n`);
}

if (args.markdown) {
  const outputPath = path.resolve(repoRoot, args.markdown);
  ensureParentDir(outputPath);
  fs.writeFileSync(outputPath, markdownTable(packages));
}

console.log(`Checked ${packages.length} Node packages. ${failures.length} not allowed.`);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`Disallowed Node license: ${failure.id} (${failure.license})`);
  }
}

if (args.check && failures.length > 0) process.exit(1);