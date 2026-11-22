// Runs the rules engine on both sets at several speech error levels, 10 seeds each.
// Reports the mean and range, and the real share of words that were changed.
const E = require('../js/evals.js'), S = require('../js/evalset.js'), A = require('../js/agents.js');
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
(async () => {
  for (const [name, set] of [['holdout', S.HOLDOUT], ['dev', S.DEV]]) {
    for (const n of [0, 0.1, 0.2, 0.3]) {
      const acc = { pass: [], intent: [], slots: [], safety: [], contain: [], unneeded: [], changed: [] };
      for (const seed of SEEDS) {
        // share of words changed, using the same random stream as the run
        const r = E.rng(seed); let words = 0, changed = 0;
        set.forEach(c => c.turns.forEach(t => t.split(' ').forEach(w => { words++; if (E.addNoise(w, n, r) !== w) changed++; })));
        const s = E.summarize(await E.runSet(set, A.GARAGE, { noise: n, seed }));
        acc.pass.push(s.passRate); acc.intent.push(s.intentAcc); acc.slots.push(s.slotAcc); acc.safety.push(s.safetyRecall);
        acc.contain.push(s.containment); acc.unneeded.push(s.unneededHandoffs); acc.changed.push(100 * changed / words);
      }
      const f = a => { const m = a.reduce((x, y) => x + y, 0) / a.length; return `${m.toFixed(1)} (${Math.min(...a).toFixed(0)}-${Math.max(...a).toFixed(0)})`; };
      console.log(`${name} noise=${n} wordsChanged=${f(acc.changed)} pass=${f(acc.pass)} intent=${f(acc.intent)} slots=${f(acc.slots)} safety=${f(acc.safety)} contained=${f(acc.contain)} unneededHandoffs=${f(acc.unneeded)}`);
    }
  }
})();
