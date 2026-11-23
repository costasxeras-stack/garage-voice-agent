# 0006: Show the call as a phone and the trace as a workshop job card

**Status:** Accepted · 23 November 2026

## Context

Version 0.1.0 used the same visual template as the other portfolio apps: a beige background, a serif heading font and rounded white cards. Next to each other, the apps looked like one template, and nothing on the page said "garage" or "phone call".

## Decision

Give the app its own look built from the subject. The call is a dark navy phone screen with one round call button. The trace for each turn is a white job card with numbered steps, the way a workshop logs a job. Colours come from a garage: mechanic-overall navy, steel grey, signal orange for handoffs and failures, green for passes. Type is Barlow and Barlow Condensed.

The change is styles and markup only. Every element the code uses keeps its ID, so the agent, evals and studio behave exactly as in 0.1.0.

## Consequences

- The page reads as a phone line for a garage before any text is read.
- The round button shows its label underneath, mirrored from the hidden text inside the button, so screen readers still get the button's name.
