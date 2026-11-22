# 0003: Free browser speech for v0.1

**Status:** Accepted · **Date:** 2026-11-22

## Context

Paid speech APIs give better accuracy, more natural voices and lower latency, but need a key, a server or a bill. This is a public portfolio demo that anyone should be able to try.

## Decision

Use the browser's speech recognition and voices. Simulate speech errors in the evals to measure what worse recognition does to each layer.

## Consequences

- Free and instant for visitors in Chrome, Edge and Safari. Firefox users type instead
- Voice quality and recognition vary by browser, and Chrome sends audio to Google's servers
- Latency numbers in the trace are browser numbers, not phone line numbers
