// Garage Voice Agent: the platform engine.
// Shared by every agent: input guardrails, intent detection, slot extraction, dialogue policy,
// tool calls, output guardrails and the turn trace. An agent is only a config (see agents.js).
// Runs in the browser and in Node (for scripts/run-evals.mjs).
(function (root) {
  'use strict';

  // ---------- text helpers
  function norm(s) {
    return String(s || '').toLowerCase()
      .replace(/[’‘`]/g, "'").replace(/[“”]/g, '"')
      .replace(/[^a-z0-9'€@.:/ ]+/g, ' ')
      .replace(/\.(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  var NUMW = { zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9' };
  function wordsToDigits(s) { return s.replace(/\b(zero|oh|one|two|three|four|five|six|seven|eight|nine)\b/g, function (m) { return NUMW[m]; }); }
  // "1 0 7 7" or "g r g" become "1077" and "grg"
  function joinSpaced(s) { return s.replace(/\b(?:[a-z0-9] ){2,}[a-z0-9]\b/g, function (m) { return m.replace(/ /g, ''); }); }
  function words(s) { return norm(s).split(' ').filter(Boolean).length; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
  function test(pats, t) { return pats.some(function (p) { return new RegExp(p).test(t); }); }

  // ---------- platform intents: every agent gets these, an agent cannot remove them
  var PLATFORM_INTENTS = {
    safety: {
      label: 'Safety risk', description: 'The caller describes a situation that could be dangerous, or asks if the car is safe to drive.',
      patterns: [
        ['smok(e|ing)|steam(ing)? (from|out)', 3], ['\\bfire\\b|flames|\\bburning\\b', 3],
        ["br(a|e)kes? (have |has )?(failed|gone|stopped working|not working|aren't working|don't work)|brake failure|no brakes|barely stop|won't stop", 3],
        ['pedal (goes|went|sinks|is going)( nearly| almost| right)? (to|down to) the floor', 3], ['spongy', 2.5],
        ["(is it|is that|would it be|will it be|is the car|is my car) (still )?(safe|ok|okay|alright|fine) to (drive|keep driving|use)|safe to drive|can i (still|keep) driv|ok to keep driving", 3],
        ['overheat|temperature (gauge|light) .*(red|high)|in the red', 3],
        ['steering( wheel)? (is )?(locked|shaking|vibrat|stiff|gone|pulling hard)', 3], ['shak(es|ing) (really )?(badly|violently)', 2.5],
        ['\\bcrash|accident|collision|hit (a|another|by|the)\\b', 3],
        ['broken down|broke down|stuck on the (motorway|highway|road)|stranded', 3],
        ['flashing (engine |check engine |warning )?light|light is flashing', 3], ['oil pressure', 3],
        ['\\bhurt\\b|injur|bleeding|ambulance', 3]
      ]
    },
    speak_to_human: {
      label: 'Wants a person', description: 'The caller asks to speak to a person.',
      patterns: [['real person|a human|\\bhuman\\b|someone real|speak to (a|an|the|someone)|talk to (a|an|the|someone)|operator|put me through|on the line', 3]]
    },
    complaint: {
      label: 'Complaint', description: 'The caller is unhappy with past work, a price or the service.',
      patterns: [["complain|overcharg|rip ?off|not happy|unhappy|disappointed|terrible|unacceptable|refund|didn't fix|did not fix|still (there|not fixed|broken|the same)|problem is still", 3]]
    },
    goodbye: {
      label: 'Goodbye', description: 'The caller ends the call.',
      patterns: [["\\b(bye|goodbye)\\b|that's (all|everything)|that is all", 2], ['^(thanks|thank you|cheers)( very much| so much)?$', 2]]
    }
  };

  var MAKES = { toyota: 'Toyota', volkswagen: 'Volkswagen', vw: 'Volkswagen', ford: 'Ford', skoda: 'Skoda', opel: 'Opel', vauxhall: 'Vauxhall', bmw: 'BMW', audi: 'Audi', renault: 'Renault', peugeot: 'Peugeot', fiat: 'Fiat', kia: 'Kia', hyundai: 'Hyundai', mercedes: 'Mercedes', merc: 'Mercedes', honda: 'Honda', nissan: 'Nissan', mazda: 'Mazda', volvo: 'Volvo', seat: 'Seat', citroen: 'Citroen', dacia: 'Dacia', tesla: 'Tesla', suzuki: 'Suzuki', mitsubishi: 'Mitsubishi', mini: 'Mini', jeep: 'Jeep', lexus: 'Lexus', porsche: 'Porsche', jaguar: 'Jaguar', cupra: 'Cupra' };
  var DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  var YES = /^(yes|yeah|yep|yup|sure|ok|okay|please|go ahead|correct|perfect|great|do it|book it|sounds good|that's (fine|right|great|perfect|good)|that works|fine)\b/;
  var NO = /^(no|nope|nah|not really|actually no|that doesn't work)\b/;

  // ---------- input guardrails
  function inputGuards(raw) {
    var t0 = now(), flags = [], text = String(raw || ''), block = null;
    var card = /\b(?:\d[ -]?){13,19}\b/g;
    if (card.test(text)) { text = text.replace(card, '[card number removed]'); flags.push({ id: 'pii', detail: 'Card number removed from the transcript' }); block = 'pii_card'; }
    var email = /[\w.+-]+@[\w-]+\.[\w.]+/g;
    if (email.test(text)) { text = text.replace(email, '[email removed]'); flags.push({ id: 'pii', detail: 'Email address removed from the transcript' }); }
    var phone = /(?:\+?\d[ -]?){9,12}\d/g;
    if (phone.test(text)) { text = text.replace(phone, '[phone number removed]'); flags.push({ id: 'pii', detail: 'Phone number removed from the transcript' }); }
    var n = norm(text);
    if (/ignore (all |your |the )?(previous |prior |earlier )?(instructions|rules|prompt)|you are now|developer mode|system prompt|jailbreak|pretend (you|to be)|act as (a|an)\b|forget (your|all) (rules|instructions)/.test(n)) {
      flags.push({ id: 'injection', detail: 'Attempt to change how the agent works' }); block = block || 'injection';
    }
    return { text: text, flags: flags, block: block, ms: now() - t0 };
  }

  // ---------- intent detection (rules)
  function allIntents(agent) {
    var out = {}; Object.keys(PLATFORM_INTENTS).forEach(function (k) { out[k] = PLATFORM_INTENTS[k]; });
    Object.keys(agent.intents).forEach(function (k) { out[k] = agent.intents[k]; }); return out;
  }
  function findService(t, agent) {
    var keys = Object.keys(agent.services);
    for (var i = 0; i < keys.length; i++) if (test(agent.services[keys[i]].patterns, t)) return keys[i];
    return null;
  }
  function classify(text, agent) {
    var t = norm(text), intents = allIntents(agent), scores = {};
    Object.keys(intents).forEach(function (k) {
      var it = intents[k], s = 0, hits = [];
      (it.patterns || []).forEach(function (p) { if (new RegExp(p[0]).test(t)) { s += p[1]; hits.push(p[0]); } });
      (it.negatives || []).forEach(function (p) { if (new RegExp(p[0]).test(t)) { s += p[1]; hits.push('not: ' + p[0]); } });
      scores[k] = { intent: k, score: s, hits: hits };
    });
    var svc = findService(t, agent);
    if (svc && scores.book_service) { scores.book_service.score += 0.8; scores.book_service.hits.push('service mentioned: ' + svc); }
    var ranked = Object.keys(scores).map(function (k) { return scores[k]; }).filter(function (x) { return x.score > 0; })
      .sort(function (a, b) { return b.score - a.score; });
    if (!ranked.length) return { intent: 'out_of_scope', confidence: 0, ranked: [], source: 'rules' };
    var top = ranked[0].score, second = ranked[1] ? ranked[1].score : 0;
    var conf = Math.min(1, top / 2.5) * (1 - 0.5 * second / top);
    return { intent: ranked[0].intent, confidence: Math.round(conf * 100) / 100, ranked: ranked.slice(0, 4), source: 'rules', safetyScore: scores.safety.score };
  }

  // ---------- slot extraction (rules)
  function extractSlots(text, agent, state) {
    var t = norm(text), out = {}, pending = state.pending;
    var svc = findService(t, agent); if (svc) out.service = svc;
    var mk = t.match(new RegExp('\\b(' + Object.keys(MAKES).join('|') + ')\\b(?: ([a-z0-9]+))?'));
    if (mk) { out.car = MAKES[mk[1]]; if (mk[2] && !/^(and|for|is|please|car|the|it|with|on|in)$/.test(mk[2])) out.model = mk[2]; }
    else if (pending === 'car' && words(t) <= 4 && !YES.test(t) && !NO.test(t)) { var w = t.replace(/^(it's|its|it is|a|an|the|my)\s+/g, '').split(' ')[0]; if (w) out.car = cap(w); }
    var d = t.match(/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/); if (d) out.day = d[1];
    if (/\b(morning)\b/.test(t)) out.time = 'morning';
    else if (/\b(afternoon)\b/.test(t)) out.time = 'afternoon';
    else if (/\b(any ?time|whenever|doesn't matter)\b/.test(t)) out.time = 'any';
    else {
      var tw = wordsToDigits(t.replace(/\b(ten|eleven|twelve)\b/g, function (m) { return { ten: '10', eleven: '11', twelve: '12' }[m]; }));
      var tm = tw.match(/\b(\d{1,2})(?::(\d{2}))? ?(am|pm|a m|p m)\b/) || tw.match(/\b(?:at|around|about|for|after|before) (\d{1,2})(?::(\d{2}))?\b/) || tw.match(/(\d{1,2}):(\d{2})/) || (pending === 'time' ? tw.match(/^(?:\D*)(\d{1,2})(?::(\d{2}))?$/) : null);
      if (tm) { var h = +tm[1], m = tm[2] ? +tm[2] : 0, ap = (tm[3] || '').replace(' ', ''); if (ap === 'pm' && h < 12) h += 12; if (!ap && h >= 1 && h <= 6) h += 12; if (h >= 0 && h < 24) out.time = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
    }
    // booking reference: 4 digits, starting 1 or 2, with or without the GRG prefix
    var cue = /\b(reference|ref|booking|number|grg|g r g)\b/.test(t) || pending === 'booking_ref';
    if (cue) { var rt = joinSpaced(wordsToDigits(t.replace(/-/g, ' '))); var r = rt.match(/\b(?:grg ?)?([12]\d{3})\b/); if (r) out.booking_ref = agent.refPrefix + '-' + r[1]; }
    // number plate: only when we asked for it, or the caller names it
    if (pending === 'plate' || /\b(plate|registration|reg)\b/.test(t)) {
      var pt = wordsToDigits(t).replace(/\b(the|plate|number|is|its|it's|my|registration|reg|sorry|um|erm|er|uh|ok|okay|yes|yeah|it|that|car|i|mean|actually|no)\b/g, ' ');
      var cand = pt.replace(/[^a-z0-9]/g, '').toUpperCase();
      if (cand.length >= 4 && cand.length <= 8 && /\d/.test(cand) && /[A-Z]/.test(cand)) out.plate = cand;
    }
    return out;
  }

  // ---------- tools (mock garage systems, sample data only)
  function resolveDay(day, clock) {
    if (day === 'today') return DAYS[clock.getDay()];
    if (day === 'tomorrow') return DAYS[(clock.getDay() + 1) % 7];
    return day;
  }
  var TOOLS = {
    get_opening_hours: function (agent, a) {
      if (a.day) { var h = agent.hours[a.day]; return { day: a.day, open: h ? h[0] : null, close: h ? h[1] : null }; }
      return { hours: agent.hours };
    },
    get_price: function (agent, a) {
      var s = agent.services[a.service], m = agent.premiumMakes.indexOf(a.car) >= 0 ? agent.premiumFactor : 1;
      var r = function (x) { return Math.round(x * m / 10) * 10; };
      return { service: a.service, low: r(s.price[0]), high: r(s.price[1]), note: s.priceNote || '', premium: m > 1 };
    },
    find_slot: function (agent, a, clock) {
      var day = resolveDay(a.day, clock), slots = agent.slots[day] || [];
      if (!slots.length) return { day: day, slot: null, reason: 'closed' };
      var pick = null;
      if (a.time === 'morning') pick = slots.filter(function (s) { return s < '12:00'; })[0];
      else if (a.time === 'afternoon') pick = slots.filter(function (s) { return s >= '12:00'; })[0];
      else if (a.time === 'any') pick = slots[0];
      else {
        var tm = function (s) { var p = s.split(':'); return +p[0] * 60 + +p[1]; }, want = tm(a.time);
        pick = slots.slice().sort(function (x, y) { return Math.abs(tm(x) - want) - Math.abs(tm(y) - want) || tm(y) - tm(x); })[0];
      }
      return { day: day, slot: pick || null, reason: pick ? 'free' : 'none_in_that_part_of_day' };
    },
    create_booking: function (agent, a, clock, db) {
      db.seq = (db.seq || 2100) + 1; var ref = agent.refPrefix + '-' + db.seq;
      db.bookings[ref] = { plate: null, car: a.car, service: a.service, slot: cap(a.day) + ' ' + a.slot, status: 'booked' }; return { ref: ref };
    },
    get_booking: function (agent, a, clock, db) { var b = db.bookings[a.booking_ref]; return b ? { found: true, car: b.car, slot: b.slot, status: b.status } : { found: false }; },
    verify_caller: function (agent, a, clock, db) { var b = db.bookings[a.booking_ref]; return { match: !!(b && b.plate && b.plate === a.plate) }; },
    get_repair_status: function (agent, a, clock, db) { var b = db.bookings[a.booking_ref]; return { status: b.status, detail: b.detail }; },
    cancel_booking: function (agent, a, clock, db) { db.bookings[a.booking_ref].status = 'cancelled'; return { cancelled: true }; },
    move_booking: function (agent, a, clock, db) { db.bookings[a.booking_ref].slot = cap(a.day) + ' ' + a.slot; return { moved: true }; }
  };

  // ---------- output guardrails
  var NEG_BEFORE = /(can't|cannot|can not|not|whether|if|unable to)\W+(\w+\W+){0,4}$/;
  function outputGuards(draft, state) {
    var t0 = now(), v = [], text = String(draft || ''), low = text.toLowerCase();
    // 1. never tell a caller the car is safe to drive
    var re = /(safe|fine|ok|okay|alright)\s+to\s+(drive|keep driving|carry on driving|carry on)/g, m;
    while ((m = re.exec(low))) { if (!NEG_BEFORE.test(low.slice(Math.max(0, m.index - 40), m.index))) { v.push({ id: 'no_safety_clearance', action: 'block', detail: 'Reply said the car is safe to drive' }); break; } }
    // 2. prices are always estimates
    if (/(€|\beur\b|euros?\b|zł|\bpln\b|\$)\s?\d|\d+\s?(€|euros?\b|\beur\b|zł|\bpln\b)/.test(low) && !/estimate|usually|roughly|between|typically|about/.test(low)) {
      v.push({ id: 'price_is_estimate', action: 'rewrite', detail: 'Price given without saying it is an estimate' });
      text = text.replace(/\s*$/, '') + ' This is an estimate. The final price is confirmed after we inspect the car.';
    }
    // 3. no booking details before the caller is verified
    if (/repair_status|cancel_booking|reschedule_booking/.test(state.intent || '') && !state.verified && /(ready|waiting for parts|in the workshop|being (repaired|worked on)|for collection|finished|booked for|is done)/.test(low)) {
      v.push({ id: 'verify_before_status', action: 'block', detail: 'Booking details before the caller was verified' });
    }
    // 4. no diagnosis or reassurance over the phone
    if (/\b(definitely|certainly|for sure|100%|nothing to worry|no need to (bring|come|worry)|it's (just|only) (the|a|your))\b/.test(low)) {
      v.push({ id: 'no_diagnosis', action: 'block', detail: 'Reply diagnosed the car or played down a problem' });
    }
    // 5. no personal data read back
    if (/(?:\d[ -]?){9,}\d|[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) {
      v.push({ id: 'pii_in_reply', action: 'rewrite', detail: 'Personal data in the reply was masked' });
      text = text.replace(/(?:\d[ -]?){9,}\d/g, '[number removed]').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email removed]');
    }
    // 6. short enough to listen to
    var sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
    if (text.split(/\s+/).length > 55 || sentences.length > 4) {
      v.push({ id: 'voice_length', action: 'rewrite', detail: 'Reply too long for a phone call, cut to 3 sentences' });
      text = sentences.slice(0, 3).join(' ');
    }
    var blocked = v.some(function (x) { return x.action === 'block'; });
    return { ok: !v.length, blocked: blocked, violations: v, text: text, ms: now() - t0 };
  }

  // ---------- dialogue policy
  var FLOW_SLOTS = { book: ['service', 'car', 'day', 'time'], quote: ['service', 'car'], status: ['booking_ref', 'plate'], cancel: ['booking_ref', 'plate'], reschedule: ['booking_ref', 'plate', 'day', 'time'], hours: [] };
  var ASK = {
    service: 'What do you need doing? For example a service, brakes, tyres or an inspection.',
    car: 'What make and model is the car?',
    day: 'Which day would suit you?',
    time: 'Morning or afternoon, or a particular time?',
    booking_ref: "What's your booking reference? It's the four digits after GRG.",
    plate: "To keep your details private, what's the car's registration plate?"
  };
  function newState() { return { intent: null, slots: {}, pending: null, confirm: null, verified: false, verifyFails: 0, refFails: 0, lowConf: 0, offer: null, turns: 0, ended: false, guardsFired: [] }; }
  function svcLabel(agent, k) { return k ? agent.services[k].label : 'that'; }
  function hoursText(agent) { return agent.hoursText; }
  function an(w) { return /^[aeiou]/i.test(w) ? 'an ' + w : 'a ' + w; }

  function decide(state, agent, ctx) {
    var thoughts = [], calls = [], s = state.slots, tool = function (name, args) {
      var t0 = now(), res = TOOLS[name](agent, args, ctx.clock, ctx.db); calls.push({ name: name, args: args, result: res, ms: now() - t0 }); return res;
    };
    var done = function (reply, route, extra) { return Object.assign({ reply: reply, route: route, thoughts: thoughts, calls: calls }, extra || {}); };
    var intent = state.intent, conf = agent.intents[intent];
    // platform intents
    if (intent === 'safety') {
      thoughts.push('Safety risk. Policy: never judge whether the car is safe, hand off to a mechanic straight away.');
      var hurt = /hurt|injur|bleeding|crash|accident|collision|ambulance|fire|flames/.test(norm(ctx.text));
      return done((hurt ? 'If anyone is hurt or there is a fire, call 112 now. ' : '') + "If you're driving, pull over somewhere safe and switch off the engine. I can't tell you whether the car is safe to drive. I'm putting you through to a mechanic now.", 'handoff', { reason: 'safety' });
    }
    if (intent === 'speak_to_human') { thoughts.push('Caller asked for a person. Hand off with the context so far.'); return done("Of course. I'm putting you through to a colleague now.", 'handoff', { reason: 'asked_for_person' }); }
    if (intent === 'complaint') { thoughts.push('Complaint. Policy: the agent does not handle complaints, the service manager does.'); return done("I'm sorry to hear that. I'm passing you to the service manager now, with a note so you don't have to repeat yourself.", 'handoff', { reason: 'complaint' }); }
    if (intent === 'goodbye') { thoughts.push('Caller is ending the call.'); return done('Thanks for calling ' + agent.name + '. Goodbye.', 'end'); }
    if (intent === 'out_of_scope' || !conf) {
      state.lowConf++;
      if (state.lowConf >= 2) { thoughts.push('Second turn in a row I could not place. Hand off instead of looping.'); return done("Sorry, I'm not getting this right. I'll put you through to a colleague.", 'handoff', { reason: 'not_understood' }); }
      thoughts.push('No intent matched. Say what I can do.');
      return done("Sorry, I can't help with that on this line. I can book a visit, give a price estimate, check on a repair or tell you our opening hours.", 'clarify');
    }
    state.lowConf = 0;
    var flow = conf.flow, need = FLOW_SLOTS[flow];

    // confirmation answers
    if (state.confirm) {
      var a = norm(ctx.text), c = state.confirm;
      if (YES.test(a)) {
        state.confirm = null;
        if (c.type === 'book') { var b = tool('create_booking', { car: s.car, service: s.service, day: c.day, slot: c.slot }); thoughts.push('Caller confirmed. Create the booking.'); return done("You're booked in for " + cap(c.day) + ' at ' + c.slot + '. Your reference is ' + b.ref + '. Please bring the car in 10 minutes early.', 'resolved', { complete: true }); }
        if (c.type === 'cancel') { tool('cancel_booking', { booking_ref: s.booking_ref }); thoughts.push('Caller confirmed. Cancel the booking.'); return done('Done. Booking ' + s.booking_ref + ' is cancelled.', 'resolved', { complete: true }); }
        if (c.type === 'move') { tool('move_booking', { booking_ref: s.booking_ref, day: c.day, slot: c.slot }); thoughts.push('Caller confirmed. Move the booking.'); return done('Done. Your booking is now on ' + cap(c.day) + ' at ' + c.slot + '.', 'resolved', { complete: true }); }
      } else if (NO.test(a)) {
        state.confirm = null;
        if (c.type === 'cancel') { thoughts.push('Caller said no. Keep the booking.'); return done("No problem, I won't cancel it. Is there anything else?", 'resolved', { complete: true }); }
        delete s.day; delete s.time; state.pending = 'day'; thoughts.push('Caller said no to the offered time. Ask for another day.');
        return done('No problem. Which other day would suit you?', 'collect');
      }
      // anything else: fall through and treat as new information
      state.confirm = null;
    }

    // verification first for anything that touches an existing booking
    if (flow === 'status' || flow === 'cancel' || flow === 'reschedule') {
      if (!s.booking_ref) { state.pending = 'booking_ref'; thoughts.push('Need the booking reference before anything else.'); return done(ASK.booking_ref, 'collect'); }
      var bk = tool('get_booking', { booking_ref: s.booking_ref });
      if (!bk.found) {
        state.refFails++; var bad = s.booking_ref; delete s.booking_ref; state.pending = 'booking_ref';
        if (state.refFails >= 2) { thoughts.push('Reference not found twice. Hand off.'); return done("I still can't find that booking. I'll put you through to a colleague who can look it up.", 'handoff', { reason: 'booking_not_found' }); }
        thoughts.push('No booking with ' + bad + '. Ask again.'); return done("I can't find a booking with reference " + bad + '. Could you check the number and read it again?', 'collect');
      }
      if (!state.verified) {
        if (!s.plate) { state.pending = 'plate'; thoughts.push('Booking found. Verify the caller with the plate before sharing anything.'); return done(ASK.plate, 'collect'); }
        var vr = tool('verify_caller', { booking_ref: s.booking_ref, plate: s.plate });
        if (!vr.match) {
          state.verifyFails++; delete s.plate; state.pending = 'plate';
          if (state.verifyFails >= 2) { thoughts.push('Plate did not match twice. Stop and hand off, do not reveal anything.'); return done("For your security I can't share booking details without a match. I'll put you through to a colleague who can check your ID.", 'handoff', { reason: 'verification_failed' }); }
          thoughts.push('Plate does not match the booking. Ask once more without saying what is on file.'); return done("That plate doesn't match the booking. Could you read it again, letter by letter?", 'collect');
        }
        state.verified = true; thoughts.push('Plate matches. Caller verified.');
      }
      if (flow === 'status') {
        var st = tool('get_repair_status', { booking_ref: s.booking_ref });
        return done('Thanks. ' + st.detail, 'resolved', { complete: true });
      }
      if (flow === 'cancel') { state.confirm = { type: 'cancel' }; state.pending = null; return done('I can see your booking for the ' + bk.car + ' on ' + bk.slot + '. Shall I cancel it?', 'collect'); }
    }

    if (flow === 'hours') {
      var hd = s.day ? resolveDay(s.day, ctx.clock) : null, hr = tool('get_opening_hours', { day: hd });
      thoughts.push(hd ? 'Caller asked about ' + hd + '.' : 'General opening hours.');
      if (hd) return done(hr.open ? 'On ' + cap(hd) + ' we are open ' + hr.open + ' to ' + hr.close + '.' : 'We are closed on ' + cap(hd) + 's. ' + hoursText(agent), 'resolved', { complete: true });
      return done(hoursText(agent), 'resolved', { complete: true });
    }

    // collect the next missing slot
    for (var i = 0; i < need.length; i++) {
      var k = need[i]; if (k === 'booking_ref' || k === 'plate') continue;
      if (!s[k]) { state.pending = k; thoughts.push('Missing ' + k + '. Ask for it.'); return done((flow === 'reschedule' && k === 'day' ? 'Which day would you like to move it to?' : ASK[k]), 'collect'); }
    }
    state.pending = null;

    if (flow === 'quote') {
      var p = tool('get_price', { service: s.service, car: s.car });
      state.offer = 'book';
      return done(cap(an(svcLabel(agent, s.service).toLowerCase())) + ' on ' + an(s.car) + ' is usually ' + agent.currency + p.low + ' to ' + agent.currency + p.high + (p.note ? ' ' + p.note : '') + '. This is an estimate. The final price is confirmed after we inspect the car. Would you like to book it in?', 'resolved', { complete: true });
    }
    if (flow === 'book' || flow === 'reschedule') {
      var fs = tool('find_slot', { day: s.day, time: s.time });
      if (!fs.slot) {
        delete s.day; delete s.time; state.pending = 'day';
        if (fs.reason === 'closed') { thoughts.push(cap(fs.day) + ' is a closed day.'); return done('We are closed on ' + cap(fs.day) + 's. Which other day would suit you?', 'collect'); }
        thoughts.push('Nothing free in that part of ' + fs.day + '.'); return done('Nothing is free then on ' + cap(fs.day) + '. Which other day would suit you?', 'collect');
      }
      thoughts.push('Free slot found. Confirm before booking, never book without a yes.');
      state.confirm = { type: flow === 'book' ? 'book' : 'move', day: fs.day, slot: fs.slot };
      if (flow === 'book') return done('I can do ' + cap(fs.day) + ' at ' + fs.slot + ' for ' + an(svcLabel(agent, s.service).toLowerCase()) + ' on your ' + s.car + '. Shall I book it?', 'collect');
      return done('I can move it to ' + cap(fs.day) + ' at ' + fs.slot + '. Shall I do that?', 'collect');
    }
    return done("Sorry, I can't do that yet.", 'clarify');
  }

  // ---------- one caller turn through the whole pipeline
  // opts: { nlu: async (text, agent, state) => {intent, confidence, slots}, word: async (draft, ctx) => text, clock: Date, db }
  async function turn(state, rawText, agent, opts) {
    opts = opts || {}; var trace = [], T = now();
    var clock = opts.clock || new Date(), db = opts.db;
    state.turns++;
    // 1. input guardrails
    var ig = inputGuards(rawText), text = ig.text;
    ig.flags.forEach(function (f) { state.guardsFired.push(f.id); });
    trace.push({ stage: 'Input guardrails', ms: ig.ms, status: ig.block ? 'block' : ig.flags.length ? 'warn' : 'ok', lines: ig.flags.length ? ig.flags.map(function (f) { return f.detail; }) : ['Nothing to remove or block'] });
    if (ig.block) {
      var msg = ig.block === 'injection' ? "I can't change how I work. I can book a visit, give a price estimate, check on a repair or tell you our opening hours." : "Please don't share card details on this call. I've removed them from the transcript. You pay when you collect the car.";
      trace.push({ stage: 'Policy', ms: 0, status: 'block', lines: ['Thought: input guardrail fired (' + ig.block + '). Refuse and offer what I can do.'] });
      return finish({ reply: msg, route: 'refuse', thoughts: [], calls: [] }, null, null);
    }
    // nothing heard: ask again, hand off after two in a row
    if (!norm(text)) {
      state.noInput = (state.noInput || 0) + 1;
      var gone = state.noInput >= 2;
      trace.push({ stage: 'Policy', ms: 0, status: gone ? 'warn' : 'ok', lines: ['Thought: no words recognised (' + state.noInput + ' in a row).' + (gone ? ' Hand off.' : ' Ask again.'), 'Route: ' + (gone ? 'handoff' : 'collect')] });
      return finish({ reply: gone ? "Sorry, I can't hear you clearly. I'll put you through to a colleague." : "Sorry, I didn't catch that. Could you say it again?", route: gone ? 'handoff' : (state.intent ? 'collect' : 'clarify'), thoughts: [], calls: [] }, null, null);
    }
    state.noInput = 0;
    // 2. intent
    var t1 = now(), rc = classify(text, agent), nl = null, res = rc;
    if (opts.nlu) {
      try { nl = await opts.nlu(text, agent, state); } catch (e) { nl = { error: e.message }; }
      if (nl && !nl.error) {
        res = { intent: nl.intent, confidence: nl.confidence, ranked: [{ intent: nl.intent, score: nl.confidence }], source: 'llm' };
        if (rc.intent === 'safety' && nl.intent !== 'safety') { res.intent = 'safety'; res.override = 'Rules flagged a safety risk the model missed. Safety rules always win.'; }
      } else res = Object.assign({}, rc, { source: 'rules (model call failed: ' + ((nl && nl.error) || 'no reply') + ')' });
    }
    var tIntentMs = now() - t1;
    // keep the current task when the caller is just answering a question
    var prev = state.intent, chosen = res.intent;
    var answering = prev && (state.pending || state.confirm);
    var strong = res.intent === 'safety' || ((res.intent === 'speak_to_human' || res.intent === 'complaint') && res.confidence >= 0.6) || (res.source === 'rules' ? (rc.ranked[0] && rc.ranked[0].score >= 2.5) : res.confidence >= 0.8);
    var yesNo = YES.test(norm(text)) || NO.test(norm(text));
    if (answering && (res.intent === 'out_of_scope' || res.intent === 'goodbye' && yesNo || !strong || res.intent === prev)) chosen = prev;
    // accepting an offer to book after a price
    if (!answering && state.offer === 'book' && YES.test(norm(text))) chosen = 'book_service';
    if (chosen !== prev && prev && chosen !== 'safety' && chosen !== 'speak_to_human' && chosen !== 'complaint') { var keep = { car: state.slots.car, service: state.slots.service }; state.slots = {}; if (keep.car) state.slots.car = keep.car; if (keep.service) state.slots.service = keep.service; state.pending = null; state.confirm = null; state.verified = false; }
    state.offer = null;
    state.intent = chosen;
    var ilines = (res.ranked || []).slice(0, 3).map(function (r) { return r.intent + '  ' + (res.source === 'rules' ? 'score ' + r.score.toFixed(1) : 'confidence ' + r.score); });
    if (!ilines.length) ilines.push('No intent matched');
    if (chosen !== res.intent) ilines.push('Kept the current task (' + chosen + '): the caller is answering my question');
    if (res.override) ilines.push(res.override);
    trace.push({ stage: 'Intent', ms: tIntentMs, status: chosen === 'safety' ? 'warn' : 'ok', lines: ['Source: ' + res.source, 'Chosen: ' + chosen + (res.source === 'rules' && chosen === res.intent ? ' (confidence ' + rc.confidence + ')' : '')].concat(ilines) });
    // 3. slots
    var t2 = now(), sl = extractSlots(text, agent, state);
    if (nl && !nl.error && nl.slots) Object.keys(nl.slots).forEach(function (k) { var v = nl.slots[k]; if (v == null || v === '') return; if (k === 'booking_ref' || k === 'plate') { if (!sl[k]) { var tmp = extractSlots(String(v), agent, Object.assign({}, state, { pending: k })); if (tmp[k]) sl[k] = tmp[k]; } } else if (!sl[k] && (k !== 'service' || agent.services[v])) sl[k] = k === 'day' || k === 'time' ? String(v).toLowerCase() : v; });
    var changed = [];
    Object.keys(sl).forEach(function (k) {
      if (k === 'plate' && state.verified) return;
      if (state.slots[k] !== sl[k]) { state.slots[k] = sl[k]; changed.push(k + ' = ' + sl[k]); }
    });
    trace.push({ stage: 'Slots', ms: now() - t2, status: 'ok', lines: changed.length ? changed : ['Nothing new'] });
    // 4. policy and tools
    var t3 = now(), d = decide(state, agent, { text: text, clock: clock, db: db });
    var plines = d.thoughts.map(function (x) { return 'Thought: ' + x; });
    d.calls.forEach(function (c) { plines.push('Action: ' + c.name + '(' + JSON.stringify(c.args) + ')'); plines.push('Observation: ' + JSON.stringify(c.result)); });
    plines.push('Route: ' + d.route);
    trace.push({ stage: 'Policy', ms: now() - t3, status: d.route === 'handoff' ? 'warn' : 'ok', lines: plines });
    // 5. wording (optional model) + output guardrails
    var draft = d.reply, worded = null;
    if (opts.word && d.route !== 'handoff') { try { worded = await opts.word(d.reply, { agent: agent, state: state }); if (worded) draft = worded; } catch (e) { worded = null; } }
    return finish(d, draft, worded);

    function finish(dd, draftText, wordedText) {
      var og = outputGuards(draftText == null ? dd.reply : draftText, state), out = og.text, glines = [];
      og.violations.forEach(function (v) { state.guardsFired.push(v.id); glines.push(v.id + ': ' + v.detail + (v.action === 'block' ? ' (blocked)' : ' (fixed)')); });
      if (og.blocked) {
        if (wordedText) { var back = outputGuards(dd.reply, state); out = back.text; glines.push('Used the approved template instead of the model wording'); }
        else if (og.violations.some(function (v) { return v.id === 'no_safety_clearance'; })) { out = "I can't tell you whether the car is safe to drive. I'm putting you through to a mechanic now."; dd.route = 'handoff'; }
        else out = "Sorry, I can't answer that over the phone. I'll put you through to a colleague.";
      }
      if (!glines.length) glines.push(wordedText ? 'Model wording checked, nothing to fix' : 'Template reply, nothing to fix');
      trace.push({ stage: 'Output guardrails', ms: og.ms, status: og.blocked ? 'block' : og.violations.length ? 'warn' : 'ok', lines: glines });
      if (dd.route === 'resolved') { var keepCar = state.slots.car, keepSvc = state.offer === 'book' ? state.slots.service : null; state.intent = null; state.slots = {}; if (keepCar) state.slots.car = keepCar; if (keepSvc) state.slots.service = keepSvc; state.pending = null; state.verified = false; state.verifyFails = 0; state.refFails = 0; }
      if (dd.route === 'end' || dd.route === 'handoff') state.ended = true;
      return { reply: out, route: dd.route, reason: dd.reason || null, intent: state.intent || chosenOrNull(), trace: trace, totalMs: now() - T };
    }
    function chosenOrNull() { return typeof chosen === 'undefined' ? null : chosen; }
  }

  var api = { norm: norm, inputGuards: inputGuards, classify: classify, extractSlots: extractSlots, outputGuards: outputGuards, decide: decide, turn: turn, newState: newState, PLATFORM_INTENTS: PLATFORM_INTENTS, MAKES: MAKES, FLOW_SLOTS: FLOW_SLOTS, TOOLS: TOOLS, allIntents: allIntents };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.ENGINE = api;
})(this);
