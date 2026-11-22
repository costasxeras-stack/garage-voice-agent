// Optional Claude layer. Uses the visitor's own API key, called from the browser.
// The model only understands the caller (intent and slots) and, if switched on, words the reply.
// Policy, tools and guardrails stay in the platform rules.
(function (root) {
  'use strict';
  var E = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.ENGINE;
  var URL = 'https://api.anthropic.com/v1/messages';

  function call(key, model, system, user, maxTokens, fetchImpl) {
    var f = fetchImpl || fetch, ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 15000) : null;
    return f(URL, {
      method: 'POST', signal: ctl ? ctl.signal : undefined,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: model, max_tokens: maxTokens, system: system, messages: [{ role: 'user', content: user }] })
    }).then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status)); return j; }); })
      .then(function (j) { return (j.content || []).filter(function (c) { return c.type === 'text'; }).map(function (c) { return c.text; }).join(''); })
      .finally(function () { if (timer) clearTimeout(timer); });
  }

  function nluSystem(agent) {
    var intents = E.allIntents(agent);
    var list = Object.keys(intents).map(function (k) { return '- ' + k + ': ' + intents[k].description; }).join('\n') + '\n- out_of_scope: anything else, or nothing clear.';
    var svcs = Object.keys(agent.services).map(function (k) { return k + ' (' + agent.services[k].label + ')'; }).join(', ');
    return 'You are the language understanding step of a phone agent for ' + agent.name + ', a ' + agent.kind + '.\n' +
      'The text comes from speech recognition and can contain errors. Read it by sound: "break" can mean "brake", "for" can mean "four".\n' +
      'Pick exactly one intent:\n' + list + '\n\n' +
      'Slots (only include what the caller said):\n' +
      '- service: one of ' + svcs + '\n- car: the make only, standard spelling (for example Volkswagen, BMW)\n' +
      '- day: monday to sunday, today or tomorrow\n- time: morning, afternoon, any, or HH:MM in 24 hours\n' +
      '- booking_ref: the 4 digits of a booking reference\n- plate: a number plate as letters and digits with no spaces\n\n' +
      'If the caller is answering the agent\'s question for the current task, use the current task as the intent.\n' +
      'Reply with JSON only: {"intent": "...", "confidence": 0.0 to 1.0, "slots": {...}}';
  }

  function makeNlu(key, model, fetchImpl) {
    return function (text, agent, state) {
      var ctx = 'Current task: ' + (state.intent || 'none') + '. The agent is waiting for: ' + (state.confirm ? 'a yes or no' : (state.pending || 'nothing')) + '.\nCaller said: "' + text + '"';
      return call(key, model, nluSystem(agent), ctx, 300, fetchImpl).then(function (txt) {
        var a = txt.indexOf('{'), b = txt.lastIndexOf('}'); if (a < 0 || b < a) throw new Error('no JSON in reply');
        var j = JSON.parse(txt.slice(a, b + 1)), all = E.allIntents(agent);
        if (!(j.intent in all) && j.intent !== 'out_of_scope') j.intent = 'out_of_scope';
        j.confidence = Math.max(0, Math.min(1, +j.confidence || 0)); j.slots = j.slots || {};
        return j;
      });
    };
  }

  var WORD_SYSTEM = 'You rewrite replies for a phone agent so they sound natural when spoken. Keep every fact, day, time, price and reference exactly as given. ' +
    'Do not add advice, diagnoses, promises or prices. Keep it to the same number of sentences or fewer. Reply with the rewritten text only.';
  function makeWord(key, model, fetchImpl) {
    return function (draft) { return call(key, model, WORD_SYSTEM, draft, 200, fetchImpl).then(function (t) { return t.trim().replace(/^"|"$/g, ''); }); };
  }

  var api = { makeNlu: makeNlu, makeWord: makeWord, nluSystem: nluSystem };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LLM = api;
})(this);
