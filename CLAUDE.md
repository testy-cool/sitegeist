# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` holds the project's working rules (changelog format, release steps, git and style constraints). Read it too — this file covers commands and architecture only.

## Repo layout on disk

There are no sibling repos to check out. `@earendil-works/pi-ai`, `@earendil-works/pi-agent-core` and `@mariozechner/mini-lit` install from npm at pinned exact versions, so a clone plus `npm install` here and once inside `site/` is the whole setup. The agent loop, model catalog and streaming live in pi-ai and arrive prebuilt.

To work on pi-ai or mini-lit themselves, check the source repo out anywhere and point the dependency at it for as long as you need it:

```
npm install ../pi-mono/packages/ai ../pi-mono/packages/agent --install-links=false
```

`--install-links=false` is not optional. It makes npm symlink the checkout, which is what lets a rebuild there reach this build. Without it npm 9 packs a copy into `node_modules`, a watcher then rebuilds a tree nothing imports, and the edit appears to do nothing at all, with no error to follow. (npm 10 defaults to symlinking, npm 9 to copying, so the behaviour depends on which npm is first on `PATH`.) To go back, restore `package.json` and `package-lock.json` from git and reinstall.

**The chat UI is vendored, not a dependency.** `pi-web-ui` was deleted upstream with no successor, so it is vendored into `src/web-ui` — ChatPanel, AgentInterface, MessageEditor, ModelSelector, SettingsDialog, the sandboxed iframe, the base storage stores, and the tool-renderer registry are all ours to edit directly, with no rebuild step. The old specifier `@mariozechner/pi-web-ui` still resolves to it, via the esbuild `alias` in `scripts/build.mjs` and the `paths` entry in `tsconfig.build.json`, so call sites did not have to change. Vendored files use `.ts` import extensions (hence `allowImportingTsExtensions`), unlike sitegeist's own `.js`-suffixed ones.

Two pi-ai details worth knowing before you debug a model problem:

- The published package ships its model catalog **frozen into `dist/providers/data/`**, so one pi-ai version means one model list, the same on every machine on every day. `DEFAULT_MODELS` in `src/sidepanel.ts` therefore only needs re-validating when the pinned version moves — but it does need it then, because an id that no longer resolves fails silently and falls through to the generic fallback.
- Building pi-ai **from a source checkout** does not work that way: `packages/ai/src/providers/data/` is gitignored and regenerated from the live models.dev feed on every build, so pinning a pi-mono commit pins nothing, and a newer feed against older source may not compile at all. On 2026-08-30 models.dev dropped the `openai-completions` models from `cloudflare-ai-gateway`, which narrowed a generated type until the hand-written provider file no longer type-checked (`src/providers/cloudflare-ai-gateway.ts(19,4): error TS2353`). If you link a checkout, copy `providers/data/` from one known to build and use **`npm run build:offline`**, never `npm run build`. Depending on the published package avoids all of this.
- The `openai-codex` list is hardcoded in `packages/ai/scripts/generate-models.ts` rather than fetched, so new ChatGPT-subscription models arrive only when the pi-ai version is bumped.
- `getModel`, `getModels`, `getProviders`, `streamSimple`, and `complete` moved out of the package root; import them from `@earendil-works/pi-ai/compat`.
- The provider map (`MODELS`) is not in pi-ai's package exports, yet `getProviders()` is just its keys. To add a whole provider (Bifrost is one), `src/utils/model-catalog-patches.ts` imports it by file path from `node_modules/@earendil-works/pi-ai/dist/models.generated.js`. Single-provider catalogs *are* exported, as `@earendil-works/pi-ai/providers/<name>.models`. A provider absent from pi-ai's own list still streams, through the generic handler for its `api`.

## Commands

- `./check.sh` — format, lint (Biome), typecheck (`tsc --noEmit`), plus the same for `site/`. Run after every code change. Husky runs it pre-commit and restages formatted files.
- `./dev.sh` — starts every watcher (mini-lit, pi-mono, extension, marketing site). The user normally has this running in a separate tmux session; do not start `npm run dev` or `npm run build` yourself.
- `npm run build` — one-off build into `dist-chrome/`.
- `./release.sh <major|minor|patch>` — bumps `static/manifest.chrome.json` (the only place the version lives), finalizes `CHANGELOG.md`, commits, tags, pushes. The tag triggers `.github/workflows/build.yml`, which clones both sibling repos, builds, and publishes `sitegeist.zip` as a GitHub release.
- `cd site && ./run.sh deploy` — builds and rsyncs the static marketing site to `sitegeist.ai`.

`uv run scripts/headless-check.py "<message>"` loads `dist-chrome/` into a throwaway headless Chromium, sends one message and prints the transcript, without touching any real browser. `--key <provider>` stores `$<PROVIDER>_KEY` first; `--capture` prints the outgoing request bodies instead of calling the model. Use it to verify a change end to end before reloading the user's extension.

On this machine npm is blocked: build with `node ./scripts/build.mjs` and then `./node_modules/.bin/tailwindcss -i ./src/app.css -o ./dist-chrome/app.css --minify`, because the one-off build leaves `app.css` stale. Run Biome as `./node_modules/.bin/biome`; `npx biome` fetches an unrelated package.

There is no test suite. `static/debug.html` (built from `src/debug.ts`, reachable via Cmd/Ctrl+U from the side panel) is the manual harness: a REPL panel, canned test prompts, and direct tool invocation.

Biome formats with **tabs at width 3** and a 120-column line width; `site/` is excluded from the root Biome config and checked by its own.

## Build pipeline

`scripts/build.mjs` (esbuild, not a bundler framework) emits four entry points into `dist-chrome/`: `sidepanel`, `background`, `debug`, `icons`. It also copies everything in `static/` (renaming `manifest.chrome.json` to `manifest.json`) and the pdf.js worker. Tailwind CSS is compiled separately by the `build:chrome` script.

Two things esbuild does that matter when debugging weird module errors:
- `alias` forces `lit` and `mini-lit` to resolve to *this* repo's `node_modules`, so the `file:` linked packages cannot drag in a second copy of Lit.
- `scripts/process-shim.js` is injected to satisfy Node-isms in bundled deps.

In watch mode, `scripts/dev-server.mjs` runs a WebSocket server on port 8765; `src/utils/live-reload.ts` connects to it from the extension and calls `chrome.runtime.reload()` on any `dist-chrome/` change.

## Runtime architecture

Manifest V3, Chrome 141+ minimum (it uses `chrome.sidePanel.close()`), side panel UI, Lit components.

### Three execution contexts

1. **Side panel** (`src/sidepanel.ts`, ~1000 lines, the app's spine) — owns the `Agent`, the `ChatPanel`, storage, settings, and session lifecycle.
2. **Service worker** (`src/background.ts`) — deliberately thin. Only two jobs: toggling the side panel on the keyboard command, and arbitrating **session locks** so one session cannot be open in two windows. Locks live in `chrome.storage.session` keyed by `windowId`; the side panel holds a `chrome.runtime.connect()` port named `sidepanel:<windowId>` and lock release is driven entirely by port disconnect, so closing/crashing/navigating cleans up with no explicit teardown. See `docs/multi-window.md`.
3. **Page context** — code the agent writes runs in the user's actual tab via the `chrome.userScripts` API. This requires the user to hand-enable "Allow user scripts" on the extension details page; `src/tools/repl/userscripts-helpers.ts` detects the missing permission and produces the instructions.

### The REPL is the core mechanism

Sitegeist does not expose a click/type/scroll tool surface. Instead the agent writes JavaScript, and that script gets a set of injected helper functions. Understanding this chain is the single most useful thing to know about the codebase:

```
agent writes JS
  -> repl tool (src/tools/repl/repl.ts)
    -> SandboxIframe (src/web-ui) loads static/sandbox.html, a sandboxed CSP page
      -> runtime providers inject helpers into the sandbox's window
         browserjs(fn, ...args)  -> serializes fn, runs it in the real tab via userScripts
         navigate({url})         -> delegates to the navigate tool
         artifacts/attachments   -> from ChatPanel
```

A **runtime provider** (`SandboxRuntimeProvider`) has `getData()`, `getRuntime()` — a function that is *stringified* and evaluated inside the sandbox, so it cannot close over anything — `handleMessage()` for the bidirectional bridge, and `getDescription()`, whose text is spliced into the tool description the LLM sees. `src/tools/repl/runtime-providers.ts` composes them, and `NativeInputEventsRuntimeProvider.ts` adds trusted input events (real `chrome.debugger`-style events, not synthetic ones) inside the page.

Note the nesting in `sidepanel.ts`: providers passed to `BrowserJsRuntimeProvider` become available *inside the page*, and the same list is also spread into the REPL context, so helpers work at both levels.

The REPL blocks `window.location` assignment by regex before executing — navigation must go through `navigate()` so the extension can track tabs and re-inject skills.

### Reasoning levels

`ThinkingLevel` spans off/minimal/low/medium/high/xhigh/max, but not every model supports every tier. Each model carries a `thinkingLevelMap`; `getSupportedThinkingLevels(model)` from pi-ai is the single source of truth for which tiers to offer, and `clampThinkingLevel` snaps an unsupported choice to the nearest supported one. The selector in `src/web-ui/components/MessageEditor.ts` builds its options from that helper — do not reintroduce a hardcoded list, which is what previously capped the UI at High. Sitegeist persists the choice as the `lastUsedThinkingLevel` setting and clamps it on load, since the saved level may not be supported by whichever model the new session opens with.

### Markdown export

Sessions can be written out as Markdown into a folder the user picks, separate from the lossless
JSON export/import in `SessionListDialog`. `src/export/session-markdown.ts` is a pure function —
no DOM, no chrome APIs — so it is covered by `npm run test:markdown`, the only automated test in
the repo. `src/export/vault.ts` owns the directory handle, which persists in the `vault` IndexedDB
store because the backend uses `store.put(value)` rather than JSON.

Two Chromium rules constrain that code and are easy to break:

- `showDirectoryPicker()` and `requestPermission()` need transient user activation. They must be
  reached from a click handler *before* any long `await` — awaiting IndexedDB first lets the
  activation expire and the call throws. `handleExportMarkdown` calls `ensureVault()` first for
  exactly this reason.
- After a browser restart the stored handle is still valid but its permission reverts to `prompt`,
  so a granted folder still needs one confirming click per browser session. This is why writing to
  the folder on a timer or on every turn is not viable.

### Prompts are centralized

Every system prompt, tool description, and runtime-provider description lives in `src/prompts/prompts.ts`. Tool descriptions that depend on injected helpers are **template functions** taking `runtimeProviderDescriptions: string[]`, so a provider's docs travel with the provider. Adding a helper without adding its description leaves the LLM unable to use it. `docs/prompts.md` tracks the token budget for the whole setup.

### Skills

"Skills" here are not Claude Code skills. They are per-domain JavaScript libraries (`window.gmail = {...}`) matched to the current URL by glob pattern, auto-injected on navigation, and surfaced to the LLM through the `skill` tool. `src/tools/default-skills.ts` ships a starter set as a single large literal; users create more at runtime and they persist in IndexedDB. `sidepanel.ts` tracks `shownSkills` so a skill's full body is sent to the LLM only once per session, and deliberately does not rehydrate that map when resuming an old session — so a resumed session picks up the newest version of a skill. See `docs/skills.md`.

### Storage

One IndexedDB database, `sitegeist-storage`. `src/storage/app-storage.ts` extends `AppStorage` from pi-web-ui; note the strict five-step construction order (create stores → gather configs → build backend → wire backend → call `super`) — the backend needs every store's config up front, so a new store means touching all five steps and bumping the `version` field. Base stores (sessions, settings, provider keys, custom providers) come from upstream; `skills` and `costs` are Sitegeist's. `docs/storage.md` and `docs/settings.md` cover the details. Settings are schemaless key-value (`proxy.enabled`, `proxy.url`, `lastUsedModel`, …).

### Auth

`src/oauth/` implements browser OAuth for Anthropic, OpenAI Codex, GitHub Copilot, and Gemini CLI. The trick is that these flows are ports of CLI flows: the same client IDs and endpoints, but the CLI's local callback HTTP server is replaced by `waitForOAuthRedirect()` in `browser-oauth.ts`, which opens a tab and watches for the redirect URL. Credentials are stored in the provider-keys store as a JSON string; `resolveApiKey()` in `src/oauth/index.ts` distinguishes a raw API key from serialized credentials, refreshes within 60s of expiry, writes the refreshed value back, and returns the access token (Gemini CLI is special-cased and returns a JSON blob).

### CORS

Some provider APIs and document downloads are blocked cross-origin. Sitegeist handles this with `static/cors-rules.json` (declarativeNetRequest) for known hosts, plus an optional user-configurable CORS proxy read from settings and applied per-provider. `docs/proxy.md` documents which providers need it.

### Custom messages and renderers

The chat transcript is not only assistant/user/tool messages. Custom types (`welcome`, `navigation`) are added by declaration merging into pi-web-ui's `CustomMessages` interface, get a UI renderer, and pass through `browserMessageTransformer` (`src/messages/message-transformer.ts`) which decides what the LLM actually sees — some messages are UI-only. Tool output rendering works the same way via `registerToolRenderer`. `docs/custom-ui-messages.md` and `docs/tool-renderers.md`.

Renderers must be registered as import side effects before the agent is constructed; `src/tools/index.ts` exists largely for that ordering.

### i18n

All user-facing strings go through `i18n()`. Adding one means three edits in `src/utils/i18n-extension.ts`: the type declaration, the English string, the German string. A missing declaration is a type error, which is how the typecheck catches untranslated UI. `docs/i18n.md`.

## Loose files at the repo root

`plan.md`, `db.md`, and `gmail.md` are historical design notes and a skill source draft, not current specifications. Do not treat them as the state of the code.
