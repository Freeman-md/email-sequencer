# Repository working agreements

## Architecture source of truth

Before planning, implementing or reviewing any new feature or repository update, read and apply the `cohesive-architecture` skill. Its canonical installed entry point is `$CODEX_HOME/skills/cohesive-architecture/SKILL.md` (default: `~/.codex/skills/cohesive-architecture/SKILL.md`). If it is absent from the session's skill catalog, read that file directly. If the installation is missing, look for the named skill in the available skill locations and report the missing dependency rather than silently inventing replacement guidance.

The skill owns architecture, responsibility boundaries, dependency design, scope and verification principles. This file supplies only repository-specific conventions, safeguards and commands. Do not duplicate the skill here. Explicit user instructions take precedence; apply the skill proportionately to the requested change.

## Local conventions

- Use PascalCase component filenames and the existing `@/` import alias.
- Use feature `api/client.ts` and `api/interfaces/client.interface.ts` for browser transport. Server routes remain in the Next.js app directory.
- Use the existing `components/`, `hooks/`, `presenters/`, `utils/` and `server/` locations when the relevant responsibility exists. These are conventions for placement, not required folders for every feature.
- Keep shared feature contracts in `types/` and server-only shapes in `server/types/`, grouped by subject.
- Infrastructure filenames use their directory context: `client.ts`, `service.ts`, `token-store.ts`, `schemas.ts`. Exported classes retain descriptive names.
- Preserve documented configuration names, including `EMAIL_SEQUENCER_GOOGLE_*`, which avoid collisions with global Google configuration.

## Operational safeguards

- Never read, open, print, parse, search, copy or otherwise inspect `.env`, `.env.local`, token files or other files containing secrets. Non-secret `.env.example` and `.env.template` files are allowed. Do not dump environment variables or expose credentials in output, logs, tests or commits.
- Do not run real email sends or the live Draft queue for verification. Use mocked Airtable/Gmail responses, synthetic records and mocked token storage.
- Preserve one-at-a-time processing, the fixed run cutoff, exclusions for the whole run, and the wait-before-next-fetch ordering.
- Do not automatically retry a send. Record Completed/Sent At only after confirmed Gmail success. Stop for unknown outcomes or post-send persistence failures and retain the reconciliation guidance. Stop must allow an in-flight send and its confirmation write to finish before releasing the run lock.
- Keep mailbox changes mutually exclusive with active runs. Preserve OAuth state matching, single-use expiry, PKCE, verified identity/send permission checks, same-mailbox refresh-token reuse, and private atomic token-file writes.
- Preserve operator authentication, same-origin mutation checks and safe upstream error translation.
- Late polling successes and failures must not overwrite a newer command result. Reconciliation acknowledgement must belong to the particular failed run and relevant errors.

## Verification

Select relevant checks using the skill’s verification guidance; this list is not a requirement to run every command for every edit:

- `npm run typecheck`
- `npm run lint`
- `npm run format:check`
- `npm test` (or a targeted Vitest file)
- `npm run build`
- `npm run test:ui` for meaningful frontend behaviour/layout changes

Use the existing ESLint and Prettier configuration. Verify case-only component renames are recorded correctly by Git on macOS.

Build and startup commands can automatically load local secret files. Run them in an isolated copy containing source, tests, dependencies and explicitly selected non-secret configuration. Use synthetic test configuration and prevent server-side rendering from contacting live Airtable/Gmail; browser request interception alone is insufficient. The UI test server uses port 3100.

## Explicit milestone commands

When the user says **Run Active Milestone**, invoke the global `milestone-workflow` skill in run mode. When the user says **Sync After Merge**, invoke it in post-merge sync mode. Milestone state lives at `.agents/milestones/active.md` in the current worktree. Do not apply that workflow to ordinary work; use `milestone-authoring` only when asked to create a milestone or amendment.
