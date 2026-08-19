import { i18n } from "@mariozechner/mini-lit/dist/i18n.js";
import { SettingsTab } from "@mariozechner/pi-web-ui";
import { html, type TemplateResult } from "lit";
import { customElement } from "lit/decorators.js";
import "../utils/i18n-extension.js";

const REPOSITORY_URL = "https://github.com/testy-cool/sitegeist";
const UPSTREAM_URL = "https://github.com/badlogic/sitegeist";

/**
 * This fork has no hosted counterpart, so there is no version endpoint to poll and no update
 * prompt. The upstream project checked sitegeist.ai on open and could hard-block the UI behind an
 * undismissable "Update Required" dialog when that site advertised a newer build - which for a fork
 * means being locked out by someone else's release. You update this build by rebuilding it.
 */
@customElement("about-tab")
export class AboutTab extends SettingsTab {
	getTabName(): string {
		return i18n("About");
	}

	render(): TemplateResult {
		const version = chrome.runtime.getManifest().version;

		return html`
			<div class="flex flex-col gap-4">
				<div class="space-y-2">
					<h3 class="text-lg font-semibold text-foreground">Sitegeist</h3>
					<p class="text-sm text-muted-foreground">${i18n("AI-powered browser extension for web navigation and interaction")}</p>
				</div>

				<div class="space-y-1">
					<div class="text-sm">
						<span class="font-medium text-foreground">${i18n("Version:")}</span>
						<span class="text-muted-foreground ml-2">${version}</span>
					</div>
				</div>

				<div class="pt-4 space-y-2">
					<div class="text-xs text-muted-foreground space-x-3">
						<a href=${REPOSITORY_URL} target="_blank" class="text-primary hover:underline">${i18n("Repository")}</a>
						<span>·</span>
						<a href=${UPSTREAM_URL} target="_blank" class="text-primary hover:underline">${i18n("Original project")}</a>
					</div>
					<p class="text-xs text-muted-foreground">
						${i18n("A fork of Mario Zechner's Sitegeist. Licensed AGPL-3.0.")}
					</p>
				</div>
			</div>
		`;
	}
}
