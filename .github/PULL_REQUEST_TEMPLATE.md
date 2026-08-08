<!--
Thanks for contributing to Charmera Companion!
Keep the PR focused — one concern per PR is much easier to review.
-->

## What does this change?

<!-- A sentence or two. Link the issue if there is one: "Fixes #123". -->

## Why?

<!-- The problem this solves, or the behaviour that was wrong. -->

## How was it tested?

<!-- Manual steps, new tests, or both. Mention the hardware if camera-related. -->

## Checklist

- [ ] `cargo fmt --all -- --check` passes
- [ ] `cargo clippy --workspace --all-targets` introduces no new warnings
- [ ] `cargo test --workspace` passes
- [ ] `cd frontend && bunx tsc --noEmit && bun run build` passes (if the UI changed)
- [ ] Commit messages follow `<type>: <description>` (feat, fix, docs, refactor, test, chore, perf, ci)
- [ ] `CHANGELOG.md` updated for user-visible changes

<!-- `just lint && just test` runs the Rust half of the above in one shot. -->

## Screenshots

<!-- Before/after for any UI change. Delete this section otherwise. -->
