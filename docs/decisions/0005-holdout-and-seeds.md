# 0005: A holdout set and many seeds for noisy evals

**Status:** Accepted · **Date:** 2026-11-22

## Context

Rules tuned on a test set will score well on that set. And a small set run once with random speech errors gives a different answer each time.

## Decision

Write and commit the holdout calls before the rules, tune only on the dev set, and report holdout numbers separately. Run every noisy rule eval with 10 fixed seeds and report the mean and range.

## Consequences

- One seed showed 100% safety recall under noise. Ten seeds showed it was not. The gate now fails when it should
- The holdout is still written by the rules author, so clean scores are labelled as an upper bound
- Claude runs use one seed to keep the cost down, so they are noisier than rule runs
