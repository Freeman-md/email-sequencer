# Email Sequencer — V1

A single-operator Next.js dashboard that sends eligible Airtable Interactions through one Gmail mailbox. Airtable is the operational source of truth; the runner lives in one long-lived Node process. No database or worker service.

## Local setup

Use Node.js 22.17+ and npm. Clone your repository and enter its directory, then:

```sh
npm install
cp .env.example .env.local
# Populate .env.local as described below.
npm run dev
```

Open http://localhost:3000. The browser asks for HTTP Basic authentication: username **operator**, password **APP_PASSWORD**. Click **Connect Gmail**, complete Google consent, set **Interval Seconds** (default 300), then **Start Run** when you intend to send the real Draft queue.

### Airtable

Create a [personal access token](https://airtable.com/create/tokens) with `data.records:read` and `data.records:write`, limited to **Cold Outreach Pipeline**. Put it in `AIRTABLE_API_TOKEN`. `AIRTABLE_BASE_ID` is `apphI2f8iKVYaDRbg`.

Use the existing tables, adding the Gmail ID and received-time fields below:

- Interactions (`tblqbyXiQs2ZAHTrH`): `Status`, `Direction`, `Channel`, `Subject`, `Message`, `Prospect`, `Created At`, `Sent At`, `Type`, `Gmail Message ID`, `Gmail Thread ID`, `Received At`.
- Prospects (`tblVwsTybmO6xNsmY`): `Full Name`, `Company`, `Email`, `Do Not Contact` (checkbox).

Table IDs and field mappings are owned by each entity’s `airtable/fields.ts` under `src/modules/outreach`. No schema-write scope is needed. Connection checks read zero records and validate access to both tables. Write access is verified when an actual confirmed send is saved, not by modifying real data during connection checks.

### Google OAuth

1. Create/select a project in [Google Cloud Console](https://console.cloud.google.com/). Enable **Gmail API** in APIs & Services → Library.
2. Configure **Google Auth Platform** branding, audience and contact details. For a personal Gmail account choose External. While in Testing, add your Gmail address as a test user.
3. Create an OAuth client with application type **Web application**. Add the exact authorized redirect URI `http://localhost:3000/api/gmail/callback`. No JavaScript origin is required for this server-side flow.
4. Put the client ID and secret in `EMAIL_SEQUENCER_GOOGLE_CLIENT_ID` and `EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET`. Set `EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI` to that same exact URI.
5. Click **Connect Gmail** in the dashboard and grant access. The app requests `gmail.send` and `gmail.metadata`, plus `openid` and `email` to identify the connected mailbox. Metadata permission retrieves thread headers for replies; it does not read message bodies. Reconnect existing Gmail authorizations after this update.
6. `GMAIL_TOKEN_FILE` controls where the refresh token is stored: `.data/gmail-token.json` locally. The file is atomically written with mode `600`, outside the public directory. The browser never receives tokens. Keep the parent directory private; never commit or serve this file.

Google External apps in Testing normally receive refresh tokens that expire after seven days when using Gmail scopes. For ongoing use, move the consent configuration to Production and satisfy any Google verification requirements that apply to your audience. See [Google's OAuth web server guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes). Reconnect through the dashboard when authorization is revoked or expires.

### Environment variables

Every required variable is in `.env.example`:

| Variable                               | Value                                                  |
| -------------------------------------- | ------------------------------------------------------ |
| `AIRTABLE_API_TOKEN`                   | Personal access token with record read/write access    |
| `AIRTABLE_BASE_ID`                     | `apphI2f8iKVYaDRbg`                                    |
| `EMAIL_SEQUENCER_GOOGLE_CLIENT_ID`     | Web OAuth client ID                                    |
| `EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET` | Web OAuth client secret                                |
| `EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI`  | Exact callback URL, HTTPS in production                |
| `GMAIL_TOKEN_FILE`                     | Private writable file path on persistent storage       |
| `EMAIL_SEQUENCER_OPENAI_API_KEY`       | OpenAI API key; needed only for follow-up generation   |
| `EMAIL_SEQUENCER_OPENAI_MODEL`         | Explicit Responses API text model ID; no default model |
| `APP_PASSWORD`                         | Strong operator password, at least 16 characters       |

Configuration is validated at the server boundary. Missing configuration produces named setup errors without printing values. Build does not require credentials. Never use `NEXT_PUBLIC_*` for these variables.

## Run behaviour

At Start, `runStartedAt` is captured once. Each query requests at most one Draft with Direction Outbound, Channel Email, nonblank Subject and Message, a Prospect relationship and `Created At <= runStartedAt`, sorted oldest first. Its linked Prospect is fetched to read Email. Candidates without Email are skipped one at a time; ambiguous multiple-Prospect links stop the run for correction. No queue is preloaded.

After Gmail confirms success, the app saves `Status = Completed`, `Sent At`, `Gmail Message ID` and `Gmail Thread ID` in one Airtable update, waits the configured interval, then queries again. `Sent At` is the server timestamp when the Gmail success response is confirmed; Gmail's send response does not expose a separate delivery timestamp. It is not the time the run began. The final interval also elapses before the empty query completes the run.

A definite Gmail rejection leaves the Draft untouched, displays the error and skips that record for the rest of the run. The same interval is respected after failed attempts. An uncertain outcome stops immediately without retrying. If Gmail succeeds but Airtable cannot confirm the update, the app also stops and displays the record ID, confirmed send time and both returned Gmail IDs for manual reconciliation. Check Gmail and fix Airtable before starting another run. The UI requires acknowledgement for these cases; it does not verify your manual reconciliation or automatically resend.

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

Candidates are read in pages of 25 Prospects with linked history. Interaction reads use batches of up to 50 linked record IDs, not a full-table scan. Preparation rereads the Prospect and its history after generation; changed context, new replies and new Drafts prevent the write. The shared Airtable client spaces requests across both features. The run shows checked/eligible/drafted/skipped counts, grouped skip reasons, and the latest 20 errors with a total error count. Eligible counts include prospects whose generation or save subsequently failed.

Created records are Outbound / Email / Follow-up / Draft, preserving the original subject and Gmail Thread ID. The new Gmail Message ID and Sent At remain blank, and Airtable supplies Created At. An unconfirmed create is never retried; inspect that Prospect's Interactions before rerunning. Single-process locking and Draft checks prevent normal duplicate runs; Airtable provides no transaction across the final read and write, so independent external automation must not concurrently prepare the same prospects.

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

Stop the sender and let any active preparation finish before deployments or shutdown. A process restart resets in-memory run state. A crash between Gmail acceptance and the Airtable update can leave a sent email as Draft: **inspect Gmail and reconcile that record before another run**. Exactly-once delivery across crashes is not guaranteed by this database-free V1. Tokens survive restarts only if their volume persists.

## Server structure

`src/features/sequencer/server/index.ts` only exports the lazy composition entry point. `composition.ts` wires constructor-injected repository and service classes against interfaces and retains one runtime per process.

- Repositories and storage mappers live in `src/modules/outreach`, grouped by entity. Feature composition injects them through narrow contracts.
- `services/`: sequence eligibility, recipient resolution, sending and saving; connection checks, caching and mailbox changes.
- `runtime/`: run state, exclusions, cancellation, interruptible waits and the shared run/mailbox lock.
- `interfaces/` and `types/`: dependency contracts and server data shapes. Feature-level `types/` contains shared summaries, run state and dashboard contracts; resolved sending context stays under server types; entity and persistence projections belong to the outreach module.

Prettier handles syntax formatting. ESLint enforces import grouping, type imports and spacing between methods and logical sections in infrastructure, the restructured server, shared feature types, their callers and focused tests. Run `npx eslint <files> --fix` followed by `npx prettier <files> --write` when editing those files.

## Frontend structure

The sequencer feature barrel exports `SequencerPanel`. App-level `OutreachDashboard` composes it with the public follow-up panel, preserving the existing layout. Component files use PascalCase.

- `components/`: sequencer presentation for the header, run status, current interaction, last sent and notices. Cross-feature page composition stays in `src/app/components/`.
- `hooks/`: dashboard data and polling/command coordination, interval and review controls, and the server-aligned clock.
- `api/client.ts`: browser requests to the existing sequencer routes through an injectable client interface.
- `presenters/`: pure functions translating run phases into display content.
- `utils/format.ts`: date and countdown formatting.

Polling responses and failures from before a command cannot overwrite its result. Manual reconciliation acknowledgement is tied to the failed run and its relevant errors. UI tests mock sequencer requests, including delayed responses, so they do not send emails.

## Infrastructure structure

`src/infrastructure/composition.ts` lazily constructs the external clients and token store. The infrastructure barrel only exports that entry point; feature composition injects its instances into repositories and services. Restart the server after configuration changes or this class restructuring so retained instances use the current setup.

- `airtable/client.ts`: injected configuration and HTTP transport. Response schemas live in `schemas.ts`.
- `gmail/client.ts`: Google SDK operations, send requests and safe rejection translation. Sends never retry automatically.
- `gmail/service.ts`: OAuth state and PKCE coordination, token persistence coordination, connection checks and MIME preparation.
- `gmail/token-store.ts`: private token-file reads and atomic writes. Tests use a mocked filesystem.
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
