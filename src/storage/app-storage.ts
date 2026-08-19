import {
	AppStorage as BaseAppStorage,
	CustomProvidersStore,
	getAppStorage,
	IndexedDBStorageBackend,
	ProviderKeysStore,
	SessionsStore,
	SettingsStore,
} from "@mariozechner/pi-web-ui";
import { CostStore } from "./stores/cost-store.js";
import { SitegeistSessionsStore } from "./stores/sessions-store.js";
import { SkillsStore } from "./stores/skills-store.js";
import { VaultStore } from "./stores/vault-store.js";

/**
 * Extended AppStorage for Sitegeist with skills, memories, and prompts stores.
 */
export class SitegeistAppStorage extends BaseAppStorage {
	readonly skills: SkillsStore;
	readonly costs: CostStore;
	readonly vault: VaultStore;

	constructor() {
		// 1. Create all stores (no backend yet)
		const settings = new SettingsStore();
		const providerKeys = new ProviderKeysStore();
		const sessions = new SitegeistSessionsStore();
		const customProviders = new CustomProvidersStore();
		const skills = new SkillsStore();
		const costs = new CostStore();
		const vault = new VaultStore();

		// 2. Gather configs from all stores
		const configs = [
			settings.getConfig(),
			SessionsStore.getMetadataConfig(),
			providerKeys.getConfig(),
			customProviders.getConfig(),
			sessions.getConfig(),
			skills.getConfig(),
			costs.getConfig(),
			vault.getConfig(),
		];

		// 3. Create backend with all configs
		const backend = new IndexedDBStorageBackend({
			dbName: "sitegeist-storage",
			version: 4, // Increment version to add the vault store (Markdown export directory)
			stores: configs,
		});

		// 4. Wire backend to all stores
		settings.setBackend(backend);
		providerKeys.setBackend(backend);
		customProviders.setBackend(backend);
		sessions.setBackend(backend);
		skills.setBackend(backend);
		costs.setBackend(backend);
		vault.setBackend(backend);

		// 5. Pass base stores to parent
		super(settings, providerKeys, sessions, customProviders, backend);

		// 6. Store references to sitegeist-specific stores
		this.skills = skills;
		this.costs = costs;
		this.vault = vault;
	}
}

/**
 * Helper to get typed Sitegeist storage.
 */
export function getSitegeistStorage(): SitegeistAppStorage {
	return getAppStorage() as SitegeistAppStorage;
}
