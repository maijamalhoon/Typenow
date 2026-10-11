# Type now

Type now is a keyboard-first typing tutor. It includes a structured Learn path,
adaptive key practice, timed and word-count tests, and locally stored progress.
The English language pack is the first pack; user data stays in the browser.

## Requirements

- Node.js 20 or newer
- npm
- Playwright Chromium for end-to-end tests (`npx playwright install chromium`)

## Run locally

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. The first visit offers the Home row learning stage
or a 30-second typing test. No account or network service is required by the app.

## Tests and build

```sh
npm test                  # Engine, language-pack, and app unit tests
npm run typecheck         # Strict TypeScript check
npm run test:e2e          # Production build followed by Playwright E2E tests
npm run build             # Static production build
```

Engine and language-pack tests can be run independently with
`npm run test:engine` and `npm run test:language-packs`. The latter regenerates
the TypeScript runtime representation from the reviewable plain-text Kids
allowlist before running its checks.

## Local data

Typing history, per-key statistics, lesson progress, and settings are stored in
versioned IndexedDB. The History screen provides JSON export and import.

## Vocabulary and fonts

Vocabulary source, filtering, attribution, and license details are recorded in
the repository-root [NOTICE](./NOTICE). Kids mode is intentionally disabled
until the staged word allowlist has been approved. Fonts and their license files
are self-hosted under `public/fonts`.
