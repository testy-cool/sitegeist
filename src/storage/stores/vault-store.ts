import type { StoreConfig } from "@mariozechner/pi-web-ui";
import { Store } from "@mariozechner/pi-web-ui";

const VAULT_KEY = "markdown-export-directory";

/**
 * Holds the directory the user chose for Markdown exports.
 *
 * A FileSystemDirectoryHandle is structured-cloneable, and the IndexedDB backend writes values
 * with `store.put(value)` rather than serialising them to JSON, so the handle survives a restart
 * intact. What does not survive is the *permission*: after a browser restart the handle is still
 * valid but its permission state drops back to "prompt", and re-granting requires a user gesture.
 * See ensureVaultPermission in src/export/vault.ts.
 */
export class VaultStore extends Store {
	getConfig(): StoreConfig {
		return { name: "vault" };
	}

	async getHandle(): Promise<FileSystemDirectoryHandle | null> {
		return this.getBackend().get<FileSystemDirectoryHandle>("vault", VAULT_KEY);
	}

	async setHandle(handle: FileSystemDirectoryHandle): Promise<void> {
		await this.getBackend().set("vault", VAULT_KEY, handle);
	}

	async clear(): Promise<void> {
		await this.getBackend().delete("vault", VAULT_KEY);
	}
}
