// Runs the browser E2E checks one after another. Needs the Firestore emulator and the dev server
// running (see e2e/README.md). Exits non-zero if any check fails or reports page errors.
const { spawnSync } = require('child_process');
const path = require('path');

const SUITE = [
  'core-flows.cjs', // create/join trip, all split types, edits sync, settle up, people
  'new-trip-people.cjs', // people rows on the start page, quick-add strip
  'balances.cjs', // your balance card, simplify toggle, I paid / Got it
  'people-tab.cjs', // cost per person + total, edit mode
  'big-group.cjs', // 12-person trip: per-person list, show all, simplify hint
  'offline.cjs', // "Can't reach the server" state, offline banner, recovery
  'responsive.cjs', // no horizontal overflow at 320/390/768/1280 on every screen
];

let failed = 0;
for (const file of SUITE) {
  process.stdout.write(`▶ ${file} … `);
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { encoding: 'utf8', timeout: 5 * 60 * 1000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const pageErrors = /ERRORS:? \[\s*[^\]\s]/.test(out); // "ERRORS []" means clean
  const overflow = /OVERFLOW/.test(out);
  if (r.status !== 0 || pageErrors || overflow) {
    failed++;
    console.log('FAILED');
    console.log(out.split('\n').map((l) => '    ' + l).join('\n'));
  } else {
    console.log('ok');
  }
}
console.log(failed ? `\n${failed} check(s) failed` : '\nAll E2E checks passed');
process.exit(failed ? 1 : 0);
