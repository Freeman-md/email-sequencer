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

The existing schema is used unchanged:

- Interactions (`tblqbyXiQs2ZAHTrH`): `Status`, `Direction`, `Channel`, `Subject`, `Message`, `Prospect`, `Created At`, `Sent At`.
- Prospects (`tblVwsTybmO6xNsmY`): `Full Name`, `Company`, `Email`.

Table IDs and field mappings are centralized in `src/features/sequencer/constants/airtable.ts`. No schema-write scope is needed. Connection checks read zero records and validate access to both tables. Write access is verified when an actual confirmed send is saved, not by modifying real data during connection checks.

### Google OAuth

1. Create/select a project in [Google Cloud Console](https://console.cloud.google.com/). Enable **Gmail API** in APIs & Services → Library.
2. Configure **Google Auth Platform** branding, audience and contact details. For a personal Gmail account choose External. While in Testing, add your Gmail address as a test user.
3. Create an OAuth client with application type **Web application**. Add the exact authorized redirect URI `http://localhost:3000/api/gmail/callback`. No JavaScript origin is required for this server-side flow.
4. Put the client ID and secret in `EMAIL_SEQUENCER_GOOGLE_CLIENT_ID` and `EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET`. Set `EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI` to that same exact URI.
5. Click **Connect Gmail** in the dashboard and grant access. The app requests `gmail.send`, plus `openid` and `email` to identify the connected mailbox. It does not request inbox read access.
6. `GMAIL_TOKEN_FILE` controls where the refresh token is stored: `.data/gmail-token.json` locally. The file is atomically written with mode `600`, outside the public directory. The browser never receives tokens. Keep the parent directory private; never commit or serve this file.

Google External apps in Testing normally receive refresh tokens that expire after seven days when using Gmail scopes. For ongoing use, move the consent configuration to Production and satisfy any Google verification requirements that apply to your audience. See [Google's OAuth web server guide](https://developers.google.com/identity/protocols/oauth2/web-server) and [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes). Reconnect through the dashboard when authorization is revoked or expires.

### Environment variables

Every required variable is in `.env.example`:

| Variable                               | Value                                               |
| -------------------------------------- | --------------------------------------------------- |
| `AIRTABLE_API_TOKEN`                   | Personal access token with record read/write access |
| `AIRTABLE_BASE_ID`                     | `apphI2f8iKVYaDRbg`                                 |
| `EMAIL_SEQUENCER_GOOGLE_CLIENT_ID`     | Web OAuth client ID                                 |
| `EMAIL_SEQUENCER_GOOGLE_CLIENT_SECRET` | Web OAuth client secret                             |
| `EMAIL_SEQUENCER_GOOGLE_REDIRECT_URI`  | Exact callback URL, HTTPS in production             |
| `GMAIL_TOKEN_FILE`                     | Private writable file path on persistent storage    |
| `APP_PASSWORD`                         | Strong operator password, at least 16 characters    |

Configuration is validated at the server boundary. Missing configuration produces named setup errors without printing values. Build does not require credentials. Never use `NEXT_PUBLIC_*` for these variables.

## Run behaviour

At Start, `runStartedAt` is captured once. Each query requests at most one Draft with Direction Outbound, Channel Email, nonblank Subject and Message, a Prospect relationship and `Created At <= runStartedAt`, sorted oldest first. Its linked Prospect is fetched to read Email. Candidates without Email are skipped one at a time; ambiguous multiple-Prospect links stop the run for correction. No queue is preloaded.

After Gmail confirms success, the app saves `Status = Completed` and `Sent At` in one Airtable update, waits the configured interval, then queries again. `Sent At` is the server timestamp when the Gmail success response is confirmed; Gmail's send response does not expose a separate delivery timestamp. It is not the time the run began. The final interval also elapses before the empty query completes the run.

A definite Gmail rejection leaves the Draft untouched, displays the error and skips that record for the rest of the run. The same interval is respected after failed attempts. An uncertain outcome stops immediately without retrying. If Gmail succeeds but Airtable cannot confirm the update, the app also stops and displays the record ID and confirmed send time for manual reconciliation. Check Gmail and fix Airtable before starting another run. The UI requires acknowledgement for these cases; it does not verify your manual reconciliation or automatically resend.

Stop cancels a pending wait. An in-flight send is allowed to finish and its result is saved before the run lock is released. Closing the browser does not stop the runner. Polling runs about every two seconds; connections are checked at run start and cached for up to 60 seconds while observing. Errors retain the latest 20 details plus the total failure count. Current Interaction and Last Sent are session state, not a separate durable history. Dates are displayed in Europe/London.

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

Stop a run and wait for it to stop before deployments or shutdown. A process restart resets in-memory run state. A crash between Gmail acceptance and the Airtable update can leave a sent email as Draft: **inspect Gmail and reconcile that record before another run**. Exactly-once delivery across crashes is not guaranteed by this database-free V1. Tokens survive restarts only if their volume persists.

## Server structure

`src/features/sequencer/server/index.ts` only exports the lazy composition entry point. `composition.ts` wires constructor-injected repository and service classes against interfaces and retains one runtime per process.

- `repositories/`: separate Airtable reads and writes for Interactions and Prospects.
- `mappers/`: validate Airtable field shapes and map records into server types.
- `services/`: sequence eligibility, recipient resolution, sending and saving; connection checks, caching and mailbox changes.
- `runtime/`: run state, exclusions, cancellation, interruptible waits and the shared run/mailbox lock.
- `interfaces/` and `types/`: dependency contracts and server data shapes. Feature-level `types/` contains shared summaries, run state and dashboard contracts; email bodies and Airtable-derived entities stay under server types.

Prettier handles syntax formatting. ESLint enforces import grouping, type imports and spacing between methods and logical sections in infrastructure, the restructured server, shared feature types, their callers and focused tests. Run `npx eslint <files> --fix` followed by `npx prettier <files> --write` when editing those files.

## Frontend structure

The feature barrel exports `Dashboard`. Component files use PascalCase and preserve the existing page layout.

- `components/`: page composition and presentation for the header, run status, current interaction, last sent and notices.
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

For browser verification, run `npx playwright install chromium` once, then `npm run test:ui` after a build. Browser tests intercept every sequencer request and use synthetic data. Screenshots are saved under the ignored `output/playwright/` directory.

Tests use fake Airtable and Gmail responses and never send real emails. No live Draft queue should be run for verification. The specification is [Final V1 Specification](https://app.notion.com/p/3d6b505dc852817b86d9f1c7fa54f4ee), structure is [Web Structure](https://app.notion.com/p/3d6b505dc852814a8bd2dac10149442c), and visual reference is [Paper](https://app.paper.design/file/01M23G0TF90V757KYHN9CXF6C7/1-0). While waiting, the UI shows the last processed Interaction rather than prefetching the next one; Notion's wait-then-fetch behaviour takes precedence over Paper's sample “next email” label.
