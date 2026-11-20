#!/usr/bin/env node
/**
 * Verify that package.json, package.json#dsh.version, and marketplace.json agree.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const market = JSON.parse(readFileSync(join(root, 'marketplace.json'), 'utf8'));

const fields = {
  'package.json version': pkg.version,
  'package.json dsh.version': pkg.dsh?.version,
  'marketplace.json plugins[0].version': market.plugins?.[0]?.version,
};

const unique = new Set(Object.values(fields));
for (const [k, v] of Object.entries(fields)) {
  console.log(`${v ? 'ok  ' : 'FAIL'} ${k}: ${v ?? '(missing)'}`);
}
if (unique.size !== 1 || unique.has(undefined)) {
  console.error('Version drift detected across manifests!');
  process.exit(1);
}
console.log(`\nAll manifests synchronized at v${pkg.version}`);
