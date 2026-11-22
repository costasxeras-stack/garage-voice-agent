# Changelog

All notable changes to this project. Versions follow [docs/versioning.md](docs/versioning.md).

## [0.1.0] - 2026-11-22

First release.

### Added
- Call tab: talk to a voice agent for a made-up garage with your microphone, or type. Spoken replies, hands-free mode and barge-in.
- A trace of every turn: speech to text, input guardrails, intent, slots, policy with each tool call, output guardrails and text to speech, each with its time.
- Six task flows: book a visit, price estimate, repair status, cancel, move a booking and opening hours. The agent confirms before it books, moves or cancels.
- Caller check with booking reference and number plate before any booking detail is shared.
- Safety handoff for smoke, brake failure, crashes and "is it safe to drive". Handoff for complaints, people who ask for a person, and calls not understood twice.
- Input guardrails that remove card numbers, emails and phone numbers and refuse prompt injection. Output guardrails for safety advice, prices, diagnosis, personal data and reply length.
- Optional Claude layer with your own key: understanding, and wording of replies checked by the guardrails.
- Evals tab: 70 synthetic test calls (40 dev, 30 holdout), simulated speech errors at three levels with 10 seeds, a release gate, a table of runs and 12 guardrail tests.
- Studio tab: agents as config on a shared platform. Create a tyre shop from a template, validate it against platform and agent tests, deploy it and see the time it took.
- Node scripts to run the evals without a browser.
