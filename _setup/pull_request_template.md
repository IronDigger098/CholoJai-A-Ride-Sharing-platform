<!--
  Keep this short and honest. A reviewer should understand the change
  without reading the diff first, and should know exactly what to look at
  closely. Delete any section that genuinely does not apply.
-->

## What changed

<!-- One or two sentences. The diff shows *what*; this says it in prose. -->

## Why

<!-- The reason the change exists. Link the issue or milestone.
     "Because the ticket said so" is not a reason — what problem does a
     user or an operator have without this? -->

Closes #

## How it was verified

<!-- Not "tests pass" — CI already says that. What did you actually run,
     and what did you observe? Include the failure path you exercised. -->

- [ ] `pnpm verify` green locally
- [ ] Failure paths exercised, not just the happy path

## Review focus

<!-- Where should a reviewer spend their attention? Name the risky part.
     A PR that says "look closely at the transaction boundary in
     rides.service.ts" gets a better review than one that says nothing. -->

## Documentation

- [ ] `docs/` updated if a convention, schema, or environment variable changed
- [ ] `.env.example` updated if configuration changed

## Notes for the reviewer

<!-- Trade-offs you accepted, alternatives you rejected, anything you are
     unsure about. Uncertainty stated up front is a strength; uncertainty
     discovered in review is a delay. -->
