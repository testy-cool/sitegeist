# Changelog

## [Unreleased]

### Breaking Changes

- Removed the Google Gemini CLI and Google Antigravity providers. Upstream pi-ai no longer ships
  either one, so their models could not be resolved. The Gemini CLI OAuth login is still present in
  the code but has no provider to talk to.

### Added

- Markdown export. Pick a folder once and sessions are written into it as .md files with YAML
  frontmatter carrying title, dates, model, reasoning level, token counts and cost. Export a single
  session or all of them, from the session list. The folder is shown in Settings under Export,
  where it can be changed or cleared.
- OpenAI Codex models through GPT-5.6 (Luna, Sol, Terra), plus GPT-5.5 and GPT-5.4 Mini
- Extra High and Max reasoning levels, offered per model instead of from a fixed list
- The reasoning level is now remembered across sessions

### Changed

- Vendored the pi-web-ui package into `src/web-ui`. Upstream deleted the package, so the extension
  now owns this code and can change the chat UI directly.
- Moved to pi-ai and pi-agent-core 0.84 under the `@earendil-works` scope
- Switched from `@sinclair/typebox` to `typebox` v1, matching pi-ai

### Fixed

- Completed assistant messages no longer vanish from the transcript. The agent appends to
  `state.messages` in place, so the array reference never changed and the message list was never
  re-rendered. The text was visible only while it streamed, then disappeared when the streaming
  container was cleared, and came back only after reloading the session from storage.
- The reasoning level no longer resets to Medium every time a session starts
- Reasoning levels above High are now selectable on models that support them
- Refreshed eleven per-provider default models that pointed at models the catalog had dropped

## [1.0.0] - 2026-03-15

### Added

- Browser-based OAuth login for Anthropic (Claude Pro/Max), OpenAI Codex (ChatGPT Plus/Pro), GitHub Copilot, and Google Gemini CLI
- Combined "API Keys & OAuth" settings tab with subscription login and API key entry
- Welcome setup dialog on first launch when no providers are configured
- Auto-select default model for the first provider with a key
- Provider and auth type indicator in the header bar
- Image extraction tool (`extract_image`) with selector and screenshot modes
- Subsequence-based fuzzy search in the model selector
- CORS proxy warning in OAuth sections (orange when enabled, red when disabled)
- GitHub Actions workflow for tagged releases
- `release.sh` script for version bumping and tagged releases

### Changed

- Default model changed to `claude-sonnet-4-6` with `medium` thinking level
- CORS proxy enabled by default
- Model selector only shows models from providers with configured keys
- API key prompt dialog now shows both OAuth login and API key entry for supported providers
- Tool execution set to sequential mode (parallel caused rendering issues in sidebar)
- Site converted to static (removed backend, admin, waitlist signups)
- Download links point to GitHub Releases
- License changed from MIT to AGPL-3.0

### Fixed

- Settings dialog tabs not responding to clicks (upstream `pi-web-ui` built with `tsgo` broke Lit decorator reactivity)
- CORS proxy toggle not updating (same root cause)
- Proxy not applied to API requests (esbuild bundled duplicate `streamSimple` references, breaking identity check)
- Model selector button not updating after picking a model (added `state_change` event to Agent)
- Duplicate tool component rendering during streaming (cleared streaming container on `message_end`)
- Screenshot tool capturing sidepanel instead of the webpage
