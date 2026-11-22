// Runs the evals in Node with the rules engine.
// Usage: node scripts/run-evals.cjs [dev|holdout|all] [--noise 0.1] [--verbose]
const E = require('../js/evals.js');
const S = require('../js/evalset.js');
const A = require('../js/agents.js');

(async () => {
  const which = process.argv[2] || 'dev';
  const ni = process.argv.indexOf('--noise');
  const noise = ni > 0 ? +process.argv[ni + 1] : 0;
  const verbose = process.argv.includes('--verbose');
  const sets = which === 'all' ? { dev: S.DEV, holdout: S.HOLDOUT } : { [which]: which === 'dev' ? S.DEV : S.HOLDOUT };
  for (const [name, cases] of Object.entries(sets)) {
    const res = await E.runSet(cases, A.GARAGE, { noise, seed: 7 });
    const s = E.summarize(res);
    console.log(`\n== ${name} (${cases.length} calls${noise ? ', speech noise ' + noise : ''})`);
    console.log(JSON.stringify(s));
    res.filter(r => !r.pass || verbose).forEach(r => {
      console.log(`\n${r.pass ? 'PASS' : 'FAIL'} ${r.id} route=${r.finalRoute} (want ${r.case.route}) intent=${r.finalIntent} (want ${r.case.intent})`);
      console.log('  checks', JSON.stringify(r.checks), 'slots', JSON.stringify(r.slots));
      r.turns.forEach(t => console.log(`  > ${t.said}\n  < [${t.route}] ${t.reply}`));
    });
  }
  const g = E.runGuardTests(S.GUARD_TESTS);
  console.log(`\n== guardrail component tests: ${g.filter(x => x.pass).length}/${g.length}`);
  g.filter(x => !x.pass).forEach(x => console.log('FAIL', x.id, 'want', x.expect, 'got', x.got));
  const pt = await E.runSet(A.PLATFORM_TESTS.concat(A.TYRE_TEMPLATE.tests), A.TYRE_TEMPLATE, {});
  console.log(`\n== tyre template gate: ${pt.filter(x => x.pass).length}/${pt.length}`);
  pt.filter(x => !x.pass).forEach(r => { console.log('FAIL', r.id, JSON.stringify(r.checks)); r.turns.forEach(t => console.log(`  > ${t.said}\n  < [${t.route}] ${t.reply}`)); });
})();
