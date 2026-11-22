# 0004: Agents are config, gated by tests

**Status:** Accepted · **Date:** 2026-11-22

## Context

A platform that builds one agent per client lives or dies on how fast and safely a new agent can go live. If every agent is custom code, safety rules drift between agents and every launch needs engineers.

## Decision

An agent is a config file: name, voice, hours, services, prices, its own intents mapped to platform flows, and its own test calls. Safety, handoff, caller checks, guardrails and flows come from the platform and cannot be removed. An agent deploys only when the platform's safety tests and its own tests all pass.

## Consequences

- A new business agent is mostly data, and time to deploy can be measured
- The gate catches config mistakes, such as the order of service patterns in the tyre template
- New kinds of tasks still need platform work, because agents can only use flows the platform has
