import { getSitegeistStorage } from "../storage/app-storage.js";
import type { ExtractedImage } from "./session-markdown.js";

/**
 * The folder the user picked for Markdown exports, and the permission dance around it.
 *
 * Two rules govern every function here, both enforced by Chromium:
 *
 * 1. showDirectoryPicker() and requestPermission() need transient user activation. They must be
 *    reached from a click handler *before* any long await, or the activation expires and the call
 *    throws. Callers must not await storage reads first.
 * 2. After a browser restart the stored handle is still valid but its permission reverts to
 *    "prompt", so a granted folder still needs one confirming click per browser session.
 */

export type VaultStatus = "none" | "granted" | "needs-permission";

function assertSupported(): void {
	if (typeof (globalThis as any).showDirectoryPicker !== "function") {
		throw new Error("This browser does not support choosing a folder (File System Access API).");
	}
}

/** Opens the OS folder picker and remembers the choice. Must be called from a user gesture. */
export async function chooseVault(): Promise<FileSystemDirectoryHandle> {
	assertSupported();
	const handle = await (globalThis as any).showDirectoryPicker({
		id: "sitegeist-markdown-export",
		mode: "readwrite",
	});
	await getSitegeistStorage().vault.setHandle(handle);
	return handle;
}

export async function getVaultHandle(): Promise<FileSystemDirectoryHandle | null> {
	return getSitegeistStorage().vault.getHandle();
}

export async function forgetVault(): Promise<void> {
	await getSitegeistStorage().vault.clear();
}

/** Whether we have a folder, and whether it is usable right now. Safe to call without a gesture. */
export async function getVaultStatus(): Promise<{ status: VaultStatus; name?: string }> {
	const handle = await getVaultHandle();
	if (!handle) return { status: "none" };
	const permission = await handle.queryPermission({ mode: "readwrite" });
	return { status: permission === "granted" ? "granted" : "needs-permission", name: handle.name };
}

/**
 * Returns a writable handle, prompting or picking as needed.
 * Must be called from a user gesture, since both fallbacks can show browser UI.
 */
export async function ensureVault(): Promise<FileSystemDirectoryHandle> {
	const handle = await getVaultHandle();
	if (!handle) return chooseVault();

	if ((await handle.queryPermission({ mode: "readwrite" })) === "granted") return handle;
	if ((await handle.requestPermission({ mode: "readwrite" })) === "granted") return handle;

	throw new Error("Permission to write to the selected folder was denied.");
}

function base64ToBytes(base64: string): Uint8Array {
	const binary = atob(base64);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

async function writeFile(dir: FileSystemDirectoryHandle, path: string, data: string | Uint8Array): Promise<void> {
	// Image paths are "<slug>/image-1.png", so walk and create any intermediate directories.
	const segments = path.split("/");
	const filename = segments.pop() as string;
	let target = dir;
	for (const segment of segments) {
		target = await target.getDirectoryHandle(segment, { create: true });
	}
	const file = await target.getFileHandle(filename, { create: true });
	const writable = await file.createWritable();
	try {
		await writable.write(data as any);
	} finally {
		await writable.close();
	}
}

/**
 * Writes one exported session into the folder. Existing files with the same name are overwritten,
 * so re-exporting a session updates it in place rather than piling up duplicates.
 */
export async function writeSession(
	dir: FileSystemDirectoryHandle,
	file: { filename: string; markdown: string; images: ExtractedImage[] },
): Promise<void> {
	await writeFile(dir, file.filename, file.markdown);
	for (const image of file.images) {
		await writeFile(dir, image.name, base64ToBytes(image.base64));
	}
}
