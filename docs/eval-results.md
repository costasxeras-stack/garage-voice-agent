# Eval results

Rules engine on the garage agent. Produced by `node scripts/noise-sweep.cjs` on 22 November 2026, after the two safety pattern fixes described in the case study. Each noisy line is the mean of 10 random seeds, with the lowest and highest seed in brackets. `wordsChanged` is the measured share of words the speech error simulation dropped or swapped.

All test calls are synthetic and were written by the author of the rules.

```
holdout noise=0 wordsChanged=0.0 (0-0) pass=100.0 (100-100) intent=100.0 (100-100) slots=100.0 (100-100) safety=100.0 (100-100) contained=100.0 (100-100) unneededHandoffs=0.0 (0-0)
holdout noise=0.1 wordsChanged=5.7 (4-8) pass=81.3 (67-100) intent=92.5 (82-100) slots=89.0 (79-100) safety=97.5 (75-100) contained=70.7 (40-100) unneededHandoffs=0.9 (0-2)
holdout noise=0.2 wordsChanged=10.2 (8-12) pass=71.3 (57-93) intent=88.6 (71-100) slots=85.2 (79-97) safety=92.5 (75-100) contained=56.0 (27-100) unneededHandoffs=1.4 (0-3)
holdout noise=0.3 wordsChanged=15.9 (13-18) pass=60.0 (43-80) intent=78.9 (64-96) slots=78.6 (69-90) safety=92.5 (75-100) contained=44.0 (20-73) unneededHandoffs=2.1 (0-4)
dev noise=0 wordsChanged=0.0 (0-0) pass=100.0 (100-100) intent=100.0 (100-100) slots=100.0 (100-100) safety=100.0 (100-100) contained=100.0 (100-100) unneededHandoffs=0.0 (0-0)
dev noise=0.1 wordsChanged=6.0 (4-8) pass=78.5 (45-100) intent=91.6 (70-100) slots=85.8 (63-100) safety=90.0 (60-100) contained=66.5 (29-100) unneededHandoffs=0.4 (0-2)
dev noise=0.2 wordsChanged=10.4 (9-13) pass=72.8 (45-98) intent=90.0 (65-100) slots=81.0 (63-100) safety=88.0 (60-100) contained=57.1 (29-94) unneededHandoffs=0.4 (0-2)
dev noise=0.3 wordsChanged=16.4 (12-19) pass=62.8 (35-88) intent=79.8 (57-97) slots=79.8 (66-92) safety=84.0 (40-100) contained=44.7 (12-77) unneededHandoffs=1.2 (0-4)
```

Output of `node scripts/run-evals.cjs all` (no speech errors): dev 40 of 40 calls passed, holdout 30 of 30, guardrail component tests 12 of 12. The tyre shop template passes 9 of 10 gate tests as shipped. I left that failure in on purpose, see the case study.
