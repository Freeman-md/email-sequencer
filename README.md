# Email Sequencer — V1

A single-operator Next.js dashboard that sends eligible Airtable Interactions through multiple Gmail mailboxes within a selected sending schedule. Airtable is the operational source of truth; the sequential runner and scheduler live in one long-lived Node process. No additional database, worker or scheduling service.

## Local setup

Use Node.js 22.17+ and npm. Clone your repository and enter its directory, then:

```sh
npm install
cp .env.example .env.local
# Populate .env.local as described below.
npm run dev
```

Open http://localhost:3000. The browser asks for HTTP Basic authentication: username **operator**, password **APP_PASSWORD**. Connect a mailbox, then open **Schedules**, create a sending window and select it. New schedules default to weekdays, 09:00–17:00 Europe/London and 1200 seconds (20 minutes), unselected with automatic sending off. Manual **Start Run** uses the selected schedule's interval and requires an open window. Development never automatically starts sending.

### Airtable

Create a [personal access token](https://airtable.com/create/tokens) with `data.records:read` and `data.records:write`, limited to **Cold Outreach Pipeline**. Put it in `AIRTABLE_API_TOKEN`. `AIRTABLE_BASE_ID` is `apphI2f8iKVYaDRbg`.

Use the existing tables, adding the Gmail ID and received-time fields below:

- Interactions (`tblqbyXiQs2ZAHTrH`): `Status`, `Direction`, `Channel`, `Subject`, `Message`, `Prospect`, `Created At`, `Sent At`, `Type`, `Gmail Message ID`, `Gmail Thread ID`, `Received At`, `Sent From Mailbox`, `Initial Interaction`.
- Mailboxes (`tblkD6BwWaJPWLdr5`): `Email`, `Google Subject`, reciprocal `Sent Interactions`. `Sent From Mailbox` links here; `Initial Interaction` links to Interactions with reciprocal `Follow-up Interactions`. These fields already exist; do not recreate them. The app validates single-record ownership despite Airtable's multiple-record link type.
- Prospects (`tblVwsTybmO6xNsmY`): `Full Name`, `Company`, `Email`, `Do Not Contact` (checkbox).

Table IDs and field mappings are owned by each entity’s `airtable/fields.ts` under `src/modules/outreach`. No schema-write scope is needed. Interaction/Prospect checks read zero records; mailbox checks list metadata and verify private credentials and provider permissions. Write access is verified by real workflow writes, not by modifying data during connection checks.

### Google OAuth

1. Create/select a project in [Google Cloud Console](https://console.cloud.google.com/). Enable **Gmail API** in APIs & Services → Library.
2. Configure **Google Auth Platform** branding, audience and contact details. For a personal Gmail account choose External. While in Testing, add your Gmail address as a test user.
3. Create an OAuth client with application type **Web application**. Add the exact authorized redirect URI `http://localhost:3000/api/gmail/callback`. No JavaScript origin is required for this server-side flow.
4. Put the client ID and secret in `EMAIL_SEQUENCER_GOOGLE_CLIENT_ID` and `EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET`. Set `EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI` to that same exact URI.
5. Click **Connect Gmail** in the dashboard and grant access. The app requests `gmail.send` and `gmail.metadata`, plus `openid` and `email` to identify the connected mailbox. Metadata permission retrieves thread headers for replies; it does not read message bodies. Reconnect existing Gmail authorizations after this update.
6. `GMAIL_TOKEN_FILE` retains the legacy single-account file path: `.data/gmail-token.json` locally. Version-2 per-mailbox credentials are stored alongside it at `<GMAIL_TOKEN_FILE>.v2`, keyed by Airtable mailbox record ID. Mutations are serialized and writes are private, atomic and synced. The browser and Airtable never receive tokens. Keep the parent directory private; never commit or serve these files.

### Mailboxes and migration

Open **Mailboxes** to Add, Reconnect or Disconnect accounts. Authorization offers account selection; verified Google subject determines identity. Reconnecting reuses the same Airtable record, and a reconnect link rejects a different account. Disconnect deletes only that mailbox's local credentials, not its Airtable metadata or history, and does **not** revoke Google consent. Metadata alone does not make an account available: credentials and a successful provider check are required. Checks use at most four concurrent accounts and overlapping checks share work. Connection changes, including callbacks, are blocked throughout an active sending run.

On the first dashboard/mailbox read after upgrade, application code attempts a non-destructive migration. It verifies a refreshed Google ID token and required scopes before reusing/creating metadata. If stable identity cannot be verified, the UI requires reconnect rather than guessing. The original file is never overwritten or deleted and cannot resurrect a disconnected account after migration. Already connected version-2 credentials take precedence. Stop all active work and restart the Node process once after upgrading so cached service instances use the new composition.

Migration does not assign historical senders. Legacy interactions without reliable `Sent From Mailbox` and original-conversation links remain blocked for explicit operator reconciliation. Do not populate history speculatively.

Google External apps in Testing normally receive refresh tokens that expire after seven days when using Gmail scopes. For ongoing use, move the consent configuration to Production and satisfy any Google verification requirements that apply to your audience. See [Google's OAuth web server guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes). Reconnect through the dashboard when authorization is revoked or expires.

### Environment variables

Every required variable is in `.env.example`:

| Variable                               | Value                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `AIRTABLE_API_TOKEN`                   | Personal access token with record read/write access                             |
| `AIRTABLE_BASE_ID`                     | `apphI2f8iKVYaDRbg`                                                             |
| `EMAIL_SEQUENCER_GOOGLE_CLIENT_ID`     | Web OAuth client ID                                                             |
| `EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET` | Web OAuth client secret                                                         |
| `EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI`  | Exact callback URL, HTTPS in production                                         |
| `GMAIL_TOKEN_FILE`                     | Private writable file path on persistent storage                                |
| `SEND_ATTEMPT_FILE`                    | Optional separate persistent journal; defaults to `<GMAIL_TOKEN_FILE>.attempts` |
| `EMAIL_SEQUENCER_OPENAI_API_KEY`       | OpenAI API key; needed only for follow-up generation                            |
| `EMAIL_SEQUENCER_OPENAI_MODEL`         | Explicit Responses API text model ID; no default model                          |
| `APP_PASSWORD`                         | Strong operator password, at least 16 characters                                |

Configuration is validated at the server boundary. Missing configuration produces named setup errors without printing values. Build does not require credentials. Never use `NEXT_PUBLIC_*` for these variables.

## Run behaviour

### Schedules and automatic starts

The Schedules table is `tblepQKaVzjcENFF6` in the existing base. Created and verified field identifiers:

| Field                                | Identifier          |
| ------------------------------------ | ------------------- |
| Name (primary text)                  | `fldUR3O5jFHONNpOx` |
| Days (Monday–Sunday multiple select) | `flddtTFR7UUTFzu2z` |
| Opens At                             | `fldkHDy23mwpdcwjS` |
| Closes At                            | `fldi8WGCkSmek4UkK` |
| Timezone                             | `fldbIElsJ6ySbOrZ5` |
| Interval Seconds (integer)           | `fldddTIwbzYn8GJ69` |
| Selected                             | `fldTQiJpDTS5onsvo` |
| Automatic Sending                    | `fldRf0Oa7yDEhBnlx` |
| Last Trigger Key                     | `fldHToti3ei9c8eNq` |

No schedules are seeded or enabled. Create, edit, select, toggle automatic starts and confirm deletion in **Schedules**. Selection changes are serialized, writes and the final single selection are verified. Partial/ambiguous selection fails closed with Airtable repair guidance; explicitly select again after repair. Zero/multiple selections, invalid selected configuration and read failures block all sends. Overnight windows are unsupported; intervals must be whole seconds from 1 to 86400. Deleting the selected schedule leaves no selection.

Node instrumentation initializes one scheduler on production server startup, without a browser request. It refreshes every 30 seconds, serializes evaluations and refreshes after app-managed changes. Builds, development and tests cannot initialize automatic work; `EMAIL_SEQUENCER_SCHEDULER_DISABLED=1` is an additional production kill switch and is explicitly set during builds and isolated UI verification. Scheduler failures appear as schedule status; management remains accessible. Restart the production Node process after upgrading. Existing persistent credentials and the attempt journal remain required.

Only the selected schedule with Automatic Sending on can start automatically, at opening and subsequent local hours before closing (09:30–17:00 means 09:30 through 16:30). Starts must be dispatched in that minute; late/missed, busy, blocked and unavailable occurrences are skipped, not queued. Startup never catches up or resumes a run. Last Trigger Key claims and verifies the schedule/local-date/time occurrence before draft processing; unconfirmed claims are never retried. Leave this field application-managed. Timezone conversion uses IANA rules; nonexistent times are skipped and repeated local times never trigger twice, including across restart. This is single-process protection, not distributed locking.

Both manual and automatic runs capture schedule identity and operational configuration and validate it before sends, including immediately before the actual Gmail request after token refresh/thread/MIME preparation. Closing is exclusive; interval waits wake at closing, further processing stops, and in-flight submissions finish their confirmation writes. A denied pre-submission permission is a known non-send: the draft remains unchanged and its reserved attempt resolves safely. Direct Airtable selection/window/day/timezone/interval changes stop further submission and require a fresh run. Automatic Sending and Last Trigger Key changes do not interrupt an existing run. Stop Run affects only the current run; disabling Automatic Sending prevents subsequent automatic starts.

At Start, `runStartedAt` is captured once. Each query requests at most one Draft with Direction Outbound, Channel Email, nonblank Subject and Message, a Prospect relationship and `Created At <= runStartedAt`, sorted oldest first. Its linked Prospect is fetched to read Email. Candidates without Email are skipped one at a time; ambiguous multiple-Prospect links stop the run for correction. No queue is preloaded.

New outbound `Initial Message` drafts must have no sender attribution, initial-interaction link or existing Gmail identifiers. Available accounts are selected in stable mailbox-ID round-robin order. The last allocated ID persists across runs/restarts and advances when an attempt is durably reserved, including attempts that later definitely fail. Disconnected/unavailable accounts are skipped before submission; no available account stops the run with guidance. Follow-ups do not advance allocation. Unsupported or ambiguous conversation types are rejected unchanged.

After Gmail confirms success, the app saves `Status = Completed`, `Sent At`, `Gmail Message ID`, `Gmail Thread ID` and `Sent From Mailbox` in one Airtable update and verifies them together, waits the configured interval, then queries again. `Sent At` is the server timestamp when the Gmail success response is confirmed; Gmail's send response does not expose a separate delivery timestamp. It is not the time the run began. The final interval also elapses before the empty query completes the run.

A definite Gmail rejection leaves the Draft untouched, displays the error and skips that record for the rest of the run. The same interval is respected after failed attempts. An uncertain outcome stops immediately without retrying or rotating sender. Before submission, a separate private durable journal records the Interaction and selected mailbox; if reservation fails, no send occurs. Confirmed Gmail identifiers are synced before Airtable completion. Attempts resolve only after verified completion or a definite non-send outcome. Any unresolved attempt blocks every new run across restarts.

Overview displays the particular pending attempt, mailbox identity and known Gmail IDs. Check Sent mail in that mailbox. If sent, repair all five Airtable completion fields and choose **Sent — Airtable completion repaired**, then explicitly verify and reconcile; the server verifies completion and any known IDs. Only an unknown-outcome attempt can be marked **Definitely not sent**, after explicit manual verification. A review checkbox alone never clears durable protection, and an uncertain outcome is never permission to retry. Journal/write failures can conservatively require reconciliation even when Gmail was not contacted. Keep credentials and the journal on persistent storage; `SEND_ATTEMPT_FILE` must not point to a credential file.

Stop cancels a pending wait. An in-flight send is allowed to finish and its result is saved before the run lock is released. Closing the browser does not stop the runner. Polling runs about every two seconds; connections are checked at run start and cached for up to 60 seconds while observing. Errors retain the latest 20 details plus the total failure count. Current Interaction and Last Sent are session state, not a separate durable history. Dates are displayed in Europe/London.

## Prepare Follow-Ups

The dashboard's **Prepare Follow-Ups** button creates Airtable Drafts only. Review those records, then start the existing sequencer separately. Preparation runs in the same persistent Node process, returns immediately and reports progress through polling. Closing the browser does not cancel preparation. Only one preparation can run at a time. **Stop Preparation** cancels generation and prevents further work, while allowing an Airtable Draft save already started to settle. The run stays locked and shows Stopping until that request finishes; refresh preserves access to the server run and Stop control. A cancelled prospect is reported as skipped.

When upgrading from the version without Stop support, restart the development server once. Turbopack can retain an old service instance across code reloads; the app will request a restart if that instance is active rather than replace its lock and allow overlapping preparation.

Set the optional **Draft limit** to a positive whole number to cap successfully prepared Drafts per run. Leave it blank to process all candidates. Skips and failed attempts do not consume the limit; reaching it prevents another candidate read or generation. The active limit is shown after refresh and cannot change mid-run. Stop preserves already saved Drafts; starting again checks them normally for duplicates.

### Setup and data contract

- On Interactions, create **Gmail Message ID** and **Gmail Thread ID** as single-line text fields. Exact spelling matters. Leave historical IDs empty until your separate migration fills them; this feature never searches for or backfills historical messages.
- Create **Received At** as a date field with time for inbound interactions. Populate it with the actual occurrence time from the inbound source, including backfills. `Created At` is never used as a substitute. Any Completed inbound interaction without a valid received timestamp blocks that prospect. Missing the field itself causes a safe context-read error.
- Keep inbound Interactions populated and linked to their Prospect. This feature does not synchronize the inbox; an absent reply record cannot be inferred by Airtable eligibility. At sending time, Gmail metadata also prevents submission if the latest thread message is a reply from another sender.
- Follow-ups use the Prospect's `Campaign` and reciprocal `Interactions` links, `Role`, `Do Not Contact`, `Signal`, `Sources` and `Qualification Notes`, alongside name/company/email. Do Not Contact blocks preparation.
- Campaigns (`tblN5pAOMYychpKBK`) supply `Campaign Name`, `ICP`, `Buyer Roles`, `Geography`, `Company Criteria`, `Exclusion Criteria`, `Core Problem`, `Triggers`, `Offer`, `Desired Next Step` and `Notes`. Put campaign-specific messaging/follow-up guidance in Notes. Missing or ambiguous campaign links, or missing name/offer, block generation.
- Configure `EMAIL_SEQUENCER_OPENAI_API_KEY` and `EMAIL_SEQUENCER_OPENAI_MODEL`, then restart the server. These are optional for ordinary sending; there is no fallback to global `OPENAI_*` variables. Generation uses one bounded OpenAI Responses request per eligible prospect, existing context only, no research/tools and no automatic retries. Responses are stored (`store: true`) so new prompts and outputs can be inspected in the OpenAI dashboard for the API key’s project, subject to organization retention settings. This includes supplied prospect, campaign and email context. Server stdout/stderr contains JSON `openai.generation.started` and `openai.generation.finished` events, linked by attempt ID, with model, duration, HTTP status, request/response IDs and token usage when available. Server logs exclude prompts, email content, credentials and raw provider errors. Preparation displays safe error categories and request IDs; earlier unstored responses cannot be recovered by this change.

### Eligibility and persistence

Steps live in `src/features/follow-ups/constants/steps.ts`: initially 3, 4 and 5 elapsed days, each measured from the latest relevant completed outbound's `Sent At`. Add consecutive step definitions to extend the sequence. A single completed Initial Message anchors the sequence; completed Follow-ups determine the next number. Multiple initial conversations for the same Prospect are skipped for manual review rather than guessing which sequence to continue. Conflicting threads, ambiguous timestamps, missing original context or missing Gmail identifiers are skipped. An inbound reply since the original ends that cold sequence, even if a later outbound was logged. Any outstanding Follow-up Draft for the prospect blocks another Draft. Deleting an unsent Draft deliberately allows preparation again.

Candidates are selected in pages of 25 completed outbound Email / Initial Message Interactions with a populated Sent From Mailbox. Their linked Prospects are processed at most once per run; legacy-only prospects are excluded before generation. Each candidate's complete linked history is loaded, including replies and unsent drafts without mailbox attribution. Interaction reads use batches of up to 50 linked record IDs, not a full-table scan. Preparation rereads the Prospect and its history after generation; changed context, new replies and new Drafts prevent the write. The shared Airtable client spaces requests across both features. The run shows checked/eligible/drafted/skipped counts, grouped skip reasons, and the latest 20 errors with a total error count. Eligible counts include prospects whose generation or save subsequently failed.

Created records are Outbound / Email / Follow-up / Draft, preserving the original subject and Gmail Thread ID. Every `Initial Interaction` points directly to the original completed Initial Message, never the previous follow-up. `Sent From Mailbox`, the new Gmail Message ID and Sent At remain blank; write confirmation verifies these relationships too. Airtable supplies Created At. An unconfirmed create is never retried; inspect that Prospect's Interactions before rerunning. Single-process locking and Draft checks prevent normal duplicate runs; Airtable provides no transaction across the final read and write, so independent external automation must not concurrently prepare the same prospects.

Sending reloads that original Interaction and validates prospect, type/status, original timestamp/IDs, subject/thread and single-record sender ownership. The conversation identity is **mailbox plus Gmail thread ID**. The original account must be available; a follow-up never rotates to another account. Gmail thread checks use that account's credentials, verify the original message belongs to the thread and reject conversations with replies. Success attributes the follow-up to the same mailbox. Missing, conflicting or unavailable ownership leaves the draft unchanged with guidance. AI does not select senders.

The sequencer retrieves Gmail metadata, validates the conversation's recipient/subject and RFC Message-ID, and supplies `threadId`, `In-Reply-To` and `References` when sending a reply. Encoded subjects are decoded with `libmime`. Missing or unverifiable threading fails before submission instead of sending a standalone follow-up. See [Gmail's threading requirements](https://developers.google.com/workspace/gmail/api/guides/threads) and [metadata access](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.threads/get).

Preparation is isolated under `src/features/follow-ups`: components render, the hook owns commands/polling, the API client owns browser transport, the service applies deterministic policy and coordinates generation. Both workflows use the entity repositories and projections owned by `src/modules/outreach`; no feature imports another feature. App-level `OutreachDashboard` composes their public panels. The OpenAI client remains in infrastructure and receives feature-owned prompts through a text-generation interface. It has no sending capability.

For a manual test, use your own address and a Draft Initial Message. Send it through the sequencer and verify both Gmail IDs and Sent At in Airtable. Once its configured delay has elapsed, prepare a follow-up, inspect the Draft, then send it and check the original Gmail thread. To exercise this sooner in isolated test data, adjust the synthetic record's Sent At deliberately; do not alter production history. Verify a second preparation creates no duplicate and a logged inbound reply suppresses the next step.

## Production: one persistent Node instance

```sh
npm ci
npm run build
npm run start
```

Use **one** process/replica with a process supervisor. Do not use serverless hosting, PM2 cluster mode, autoscaling or multiple containers against the same queue. Use a reverse proxy with HTTPS; preserve the Authorization and Origin headers. Set the OAuth redirect URI in Google Console and the environment to `https://your-host/api/gmail/callback`. Keep the Node port private behind the proxy.

Point `GMAIL_TOKEN_FILE` at a private mounted volume, such as `/data/gmail-token.json`, writable only by the application user. Restrict all dashboard/API access to the operator. OAuth state uses an HttpOnly, SameSite cookie and PKCE; run mutations require the configured origin.

A Dockerfile is included using Next.js [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output):

```sh
docker build -t email-sequencer .
# Supply the required variables using your host's secret environment configuration.
# A pre-created named volume must be writable by UID/GID 1001.
docker run --name email-sequencer --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  --env-file /secure/path/email-sequencer.env \
  -e GMAIL_TOKEN_FILE=/data/gmail-token.json \
  -v email-sequencer-data:/data email-sequencer
```

Stop the sender and let any active preparation finish before deployments or shutdown. A process restart resets in-memory run state, but preserves the allocation cursor and unresolved attempt on the mounted volume. A crash between Gmail acceptance and confirmation can leave an unknown outcome: **inspect that mailbox and explicitly reconcile before another run**. This is conservative single-process protection, not distributed locking or exactly-once delivery. Credentials and protection survive restarts only if their volume persists. Do not delete/reset the journal to bypass reconciliation.

## Server structure

`src/app/server/composition.ts` wires the independent mailbox and sequencer workflows against outreach repositories and infrastructure, retaining one runtime per process. Features do not import each other.

- Repositories and storage mappers live in `src/modules/outreach`, grouped by entity. Feature composition injects them through narrow contracts.
- `services/`: sequence eligibility, recipient resolution, sending and saving; connection checks, caching and mailbox changes.
- `runtime/`: run state, exclusions, cancellation, interruptible waits and the shared run/mailbox lock.
- `interfaces/` and `types/`: dependency contracts and server data shapes. Feature-level `types/` contains shared summaries, run state and dashboard contracts; resolved sending context stays under server types; entity and persistence projections belong to the outreach module.

Prettier handles syntax formatting. ESLint enforces import grouping, type imports and spacing between methods and logical sections in infrastructure, the restructured server, shared feature types, their callers and focused tests. Run `npx eslint <files> --fix` followed by `npx prettier <files> --write` when editing those files.

## Frontend structure

The sequencer feature barrel exports `SequencerPanel`. App-level `OutreachDashboard` composes it with the public follow-up panel, preserving the existing layout. Component files use PascalCase.

- `components/`: sequencer presentation for the header, run status, current interaction, last sent and notices. Cross-feature page composition stays in `src/app/components/`.
- `hooks/`: dashboard data and polling/command coordination, review controls, and the server-aligned clock. Interval configuration belongs to Schedules.
- `api/client.ts`: browser requests to the existing sequencer routes through an injectable client interface.
- `presenters/`: pure functions translating run phases into display content.
- `utils/format.ts`: date and countdown formatting.

Polling responses and failures from before a command cannot overwrite its result. Manual reconciliation acknowledgement is tied to the failed run and its relevant errors. UI tests mock sequencer requests, including delayed responses, so they do not send emails.

## Infrastructure structure

`src/infrastructure/composition.ts` lazily constructs the external clients and token store. The infrastructure barrel only exports that entry point; feature composition injects its instances into repositories and services. Restart the server after configuration changes or this class restructuring so retained instances use the current setup.

- `airtable/client.ts`: injected configuration and HTTP transport. Response schemas live in `schemas.ts`.
- `gmail/client.ts`: Google SDK operations, send requests and safe rejection translation. Sends never retry automatically.
- `gmail/authorization.ts`: single-use OAuth state, PKCE and reconnect intent; the client verifies identity and permissions.
- `gmail/service.ts` and `gmail/mailbox-service.ts`: per-mailbox checks, MIME preparation and provider sending/thread checks.
- `gmail/mailbox-token-store.ts`: serialized version-2 credentials and migration state; `token-store.ts` retains the legacy reader.
- `send-attempts/store.ts`: the separate pending-attempt journal and allocation cursor. `storage/private-json-file.ts` owns private atomic synced JSON-file mechanics.
- `email/`: provider-independent sender interface and message/result types.
- `openai/client.ts`: bounded Responses API text generation; `text-generation/` owns its provider-independent interface.
- `config/` and `http/`: environment validation and request/response helpers, respectively.

Schemas validate external data and supply inferred types where appropriate. Ordinary internal data shapes remain TypeScript types. Infrastructure classes receive dependencies through constructors; helpers stay within their owning module.

## Verification

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

For browser verification, run `npx playwright install chromium` once, then `npm run test:ui` after a build. Browser tests intercept sequencer and follow-up requests and use synthetic data. Run builds/startup for verification in an isolated source copy without local environment or token files; browser interception does not protect server-side rendering from live services. Screenshots are saved under the ignored `output/playwright/` directory.

Tests use fake Airtable and Gmail responses and never send real emails. No live Draft queue should be run for verification. The specification is [Final V1 Specification](https://app.notion.com/p/3d6b505dc852817b86d9f1c7fa54f4ee), structure is [Web Structure](https://app.notion.com/p/3d6b505dc852814a8bd2dac10149442c), and visual reference is [Paper](https://app.paper.design/file/01M23G0TF90V757KYHN9CXF6C7/1-0). While waiting, the UI shows the last processed Interaction rather than prefetching the next one; Notion's wait-then-fetch behaviour takes precedence over Paper's sample “next email” label.

### Outreach data ownership

`src/modules/outreach` owns Prospect, Interaction and Campaign contracts, Airtable repositories, field mappings and write confirmation. Entity directories are plural; repository and mapper filenames/classes are singular. Its `server.ts` exports repository composition only. Feature services receive narrow repository interfaces; transport, pacing, Gmail and OpenAI remain in infrastructure. Repositories have no workflow state or additional global cache.

`ProspectContact` includes contact details and Do Not Contact; `ProspectContext` adds preparation research and links. `DraftCandidate` and `HistoryInteraction` similarly distinguish sending from history reads. Missing optional Airtable fields retain existing empty defaults; malformed populated fields fail at the boundary. Campaign guidance uses named application properties, independent of Airtable labels.

Before sending an existing draft, the sequencer reads the prospect's current Do Not Contact flag. An opted-out prospect is reported as a definite rejection, the draft is unchanged, and the run continues. This is a pre-send check, not an atomic guarantee against a concurrent Airtable edit.

After changing server composition, restart the server once active work has settled so process-cached services use the new implementations. Storage ownership does not change run locks, send confirmation or cancellation semantics.
