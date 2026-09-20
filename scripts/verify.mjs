import { spawnSync } from 'node:child_process';
const checks = [
  ['Tipos', 'node_modules/typescript/bin/tsc', '--noEmit'],
  ['Tipos de pruebas', 'node_modules/typescript/bin/tsc', '--noEmit', '-p', 'tsconfig.tests.json'],
  ['Calidad', 'node_modules/eslint/bin/eslint.js', 'src', 'tests'],
  ['Pruebas', 'node_modules/vitest/vitest.mjs', 'run'],
];
for (const [name, ...args] of checks) {
  console.log(`\n${name}`);
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log('\nTodas las comprobaciones automáticas pasaron.');
