<p align="center">
  <img src="media/hero.png" alt="Sitegeist" width="400">
</p>

An AI assistant that lives in your browser sidebar. Built for collaboration, not autonomy theater. You guide, it executes.

Sitegeist can automate repetitive web tasks, extract data from any website, navigate across pages, fill out forms, compare products, compile research, and transform what it finds into documents, spreadsheets, or whatever you need. It works on any website through a Chrome/Edge side panel, using the AI provider of your choice.

Bring your own API key or log in with an existing subscription (Anthropic Claude, OpenAI/ChatGPT, GitHub Copilot). Your data stays on your machine. Nothing is collected or tracked.

> **This is a fork** of [badlogic/sitegeist](https://github.com/badlogic/sitegeist) by Mario Zechner, kept current against upstream dependencies that have since moved on. See [Differences from upstream](#differences-from-upstream).

## Install

Build it yourself — see [Development](#development) below, then [Loading the extension](#loading-the-extension).

Requires Chrome 141+ or Edge equivalent.

The original project publishes packaged downloads at [sitegeist.ai](https://sitegeist.ai). Those are builds of upstream, not of this fork, and do not include the changes listed below.

## Differences from upstream

- **`pi-web-ui` is vendored into `src/web-ui`.** Upstream deleted the package with no successor, so the chat UI, storage stores, sandboxed iframe, and tool-renderer registry now live in this repo and are edited directly.
- **Runs on current `pi-ai` / `pi-agent-core` 0.84** under the `@earendil-works` scope, and on `typebox` v1 instead of `@sinclair/typebox`.
- **OpenAI Codex models through GPT-5.6** (Luna, Sol, Terra). The codex model list is hardcoded upstream, so it only moves when the dependency does.
- **Reasoning levels are model-driven.** Extra High and Max are offered on models that support them, instead of a list capped at High, and the choice persists across sessions.
- **Markdown export.** Sessions can be written to a folder you choose as `.md` files with YAML frontmatter.
- **Google Gemini CLI and Google Antigravity no longer work.** Current `pi-ai` ships neither provider. Their default-model entries are gone, but the Gemini CLI login is still listed under Settings and will not lead anywhere until it is either removed or repointed.

Full detail in [CHANGELOG.md](CHANGELOG.md).

## Development

Clone this repo and install, here and in the `site/` subproject:

```bash
npm install
(cd site && npm install)
```

That is the whole setup. `mini-lit`, `pi-ai` and `pi-agent-core` come from npm at pinned exact versions, prebuilt, so no sibling checkouts are needed. `npm install` also sets up the Husky pre-commit hook.

Each pi-ai version carries a fixed model catalog, so model ids only move when the dependency is bumped. Re-check `DEFAULT_MODELS` in `src/sidepanel.ts` when it is — an id that no longer resolves fails silently.

Start the dev watchers (extension and marketing site):

```bash
./dev.sh
```

Changes under `src/web-ui` need no rebuild step — that code is part of this repo. To hack on pi-ai or mini-lit, check the source out and link it with `npm install <path> --install-links=false`; the flag is what makes npm symlink rather than copy, and without it your edits never reach this build.

To run only the extension watcher without dependencies or the marketing site:

```bash
npm run dev
```

### Loading the extension

1. Open `chrome://extensions/` or `edge://extensions/`
2. Enable Developer mode
3. Click Load unpacked
4. Select `sitegeist/dist-chrome/`
5. Click "Details" on the Sitegeist extension and enable:
   - **Allow user scripts**
   - **Allow access to file URLs**

The extension hot-reloads when the dev watcher rebuilds.

Because the extension is unpacked, Chrome derives its id from the absolute path of `dist-chrome/`. Moving or renaming that folder produces a new id and therefore a new, empty IndexedDB — sessions and skills will appear to vanish. Export anything you want to keep before moving it.

### First run

On first launch, Sitegeist prompts you to connect at least one AI provider. You can log in with a subscription or enter an API key.

Cross-origin requests are handled by the `declarativeNetRequest` rules bundled in `static/cors-rules.json`, so no external proxy is needed. A CORS proxy remains configurable under Settings > Proxy for providers those rules do not cover; it is off by default.

## Checks

```bash
./check.sh          # formatting, linting and type checking, for the extension and site/
npm run test:markdown   # unit checks for the session -> Markdown serializer
```

The Husky pre-commit hook runs `./check.sh` before each commit.

`src/export/session-markdown.ts` is deliberately free of DOM and Chrome APIs so it can be tested under plain node; it is the only part of the extension with automated tests.

## Building

```bash
npm run build
```

The unpacked extension is written to `dist-chrome/`.

## Exporting sessions

Sessions live in IndexedDB inside the browser profile, which is neither readable nor backed up. Two exports are available from the session list:

- **JSON** — lossless, and the format Import reads back.
- **Markdown** — one `.md` per session with YAML frontmatter (title, dates, model, reasoning level, token counts, cost), written into a folder you pick. Readable archive rather than a backup: thinking blocks and tool calls collapse to a one-line summary, and images are written as sibling files. The folder is shown under Settings > Export, where it can be changed or cleared.

Chrome re-confirms folder permission once per browser session, so the first Markdown export after a restart shows a one-click prompt.

## Releasing

```bash
./release.sh patch   # 1.0.0 -> 1.0.1
./release.sh minor   # 1.0.0 -> 1.1.0
./release.sh major   # 1.0.0 -> 2.0.0
```

Bumps the version in `static/manifest.chrome.json`, commits, tags, and pushes to `origin`. GitHub Actions then builds the extension and creates a release on whichever repo `origin` points at.

`.github/workflows/build.yml` is `workflow_dispatch` only, so a tag does not build anything. Releases are built and zipped on the machine where they were tested, then uploaded with `gh release create`, so what people install is the artifact that was actually exercised.

## Upstream-only scripts

`publish.sh` and `site/run.sh deploy` upload to the original author's server (`slayer.marioslab.io`). They will fail without his SSH access and are not useful in a fork.

## License

AGPL-3.0, inherited from the upstream project. See [LICENSE](LICENSE).
