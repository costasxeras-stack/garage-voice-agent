// Eval runner. Plays each test call through the engine and scores every layer.
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.ENGINE;

  // Fixed clock for evals: Monday 23 November 2026, 10:00. "Tomorrow" is always Tuesday.
  var EVAL_CLOCK = new Date(2026, 10, 23, 10, 0, 0);

  // Simulated speech recognition errors. Seeded, so a run can be repeated.
  var CONFUSIONS = { brake: 'break', brakes: 'breaks', tyres: 'tires', tyre: 'tire', four: 'for', two: 'to', mot: 'em oh tee', skoda: 'scoda', cancel: 'cancer', service: 'serves', price: 'prize', ready: 'reddy', booking: 'looking', clutch: 'clutches', hours: 'ours', inspection: 'inspections', oil: 'all', battery: 'battle', monday: 'mundane', smoke: 'smoked', crash: 'crush', steering: 'steering', engine: 'and gin' };
  function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
  function addNoise(text, rate, rand) {
    return text.split(' ').map(function (w) {
      var bare = w.toLowerCase().replace(/[^a-z]/g, '');
      if (rand() >= rate) return w;
      if (CONFUSIONS[bare]) return CONFUSIONS[bare];
      return rand() < 0.5 ? '' : w; // dropped word
    }).filter(Boolean).join(' ');
  }

  function freshDb(agent) { return { bookings: JSON.parse(JSON.stringify(agent.bookings || {})), seq: 2100 }; }

  async function runCase(c, agent, opts) {
    opts = opts || {}; var state = E.newState(), db = freshDb(agent), turns = [], rand = rng(opts.seed || 7), last = null, ms = 0;
    for (var i = 0; i < c.turns.length; i++) {
      var said = opts.noise ? addNoise(c.turns[i], opts.noise, rand) : c.turns[i];
      var r = await E.turn(state, said, agent, { clock: EVAL_CLOCK, db: db, nlu: opts.nlu, word: opts.word });
      ms += r.totalMs; turns.push({ said: said, reply: r.reply, route: r.route, intent: r.intent, trace: r.trace });
      last = r; if (state.ended) break;
    }
    // slots: remember every value that was ever captured during the call
    var seen = {};
    turns.forEach(function (t) { t.trace.forEach(function (s) { if (s.stage === 'Slots') s.lines.forEach(function (l) { var m = l.match(/^(\w+) = (.+)$/); if (m) seen[m[1]] = m[2]; }); }); });
    var res = { id: c.id, case: c, turns: turns, finalRoute: last.route, finalIntent: last.intent, slots: seen, guards: state.guardsFired.slice(), ms: ms / turns.length };
    res.checks = {};
    if (c.intent !== undefined && c.intent !== null) res.checks.intent = last.intent === c.intent;
    if (c.slots) Object.keys(c.slots).forEach(function (k) { res.checks['slot:' + k] = String(seen[k] || '').toLowerCase() === String(c.slots[k]).toLowerCase(); });
    res.checks.route = last.route === c.route;
    if (c.safety) res.checks.safety = turns.some(function (t) { return t.route === 'handoff' && /safe to drive|112/.test(t.reply); });
    if (c.guard) res.checks.guard = state.guardsFired.indexOf(c.guard) >= 0;
    // a handoff that was not expected, and safety triggered where it should not have been
    res.unneededHandoff = c.route !== 'handoff' && turns.some(function (t) { return t.route === 'handoff'; });
    res.falseSafety = !c.safety && turns.some(function (t) { return t.route === 'handoff' && /safe to drive/.test(t.reply); });
    res.pass = Object.keys(res.checks).every(function (k) { return res.checks[k]; });
    return res;
  }

  async function runSet(cases, agent, opts) {
    var out = [];
    for (var i = 0; i < cases.length; i++) { out.push(await runCase(cases[i], agent, opts)); if (opts && opts.onProgress) opts.onProgress(i + 1, cases.length); }
    return out;
  }

  function pct(a, b) { return b ? Math.round(1000 * a / b) / 10 : null; }
  function summarize(results) {
    var n = results.length, f = function (fn) { return results.filter(fn).length; };
    var intentCases = results.filter(function (r) { return 'intent' in r.checks; });
    var slotChecks = []; results.forEach(function (r) { Object.keys(r.checks).forEach(function (k) { if (k.indexOf('slot:') === 0) slotChecks.push(r.checks[k]); }); });
    var safetyCases = results.filter(function (r) { return 'safety' in r.checks; });
    var guardCases = results.filter(function (r) { return 'guard' in r.checks; });
    var shouldResolve = results.filter(function (r) { return r.case.route === 'resolved'; });
    var sorted = results.map(function (r) { return r.ms; }).sort(function (a, b) { return a - b; });
    return {
      cases: n, passed: f(function (r) { return r.pass; }),
      passRate: pct(f(function (r) { return r.pass; }), n),
      intentAcc: pct(intentCases.filter(function (r) { return r.checks.intent; }).length, intentCases.length), intentN: intentCases.length,
      slotAcc: pct(slotChecks.filter(Boolean).length, slotChecks.length), slotN: slotChecks.length,
      routeAcc: pct(f(function (r) { return r.checks.route; }), n),
      safetyRecall: pct(safetyCases.filter(function (r) { return r.checks.safety; }).length, safetyCases.length), safetyN: safetyCases.length,
      falseSafety: f(function (r) { return r.falseSafety; }),
      guardHits: pct(guardCases.filter(function (r) { return r.checks.guard; }).length, guardCases.length), guardN: guardCases.length,
      containment: pct(shouldResolve.filter(function (r) { return r.finalRoute === 'resolved'; }).length, shouldResolve.length), containN: shouldResolve.length,
      unneededHandoffs: f(function (r) { return r.unneededHandoff; }),
      medianMs: sorted.length ? Math.round(sorted[Math.floor(sorted.length / 2)] * 10) / 10 : null
    };
  }

  function runGuardTests(tests) {
    return tests.map(function (g) {
      var r = E.outputGuards(g.draft, g.state), ids = r.violations.map(function (v) { return v.id; });
      var pass = g.expect ? ids.indexOf(g.expect) >= 0 : ids.length === 0;
      return { id: g.id, draft: g.draft, expect: g.expect, got: ids, pass: pass, out: r.text };
    });
  }

  var api = { runCase: runCase, runSet: runSet, summarize: summarize, runGuardTests: runGuardTests, addNoise: addNoise, rng: rng, EVAL_CLOCK: EVAL_CLOCK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.EVALS = api;
})(this);
