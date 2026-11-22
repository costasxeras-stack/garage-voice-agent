// Garage Voice Agent: page logic. Speech in and out, the call, evals and the studio.
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  var sess = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} } };
  function toast(t) { var d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(function () { d.remove(); }, 3600); }
  var fmtMs = function (ms) { return ms < 1 ? '<1 ms' : ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(1) + ' s'; };

  // ---------- tabs
  document.querySelector('.tabs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    document.querySelectorAll('[data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
    ['call', 'evals', 'studio', 'how'].forEach(function (t) { $('tab-' + t).hidden = t !== b.dataset.tab; });
    if (b.dataset.tab === 'studio') renderStudio();
  });

  // ---------- agents
  var deployed = []; try { deployed = JSON.parse(store.get('val-agents') || '[]'); } catch (e) { deployed = []; }
  var deployLog = []; try { deployLog = JSON.parse(store.get('val-deploys') || '[]'); } catch (e) { deployLog = []; }
  function agentsAll() { return [AGENTS.GARAGE].concat(deployed); }
  function agentById(id) { return agentsAll().filter(function (a) { return a.id === id; })[0] || AGENTS.GARAGE; }
  function fillAgentPick() {
    var cur = $('agent-pick').value || 'garage';
    $('agent-pick').innerHTML = agentsAll().map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.name) + ' (' + esc(a.kind) + ')</option>'; }).join('');
    $('agent-pick').value = agentsAll().some(function (a) { return a.id === cur; }) ? cur : 'garage';
  }
  var agent = AGENTS.GARAGE;

  // ---------- mode and key
  var mode = 'rules';
  try { var k0 = sess.get('val-key'); if (k0) { $('key').value = k0; $('remember').checked = true; } } catch (e) {}
  $('mode-seg').addEventListener('click', function (e) {
    var b = e.target.closest('[data-mode]'); if (!b) return; mode = b.dataset.mode;
    document.querySelectorAll('#mode-seg [data-mode]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    $('key-box').hidden = mode !== 'llm';
  });
  function saveKey() { sess.set('val-key', $('remember').checked ? $('key').value.trim() : null); }
  $('remember').addEventListener('change', saveKey); $('key').addEventListener('change', saveKey);
  function llmOpts(forEval) {
    var key = $('key').value.trim(); if (!key) return null;
    return { nlu: LLM.makeNlu(key, $('model').value), word: (!forEval && $('word').checked) ? LLM.makeWord(key, $('model').value) : null };
  }

  // ---------- speech
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var synth = window.speechSynthesis;
  if (!SR) { $('sr-note').hidden = false; }
  var rec = null, listening = false, speaking = false, callOn = false, speechEndAt = 0;
  function setLive(kind, text) { $('live').className = 'live ' + kind; $('live-t').textContent = text; }
  function pickVoice(lang) {
    if (!synth) return null; var vs = synth.getVoices() || [];
    return vs.filter(function (v) { return v.lang === lang; })[0] || vs.filter(function (v) { return v.lang && v.lang.indexOf(lang.slice(0, 2)) === 0; })[0] || null;
  }
  function speak(text, onDone) {
    if (!$('speak').checked || !synth) { setLive('', callOn ? 'Your turn' : 'Ready'); onDone && onDone(null); return; }
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text), t0 = performance.now(), started = null;
    u.lang = agent.voice.lang; u.rate = agent.voice.rate || 1; var v = pickVoice(agent.voice.lang); if (v) u.voice = v;
    u.onstart = function () { started = performance.now() - t0; speaking = true; setLive('speaking', 'Speaking'); };
    u.onend = u.onerror = function () { speaking = false; setLive('', callOn ? 'Your turn' : 'Ready'); onDone && onDone(started); };
    synth.speak(u);
  }
  function listen() {
    if (!SR) { $('type').focus(); return; }
    if (listening) { try { rec.stop(); } catch (e) {} return; }
    if (speaking && synth) synth.cancel(); // barge in
    rec = new SR(); rec.lang = agent.voice.lang; rec.interimResults = true; rec.maxAlternatives = 1; rec.continuous = false;
    var finalText = null, conf = null, interimEl = null;
    rec.onstart = function () { listening = true; $('mic').classList.add('on'); $('mic-t').textContent = 'Listening… tap to stop'; setLive('listening', 'Listening'); };
    rec.onspeechend = function () { speechEndAt = performance.now(); };
    rec.onresult = function (ev) {
      var txt = '', fin = false;
      for (var i = ev.resultIndex; i < ev.results.length; i++) { txt += ev.results[i][0].transcript; if (ev.results[i].isFinal) { fin = true; conf = ev.results[i][0].confidence; } }
      if (!interimEl) { interimEl = addMsg('user interim', txt); } else interimEl.firstChild.textContent = txt;
      if (fin) finalText = txt;
    };
    rec.onerror = function (ev) {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('Microphone blocked. Allow it in the browser, or type instead.');
      else if (ev.error === 'network') toast('Speech recognition needs a connection in this browser. Type instead.');
    };
    rec.onend = function () {
      listening = false; $('mic').classList.remove('on'); $('mic-t').textContent = 'Tap to talk';
      if (interimEl) interimEl.remove();
      var asrMs = speechEndAt ? performance.now() - speechEndAt : null; speechEndAt = 0;
      if (finalText !== null) handleUser(finalText, { conf: conf, asrMs: asrMs, voice: true });
      else if (callOn) handleUser('', { conf: null, asrMs: null, voice: true, noSpeech: true });
    };
    try { rec.start(); } catch (e) { toast('Could not start the microphone.'); }
  }

  // ---------- the call
  var state = ENGINE.newState(), db = null, busy = false, log = { calls: 0, turns: 0, resolved: 0, handoffs: 0, refused: 0, guards: 0, ms: [] };
  function freshDb() { return { bookings: JSON.parse(JSON.stringify(agent.bookings || {})), seq: 2100 }; }
  function addMsg(cls, text, meta) {
    var d = document.createElement('div'); d.className = 'msg ' + cls; d.appendChild(document.createTextNode(text));
    if (meta) { var m = document.createElement('span'); m.className = 'meta'; m.innerHTML = meta; d.appendChild(m); }
    $('convo').appendChild(d); $('convo').scrollTop = $('convo').scrollHeight; return d;
  }
  function startCall() {
    agent = agentById($('agent-pick').value); state = ENGINE.newState(); db = freshDb(); callOn = true; log.calls++;
    $('convo').innerHTML = ''; $('ph-name').textContent = agent.name; $('ph-kind').textContent = agent.kind;
    addMsg('sys', 'Call started');
    addMsg('agent', agent.greeting);
    $('mic-t').textContent = SR ? 'Tap to talk' : 'Type below';
    renderState(); renderSession();
    speak(agent.greeting, function () { if ($('hands').checked && callOn) listen(); });
  }
  function endCall(why) { callOn = false; addMsg('sys', why); $('mic-t').textContent = 'Start a new call'; setLive('', 'Call ended'); }
  $('mic').addEventListener('click', function () { if (!callOn) { startCall(); return; } listen(); });
  $('new-call').addEventListener('click', function () { if (synth) synth.cancel(); if (listening && rec) try { rec.abort(); } catch (e) {} startCall(); });
  $('agent-pick').addEventListener('change', function () { if (synth) synth.cancel(); callOn = false; agent = agentById($('agent-pick').value); $('ph-name').textContent = agent.name; $('ph-kind').textContent = agent.kind; $('convo').innerHTML = ''; $('mic-t').textContent = 'Start the call'; renderSample(); renderState(); });
  $('type-form').addEventListener('submit', function (e) {
    e.preventDefault(); var t = $('type').value.trim(); if (!t) return;
    if (!callOn) startCall();
    $('type').value = ''; handleUser(t, { conf: null, asrMs: null, voice: false });
  });

  async function handleUser(text, meta) {
    if (busy) return; busy = true;
    var opts = { clock: new Date(), db: db };
    if (mode === 'llm') { var lo = llmOpts(false); if (!lo) { toast('Add your Claude API key, or switch to Rules'); busy = false; return; } opts.nlu = lo.nlu; opts.word = lo.word; }
    var shown = text ? ENGINE.inputGuards(text).text : '(nothing heard)';
    addMsg('user', shown, meta.voice ? (meta.conf != null && meta.conf > 0 ? 'Heard with ' + Math.round(meta.conf * 100) + '% confidence' : 'Heard by speech recognition') : 'Typed');
    setLive('thinking', 'Thinking');
    var r = await ENGINE.turn(state, text, agent, opts);
    var asr = { stage: 'Speech to text', ms: meta.asrMs || 0, status: 'ok', lines: meta.voice ? ['Browser speech recognition (' + agent.voice.lang + ')', meta.conf ? 'Confidence ' + Math.round(meta.conf * 100) + '%' : 'No confidence score from this browser', meta.asrMs ? 'Time from end of speech to text' : 'Timing not available'] : ['Typed, no speech recognition'] };
    r.trace.unshift(asr);
    var tts = { stage: 'Text to speech', ms: 0, status: 'ok', lines: [$('speak').checked && synth ? 'Waiting for the voice to start' : 'Spoken replies are off'] };
    r.trace.push(tts);
    log.turns++; log.ms.push(r.totalMs); if (r.route === 'resolved') log.resolved++; if (r.route === 'handoff') log.handoffs++; if (r.route === 'refuse') log.refused++;
    log.guards += r.trace.filter(function (s) { return /guardrails/.test(s.stage) && s.status !== 'ok'; }).length;
    addMsg('agent', r.reply, '<span class="route ' + r.route + '">' + r.route + '</span> ' + fmtMs(r.totalMs) + ' pipeline');
    renderTrace(r.trace); renderState(); renderSession();
    busy = false;
    var ended = r.route === 'handoff' || r.route === 'end';
    speak(r.reply, function (startMs) {
      if (startMs != null) { tts.ms = startMs; tts.lines = ['Browser voice (' + agent.voice.lang + ')', 'Time until the voice started']; renderTrace(r.trace); }
      if (ended) endCall(r.route === 'handoff' ? 'Handed off to a person (simulated). Call ended.' : 'Call ended.');
      else if ($('hands').checked && callOn && SR) listen();
    });
    if (!$('speak').checked && ended) endCall(r.route === 'handoff' ? 'Handed off to a person (simulated). Call ended.' : 'Call ended.');
  }

  function renderTrace(tr) {
    $('trace').innerHTML = tr.map(function (s) {
      return '<li><div class="h"><span>' + esc(s.stage) + '<span class="ms">' + fmtMs(s.ms) + '</span></span><span class="pill st-' + s.status + '">' + (s.status === 'ok' ? 'ok' : s.status === 'warn' ? 'flag' : 'blocked') + '</span></div><ul>' + s.lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul></li>';
    }).join('');
  }
  function renderState() {
    var s = state, sl = Object.keys(s.slots).filter(function (k) { return k !== 'model'; }).map(function (k) { return k + ': ' + s.slots[k]; }).join(', ');
    var rows = [['Task', s.intent || 'none yet'], ['Collected', sl || 'nothing yet'], ['Waiting for', s.confirm ? 'a yes or no' : (s.pending || 'nothing')], ['Caller verified', s.verified ? 'yes' : 'no'], ['Guardrails fired', s.guardsFired.length ? s.guardsFired.join(', ') : 'none']];
    $('state-kv').innerHTML = rows.map(function (r) { return '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('');
  }
  function median(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }); return b[Math.floor(b.length / 2)]; }
  function renderSession() {
    var m = median(log.ms);
    var cards = [[log.calls, 'calls'], [log.turns, 'caller turns'], [log.resolved, 'resolved by the agent'], [log.handoffs, 'handed to a person'], [m == null ? 'none' : fmtMs(m), 'median pipeline time per turn']];
    $('session-stats').innerHTML = cards.map(function (c) { return '<div class="stat"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>'; }).join('');
  }
  function renderSample() {
    var b = agent.bookings || {}, keys = Object.keys(b);
    $('sample-tbl').querySelector('tbody').innerHTML = keys.length ? keys.map(function (k) { return '<tr><td>' + esc(k) + '</td><td>' + esc(b[k].plate) + '</td><td>' + esc(b[k].car) + '</td></tr>'; }).join('') : '<tr><td colspan="3" class="empty">This agent has no sample bookings.</td></tr>';
  }

  // ---------- evals
  var runs = [], lastRes = [], filt = 'fail';
  $('ev-run').addEventListener('click', async function () {
    var set = $('ev-set').value, eng = $('ev-engine').value, noise = +$('ev-noise').value;
    var cases = set === 'dev' ? EVALSET.DEV : set === 'holdout' ? EVALSET.HOLDOUT : EVALSET.DEV.concat(EVALSET.HOLDOUT);
    var opts = { noise: noise, seed: 7, onProgress: function (i, n) { $('ev-prog').textContent = i + ' of ' + n + ' calls'; } };
    if (eng === 'llm') { var lo = llmOpts(true); if (!lo) { toast('Add your Claude API key in the Call tab first'); return; } opts.nlu = lo.nlu; }
    var btn = $('ev-run'); btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Running…';
    try {
      var seeds = (noise > 0 && eng === 'rules') ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [7], res = [];
      for (var si = 0; si < seeds.length; si++) {
        opts.seed = seeds[si]; opts.onProgress = function (i, n) { $('ev-prog').textContent = (seeds.length > 1 ? 'seed ' + (si + 1) + ' of ' + seeds.length + ', ' : '') + i + ' of ' + n + ' calls'; };
        var part = await EVALS.runSet(cases, AGENTS.GARAGE, opts);
        if (seeds.length > 1) part.forEach(function (r) { r.id = r.id + ' s' + seeds[si]; });
        res = res.concat(part);
      }
      var s = EVALS.summarize(res), g = EVALS.runGuardTests(EVALSET.GUARD_TESTS);
      lastRes = res;
      runs.unshift({ set: $('ev-set').selectedOptions[0].textContent, eng: eng === 'llm' ? $('model').selectedOptions[0].textContent.replace(/ \(.*\)/, '') : 'Rules', noise: $('ev-noise').selectedOptions[0].textContent.replace(/ \(.*\)/, '') + (seeds.length > 1 ? ', 10 seeds' : ''), s: s });
      renderEval(s, g); $('ev-prog').textContent = 'Done. ' + s.cases + ' calls' + (seeds.length > 1 ? ' (10 seeds pooled).' : '.');
    } catch (e) { toast('Eval run failed: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Run evals';
  });
  function v(x) { return x == null ? 'n/a' : x + '%'; }
  function renderEval(s, g) {
    $('ev-out').hidden = false;
    var gPass = g.every(function (x) { return x.pass; }), ok = s.safetyRecall === 100 && gPass && s.guardHits === 100;
    var why = [];
    if (s.safetyRecall !== 100) why.push('safety recall is ' + v(s.safetyRecall) + ', it must be 100%');
    if (s.guardHits !== 100) why.push('an input guardrail missed a case');
    if (!gPass) why.push('a guardrail component test failed');
    $('gate').className = 'gatebox ' + (ok ? 'ok' : 'fail');
    $('gate').innerHTML = '<b>' + (ok ? 'Release gate passed' : 'Release gate failed') + '</b><p class="sub">The gate blocks a release when any safety call is missed or any guardrail test fails. Quality scores below are tracked, not blocking. ' + (why.length ? 'Blocked because ' + esc(why.join(', ')) + '.' : '') + '</p>';
    var cards = [
      [v(s.passRate), 'calls fully passed', s.passed + ' of ' + s.cases],
      [v(s.safetyRecall), 'safety calls handed to a mechanic', s.safetyN + ' safety calls. Gate: 100%'],
      [v(s.intentAcc), 'intent correct', s.intentN + ' calls with an expected intent'],
      [v(s.slotAcc), 'slots correct', s.slotN + ' values checked'],
      [v(s.routeAcc), 'right outcome at the end', 'resolved, asked, handed off, refused'],
      [v(s.containment), 'contained', 'of ' + s.containN + ' calls the agent should finish alone'],
      [s.unneededHandoffs, 'handoffs nobody needed', 'a person took a call the agent should have handled'],
      [s.medianMs == null ? 'n/a' : fmtMs(s.medianMs), 'median time per turn', 'pipeline only, in your browser']
    ];
    $('ev-stats').innerHTML = cards.map(function (c, i) { return '<div class="stat' + (i === 1 ? ' gate' + (s.safetyRecall === 100 ? '' : ' fail') : '') + '"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span><small>' + esc(c[2]) + '</small></div>'; }).join('');
    $('runs').querySelector('tbody').innerHTML = runs.map(function (r) { var x = r.s; return '<tr><td>' + esc(r.set) + '</td><td>' + esc(r.eng) + '</td><td>' + esc(r.noise) + '</td><td>' + v(x.passRate) + '</td><td>' + v(x.intentAcc) + '</td><td>' + v(x.slotAcc) + '</td><td>' + v(x.safetyRecall) + '</td><td>' + v(x.containment) + '</td><td>' + (x.medianMs == null ? 'n/a' : fmtMs(x.medianMs)) + '</td></tr>'; }).join('');
    renderEvTable(); renderGuards(g);
  }
  function renderEvTable() {
    var rows = lastRes.filter(function (r) { return filt === 'all' || !r.pass; });
    $('ev-tbl').querySelector('tbody').innerHTML = rows.length ? rows.map(function (r) {
      var c = r.case, checks = Object.keys(r.checks).map(function (k) { return '<span class="pill ' + (r.checks[k] ? '' : 'warn') + '">' + esc(k.replace('slot:', '')) + '</span>'; }).join(' ');
      var conv = r.turns.map(function (t) { return '<li>Caller: ' + esc(t.said || '(nothing heard)') + '</li><li>Agent [' + esc(t.route) + ']: ' + esc(t.reply) + '</li>'; }).join('');
      return '<tr class="' + (r.pass ? 'pass' : 'fail') + '"><td><b>' + esc(r.id) + '</b><details><summary class="mini">conversation</summary><ul class="conv">' + conv + '</ul></details></td><td>' + esc(c.intent || 'any') + '<br><span class="mini">' + esc(c.route) + '</span></td><td>' + esc(r.finalIntent || 'none') + '<br><span class="mini">' + esc(r.finalRoute) + '</span></td><td>' + checks + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="empty">No failures in this run.</td></tr>';
  }
  $('ev-filter').addEventListener('click', function (e) { var b = e.target.closest('[data-f]'); if (!b) return; filt = b.dataset.f; document.querySelectorAll('#ev-filter [data-f]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); }); renderEvTable(); });
  function renderGuards(g) {
    g = g || EVALS.runGuardTests(EVALSET.GUARD_TESTS);
    $('g-tbl').querySelector('tbody').innerHTML = g.map(function (x) { return '<tr><td>' + esc(x.draft) + '</td><td>' + esc(x.expect || 'nothing (good reply)') + '</td><td>' + esc(x.got.join(', ') || 'nothing') + '</td><td><span class="pill ' + (x.pass ? '' : 'warn') + '">' + (x.pass ? 'pass' : 'fail') + '</span></td></tr>'; }).join('');
  }

  // ---------- studio
  var LAYERS = [
    ['Safety intents', 'Smoke, brake failure, crashes, "is it safe to drive". Always handed to a person.'],
    ['Handoff', 'Asks for a person, complaints, two turns not understood, two failed checks.'],
    ['Input guardrails', 'Removes card numbers, emails and phone numbers. Refuses prompt injection.'],
    ['Caller check', 'Booking reference plus number plate before any booking detail is shared.'],
    ['Output guardrails', 'No "safe to drive", prices only as estimates, no diagnosis, no personal data, short replies.'],
    ['Dialogue flows', 'Book, quote, status, cancel, move and hours, each with confirm before acting.'],
    ['Slot extractors', 'Car makes, days, times, spoken digits and plates, shared across agents.'],
    ['Deploy gate', 'Platform safety tests plus the agent\'s own tests must all pass.']
  ];
  var viewId = 'garage', tplStart = null, timerInt = null, gatePassed = false;
  function renderStudio() {
    $('layers').innerHTML = LAYERS.map(function (l) { return '<div class="layer"><b>' + esc(l[0]) + '</b>' + esc(l[1]) + '</div>'; }).join('');
    $('agent-list').innerHTML = agentsAll().map(function (a) { var n = Object.keys(a.intents).length; return '<button class="agent-row" data-id="' + esc(a.id) + '" aria-pressed="' + (a.id === viewId) + '"><span><b>' + esc(a.name) + '</b><br><span class="mini">' + esc(a.kind) + ', ' + n + ' own intents, ' + Object.keys(a.services).length + ' services</span></span><span class="pill">live v' + esc(a.version) + '</span></button>'; }).join('');
    var a = agentById(viewId); $('view-name').textContent = a.name; $('cfg-view').textContent = JSON.stringify(a, null, 2);
    var last = deployLog[deployLog.length - 1];
    var cards = [[agentsAll().length, 'agents live in this browser'], [Object.keys(ENGINE.PLATFORM_INTENTS).length + ' + ' + LAYERS.length, 'platform intents and layers shared'], [last ? fmtDur(last.ms) : 'none yet', 'time to deploy, last new agent'], [deployLog.length, 'agents deployed from the Studio']];
    $('plat-stats').innerHTML = cards.map(function (c) { return '<div class="stat"><b>' + esc(c[0]) + '</b><span>' + esc(c[1]) + '</span></div>'; }).join('');
  }
  function fmtDur(ms) { var s = Math.round(ms / 1000); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + (s % 60) + ' s'; }
  $('agent-list').addEventListener('click', function (e) { var b = e.target.closest('[data-id]'); if (!b) return; viewId = b.dataset.id; renderStudio(); });
  function loadTemplate() { $('cfg').value = JSON.stringify(AGENTS.TYRE_TEMPLATE, null, 2); gatePassed = false; $('deploy').disabled = true; $('gate-out').innerHTML = ''; }
  $('new-agent').addEventListener('click', function () {
    $('editor-card').hidden = false; loadTemplate(); tplStart = Date.now();
    clearInterval(timerInt); timerInt = setInterval(function () { $('timer').textContent = 'time on this agent: ' + fmtDur(Date.now() - tplStart); }, 1000);
    $('editor-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('reset-tpl').addEventListener('click', loadTemplate);
  $('cfg').addEventListener('input', function () { gatePassed = false; $('deploy').disabled = true; });
  function schemaErrors(a) {
    var e = [], need = ['id', 'name', 'kind', 'greeting', 'voice', 'currency', 'refPrefix', 'hours', 'hoursText', 'slots', 'services', 'intents', 'tests'];
    need.forEach(function (k) { if (a[k] == null) e.push('Missing "' + k + '"'); });
    if (e.length) return e;
    if (!/^[a-z0-9-]{2,30}$/.test(a.id)) e.push('"id" must be lowercase letters, digits or dashes');
    if (agentsAll().some(function (x) { return x.id === a.id; })) e.push('An agent with id "' + a.id + '" is already live. Change the id.');
    Object.keys(a.intents).forEach(function (k) {
      var it = a.intents[k];
      if (ENGINE.PLATFORM_INTENTS[k]) e.push('Intent "' + k + '" belongs to the platform and cannot be redefined');
      if (!ENGINE.FLOW_SLOTS[it.flow]) e.push('Intent "' + k + '" has an unknown flow "' + it.flow + '". Use one of: ' + Object.keys(ENGINE.FLOW_SLOTS).join(', '));
      (it.patterns || []).concat(it.negatives || []).forEach(function (p) { try { new RegExp(p[0]); } catch (x) { e.push('Intent "' + k + '" has a broken pattern: ' + p[0]); } });
    });
    Object.keys(a.services).forEach(function (k) { var s = a.services[k]; if (!Array.isArray(s.price) || s.price.length !== 2) e.push('Service "' + k + '" needs a price range like [50, 80]'); (s.patterns || []).forEach(function (p) { try { new RegExp(p); } catch (x) { e.push('Service "' + k + '" has a broken pattern: ' + p); } }); });
    if (!a.tests.length) e.push('Add at least one test call for this agent');
    return e;
  }
  var candidate = null;
  $('validate').addEventListener('click', async function () {
    var a; gatePassed = false; $('deploy').disabled = true;
    try { a = JSON.parse($('cfg').value); } catch (x) { $('gate-out').innerHTML = '<div class="gatebox fail"><b>Not valid JSON</b><p class="sub">' + esc(x.message) + '</p></div>'; return; }
    a.premiumMakes = a.premiumMakes || []; a.premiumFactor = a.premiumFactor || 1; a.bookings = a.bookings || {}; a.version = a.version || '0.1';
    var se = schemaErrors(a);
    if (se.length) { $('gate-out').innerHTML = '<div class="gatebox fail"><b>Config problems</b><ul>' + se.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>'; return; }
    var plat = await EVALS.runSet(AGENTS.PLATFORM_TESTS, a, {}), own = await EVALS.runSet(a.tests, a, {});
    var all = plat.concat(own), failed = all.filter(function (r) { return !r.pass; });
    gatePassed = !failed.length; candidate = gatePassed ? a : null; $('deploy').disabled = !gatePassed;
    var row = function (r, src) { var bad = Object.keys(r.checks).filter(function (k) { return !r.checks[k]; }); var got = Object.keys(r.slots).filter(function (k) { return k !== 'model'; }).map(function (k) { return k + '=' + r.slots[k]; }).join(', '); return '<tr><td>' + esc(r.id) + ' <span class="mini">' + src + '</span></td><td>' + esc(r.case.turns[0]) + '</td><td><span class="pill ' + (r.pass ? '' : 'warn') + '">' + (r.pass ? 'pass' : 'failed: ' + esc(bad.join(', '))) + '</span>' + (r.pass ? '' : '<br><span class="mini">expected ' + esc(JSON.stringify(r.case.slots || {})) + ', captured ' + esc(got || 'nothing') + '</span>') + '</td></tr>'; };
    $('gate-out').innerHTML = '<div class="gatebox ' + (gatePassed ? 'ok' : 'fail') + '"><b>' + (gatePassed ? 'Deploy gate passed: ' + all.length + ' of ' + all.length + ' tests' : 'Deploy gate failed: ' + failed.length + ' of ' + all.length + ' tests') + '</b><p class="sub">' + (gatePassed ? 'You can deploy this agent.' : 'Fix the config and validate again. Service patterns are checked in order, and the first match wins.') + '</p></div>' +
      '<div class="tbl-wrap"><table><thead><tr><th>Test</th><th>Caller says first</th><th>Result</th></tr></thead><tbody>' + plat.map(function (r) { return row(r, 'platform'); }).join('') + own.map(function (r) { return row(r, 'agent'); }).join('') + '</tbody></table></div>';
  });
  $('deploy').addEventListener('click', function () {
    if (!gatePassed || !candidate) return;
    deployed.push(candidate); store.set('val-agents', JSON.stringify(deployed));
    var ms = tplStart ? Date.now() - tplStart : 0; deployLog.push({ id: candidate.id, ms: ms, at: new Date().toISOString() }); store.set('val-deploys', JSON.stringify(deployLog));
    clearInterval(timerInt); $('timer').textContent = 'deployed in ' + fmtDur(ms);
    viewId = candidate.id; fillAgentPick(); renderStudio();
    $('gate-out').insertAdjacentHTML('afterbegin', '<div class="gatebox ok"><b>' + esc(candidate.name) + ' is live</b><p class="sub">Time to deploy: ' + fmtDur(ms) + '. Pick it in the Call tab to talk to it.</p></div>');
    candidate = null; gatePassed = false; $('deploy').disabled = true;
  });

  // ---------- start
  fillAgentPick(); renderSample(); renderState(); renderSession(); renderGuards();
  if (synth && synth.onvoiceschanged !== undefined) synth.onvoiceschanged = function () {};
})();
