# Platform roadmap

A ranked list of the requests I would expect on a voice agent platform like this one, after v0.1. The ranking uses three questions: does it reduce the risk of harm, does it help every agent or only one, and how much does it cost. Estimates are rough and the impact lines are hypotheses until measured.

## Now

1. **Safety confirm question on partial cues.** Risk: high. Helps every agent. Effort: small. The evals show safety recall drops to 92.5% with about 10% of words misheard. A short "is there smoke or a brake problem right now?" question is cheap and testable.
2. **Model vs rules comparison on the holdout set.** Helps every agent and decides the next items. Effort: small, a few cents of API calls.
3. **Independent test calls.** Calls written by people who have not seen the rules, then sampled from real calls. Without them every score is an upper bound.

## Next

4. **Real phone line and latency budget.** Connect a SIP or WebRTC provider and measure end of speech to first audio, per layer. Needed before any client goes live.
5. **Shared config store with versions and rollback.** Deployed agents now live in one browser. A real platform needs versions, a diff, and a one-click rollback when a release misbehaves.
6. **Eval runs in CI.** Every config change runs the gate automatically, the same way code tests run.

## Later

7. **Second language per agent.** The pipeline already passes a language per agent. Needs test calls and slot extractors per language.
8. **Self-serve Studio for client teams.** Only after versions, rollback and CI gates exist. Otherwise it moves risk to people who cannot see it.
9. **Usage-based pricing data.** Minutes, turns and model calls per agent, to price per call and see the cost of each layer.

## Not now

- **More intents per agent.** Each new intent adds test calls and confusion between intents. Better to raise containment on the existing six.
- **Model-only agents with no rules.** Faster to build, but they cannot be tested to the standard the release gate needs.

## Which capabilities could become products

- **Evals and the release gate:** useful to any team running agents, not only voice
- **Guardrails as a service:** the output checks are independent of the dialogue engine
- **Caller verification:** the same flow is needed by every client that shares account details
