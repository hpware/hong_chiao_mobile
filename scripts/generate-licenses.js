#!/usr/bin/env node
/**
 * Collects the licenses of every package that ships in the app (production dependencies,
 * including transitive ones) into src/generated/licenses.json for the 授權條款 screen.
 * Run after changing dependencies:  node scripts/generate-licenses.js
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dirs = execSync('npm ls --omit=dev --all --parseable', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  .split('\n')
  .filter((d) => d && path.resolve(d) !== root);

const MIT = `MIT License

Copyright (c) {holder}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;

const texts = [];
const textIndex = new Map();
const packages = new Map();

const licenseFile = (dir) =>
  fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i.test(f)) ??
  fs.readdirSync(dir).find((f) => /^licen[cs]e/i.test(f));

for (const dir of [...new Set(dirs)]) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    continue;
  }
  if (!pkg.name || packages.has(`${pkg.name}@${pkg.version}`)) continue;
  const license =
    typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? pkg.licenses?.map((l) => l.type ?? l).join(' OR ') ?? '未標示';
  const file = licenseFile(dir);
  let text = null;
  if (file) {
    const body = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n').trim();
    if (!textIndex.has(body)) {
      textIndex.set(body, texts.length);
      texts.push(body);
    }
    text = textIndex.get(body);
  }
  // No license file shipped: fall back to the standard MIT text for MIT packages.
  if (text === null && /^MIT$/.test(license)) {
    const holder = (typeof pkg.author === 'string' ? pkg.author.replace(/\s*<[^>]*>/, '') : pkg.author?.name) || `${pkg.name} contributors`;
    const body = MIT.replace('{holder}', holder);
    if (!textIndex.has(body)) {
      textIndex.set(body, texts.length);
      texts.push(body);
    }
    text = textIndex.get(body);
  }
  const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  packages.set(`${pkg.name}@${pkg.version}`, {
    name: pkg.name,
    version: pkg.version,
    license,
    author: typeof pkg.author === 'string' ? pkg.author.replace(/\s*<[^>]*>/, '') : pkg.author?.name,
    repository: repo?.replace(/^git\+/, '').replace(/\.git$/, '').replace(/^git:\/\//, 'https://'),
    text,
  });
}

const out = { packages: [...packages.values()].sort((a, b) => a.name.localeCompare(b.name)), texts };
fs.mkdirSync(path.join(root, 'src/generated'), { recursive: true });
fs.writeFileSync(path.join(root, 'src/generated/licenses.json'), JSON.stringify(out));
console.log(`${out.packages.length} packages, ${texts.length} distinct license texts`);
