# Case study: Garage Voice Agent

## The question

A voice agent that answers customer calls has to do several jobs at once: hear the caller, work out what they want, collect details, call the right systems, stay inside rules it must never break, and know when to hand over to a person. I wanted to build one end to end, small enough to run in a browser, and use it to answer three platform questions:

1. Which parts should a language model do, and which must stay as rules that can be tested?
2. What should be measured before an agent goes live, and what should block a release?
3. What should a new agent define, and what should it inherit from the platform?

## Approach

I picked a made-up car repair garage because its calls are familiar and still have the hard parts: a caller must be verified before hearing anything about a booking, prices must not sound like promises, and some calls (smoke, brake failure, a crash) must go to a person at once.

I split the agent into layers that each leave a trace: speech to text, input guardrails, intent, slots, policy and tools, optional model wording, output guardrails and text to speech. The policy and the guardrails are code. The understanding step can be rules or Claude.

Before writing any intent rules I wrote 30 holdout test calls and committed them (commit `b0288ed`). I then wrote 40 dev calls and tuned the rules only on those. After that I added a speech error simulation and ran every level with 10 random seeds.

## Headline numbers

Rules engine, holdout set, 22 November 2026. Synthetic test calls. Noisy columns are the mean of 10 seeds.

| | No errors | ~6% of words wrong | ~10% | ~16% |
|---|---|---|---|---|
| Calls fully passed | 100% | 81.3% | 71.3% | 60.0% |
| Intent correct | 100% | 92.5% | 88.6% | 78.9% |
| Safety calls handed to a mechanic | 100% | 97.5% | 92.5% | 92.5% |
| Contained | 100% | 70.7% | 56.0% | 44.0% |

Full output, including the dev set and the range across seeds: [eval-results.md](eval-results.md).

## Findings

### 1. A clean score from your own test set says very little

**What:** The rules pass 30 of 30 holdout calls and 40 of 40 dev calls without speech errors.

**Evidence:** The holdout was committed before the rules existed, but I wrote both, so I knew the phrasing when I wrote the patterns.

**Why it matters:** A team that ships on its own test set sees 100% and learns nothing. The fix is test calls from people who have not seen the rules, ideally sampled from real calls.

**Status:** Confirmed for this project. The number is reported as an upper bound.

### 2. Speech errors cost containment much more than they cost intent

**What:** With about 10% of words dropped or misheard, intent accuracy falls to 88.6% but containment falls to 56.0%.

**Evidence:** Containment needs every slot in a multi-turn call to be right (service, car, day, time, or reference and plate). One lost word in any turn breaks the task. Intent only needs one correct guess.

**Why it matters:** Intent accuracy is the number most agent dashboards show first. For a voice agent it hides most of the loss. The per-task completion rate is the number to manage.

**Status:** Confirmed on synthetic calls with simulated errors. Real speech errors are not random word drops, so the size of the gap is a hypothesis until it is measured on real audio.

### 3. One random seed hid a safety miss

**What:** My first noisy run used one seed and showed 100% safety recall. Ten seeds showed 82% to 97.5% on average, depending on the set and noise level.

**Evidence:** [eval-results.md](eval-results.md). The worst seed reached 75% on the holdout set.

**Why it matters:** Safety is the one metric that blocks a release. A small eval set with one noise sample can pass a gate it should fail. The Evals tab now runs 10 seeds for noisy rule runs, and the release gate fails under noise.

**Status:** Confirmed.

### 4. Most safety misses under noise are lost words, and only some can be fixed with patterns

**What:** I listed every missed safety call across 30 noisy runs. Most lost the key word itself: "the steering wheel is really badly on the motorway" lost "shaking", "I've broken on the motorway" lost "down", and "the brakes feel and the pedal nearly to the floor" lost "spongy" and "goes". Two were fixable from the dev set: "breaks" heard for "brakes", and "burning" without "smell".

**Evidence:** After those two fixes, dev safety recall under noise rose by 2 to 4 points. Holdout did not change, which is what you would expect if the fix was not tuned to it.

**Why it matters:** More patterns will not close the gap. The next design is a confirm question when a partial safety cue is heard, and a model as a second reader (see decision 0002).

**Status:** Confirmed that patterns alone do not close it. The confirm question is a hypothesis to test next.

### 5. The deploy gate caught a real config bug

**What:** The tyre shop template fails 1 of its 10 gate tests. "Can I book my winter tyre swap" is read as a normal tyre fitting, because the general "tyres" pattern is listed before the seasonal swap.

**Evidence:** I found this the first time the gate ran. I left it in the template on purpose: the Studio shows the gate blocking the deploy, the failed test, what was expected and what was captured. Reordering the services fixes it.

**Why it matters:** Config-driven agents move fast, and order-dependent rules are an easy mistake. Tests that travel with each agent catch it before callers do.

**Status:** Confirmed.

### 6. The model wording needs its own guardrail layer, not only the prompt

**What:** With a mocked model reply ("Good news, it's safe to drive. Brakes on an Audi cost €200."), the output guardrails blocked the reply and used the approved template instead. With a mocked model that missed "smoke", the safety rules still handed the call to a mechanic.

**Evidence:** Browser test with a mocked API, and 12 guardrail component tests in the Evals tab.

**Why it matters:** The prompt says "do not add advice or prices", but prompts are not guarantees. The guardrails are code, so they can be tested and versioned.

**Status:** Confirmed with mocked replies. Not yet measured with live model output.

## What my own approach got wrong

- I first measured noise with one seed and almost reported 100% safety recall under noise.
- My first measure of "share of words changed" was wrong. It did not follow the same random stream as the run, so the three noise levels looked almost the same. I rewrote it.
- After a price quote the agent offered to book, but a "yes" lost the service and the agent asked again. The browser test caught it.

## What I would do next

1. Run the holdout set with Claude Haiku and Sonnet, with and without speech errors, and compare containment and safety recall with rules
2. Add the safety confirm question and measure whether it closes the gap under noise
3. Get test calls from people who have not seen the rules
4. Put the agent on a real phone line and measure turn latency from end of speech to first audio
5. Track the platform metrics in the README on real traffic: containment, unneeded handoffs, p95 latency, time to deploy and effort per client

## What I learned as a PM

- For a voice agent, the metric that matters is task completion across turns, not intent accuracy.
- The release gate should be small and strict (safety, guardrails), and quality metrics should be tracked but not blocking. Otherwise every release becomes an argument.
- Splitting "platform" from "agent config" makes the roadmap easier to discuss. Platform work (safety, guardrails, flows) helps every agent. Agent work helps one client.
- Evals need the same care as the product. A small set, one seed or a test set written by the builder can each give a false sense of safety.

## Limits

- Synthetic test calls written by one person. 70 calls in total, with 9 safety calls.
- Speech errors are simulated as random word drops and common mishearings, not real audio.
- Tools read and write sample data in the page. Handoff ends the call with a message.
- Browser speech recognition varies by browser and may use the browser maker's servers.
- Deployed agents are saved in one browser only.
