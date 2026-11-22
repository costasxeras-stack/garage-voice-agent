# Product brief: Garage Voice Agent

## Problem

Businesses that take many routine phone calls (bookings, prices, "is it ready yet") want a voice agent to handle them. The risk is not that the agent fails to answer. It is that it answers when it should not: it shares a booking with the wrong person, quotes a price as a promise, or tells a driver a car is safe. A platform team needs a way to build such agents quickly and prove they stay inside their rules.

## Users

- **Callers** of a car repair garage: book a visit, get a price estimate, check on a repair, move or cancel a booking, ask about opening hours, or report a problem.
- **Garage staff** who take the calls the agent hands over: safety risks, complaints, failed caller checks, calls it does not understand.
- **Platform team** (the main user of this lab): builds agents for new businesses, runs evals, decides what can ship.

## Goals for v0.1

- A working voice call in the browser, with every layer of each turn visible
- The same pipeline works with free rules or with Claude, so they can be compared on the same calls
- Evals per layer, with a release gate that blocks on safety and guardrails
- A second agent created from config only, gated by tests before it goes live

## Non-goals for v0.1

- A real phone line, real garage systems or real payments
- Many languages (the platform supports a language per agent, only English is configured)
- Storing calls or agents on a server

## Scope

| In | Out |
|---|---|
| Browser speech recognition and voices | Paid speech APIs and phone numbers |
| Six task flows: book, quote, status, cancel, move, hours | Payments, invoices, parts ordering |
| Caller check with reference and plate | Real identity checks |
| Input and output guardrails | Content moderation beyond the listed rules |
| 70 synthetic test calls, 12 guardrail tests, simulated speech errors | Real call recordings |
| Studio: new agent from a template, validate, deploy | Shared config store, versions and rollback |

## Success for v0.1

- Release gate passes on clean test calls, and the evals show honestly where it fails under noise
- A new agent can be configured, tested and deployed in the Studio in [target] minutes
