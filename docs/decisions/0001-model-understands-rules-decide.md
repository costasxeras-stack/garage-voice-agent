# 0001: The model understands, the rules decide

**Status:** Accepted · **Date:** 2026-11-22

## Context

A language model reads messy, misheard speech better than patterns do. But what the agent does next (verify, book, cancel, hand off) has to be predictable, explainable and testable, the same way every time.

## Decision

Claude, when switched on, only fills the intent, the slots and optionally the wording of the reply. The dialogue policy, the tool calls and the guardrails stay in code.

## Consequences

- Every action can be traced to a rule and tested in the evals
- Swapping the model, or running with no model, does not change what the agent is allowed to do
- The agent cannot handle a request no flow covers, even if the model understands it. Those calls are handed off
