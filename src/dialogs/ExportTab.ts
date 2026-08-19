import { i18n } from "@mariozechner/mini-lit";
import { Button } from "@mariozechner/mini-lit/dist/Button.js";
import { SettingsTab } from "@mariozechner/pi-web-ui";
import { html, type TemplateResult } from "lit";
import { customElement, state } from "lit/decorators.js";
import { chooseVault, forgetVault, getVaultStatus, type VaultStatus } from "../export/vault.js";
import "../utils/i18n-extension.js";

/**
 * Lets the user see and change the folder Markdown exports are written to.
 *
 * Exporting can pick a folder on its own, but then the choice is invisible and unchangeable, so
 * this tab exists to surface it. "Permission needed" is the normal state after a browser restart,
 * not an error - the next export re-grants it with a single click.
 */
@customElement("sitegeist-export-tab")
export class ExportTab extends SettingsTab {
	@state() private status: VaultStatus = "none";
	@state() private folderName = "";

	getTabName(): string {
		return i18n("Export");
	}

	override async connectedCallback() {
		super.connectedCallback();
		await this.refresh();
	}

	private async refresh() {
		try {
			const { status, name } = await getVaultStatus();
			this.status = status;
			this.folderName = name ?? "";
		} catch (error) {
			console.error("Failed to read export folder:", error);
		}
	}

	private async onChoose() {
		try {
			await chooseVault();
			await this.refresh();
		} catch (error) {
			if ((error as DOMException)?.name === "AbortError") return;
			console.error("Failed to choose export folder:", error);
			alert((error as Error)?.message || i18n("Export failed. Check console for details."));
		}
	}

	private async onClear() {
		await forgetVault();
		await this.refresh();
	}

	render(): TemplateResult {
		const chosen = this.status !== "none";
		return html`
			<div class="flex flex-col gap-4">
				<p class="text-sm text-muted-foreground">
					${i18n("Sessions are written here as .md files with frontmatter.")}
				</p>

				<div class="flex items-center justify-between gap-3">
					<div class="min-w-0">
						<div class="text-sm font-medium text-foreground">${i18n("Markdown export folder")}</div>
						<div class="text-xs text-muted-foreground truncate">
							${chosen ? this.folderName : i18n("No folder chosen yet")}
							${this.status === "needs-permission" ? html` · ${i18n("Permission needed")}` : ""}
						</div>
					</div>
					<div class="flex gap-2 shrink-0">
						${Button({
							variant: "secondary",
							size: "sm",
							onClick: () => this.onChoose(),
							children: chosen ? i18n("Change") : i18n("Choose"),
						})}
						${
							chosen
								? Button({
										variant: "ghost",
										size: "sm",
										onClick: () => this.onClear(),
										children: i18n("Clear"),
									})
								: ""
						}
					</div>
				</div>
			</div>
		`;
	}
}
