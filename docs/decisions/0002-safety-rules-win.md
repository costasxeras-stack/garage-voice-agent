# 0002: Safety rules always win over the model

**Status:** Accepted · **Date:** 2026-11-22

## Context

Missing a safety call (smoke, brake failure, a crash) is the worst failure this agent can have. A model can miss one. Rules can miss one too, especially when speech recognition drops a word.

## Decision

Safety detection runs as platform rules on every turn, whatever the understanding mode. If the rules flag a safety risk and the model does not, the call is handed off. Safety intents cannot be removed or redefined by an agent config.

## Consequences

- Two independent readers for the riskiest case. A miss needs both to fail
- More false alarms are accepted as the cost, and are counted in the evals as handoffs nobody needed
- Rules alone are not enough under speech errors (see the case study). The next step is a confirm question on partial cues
