// The permission half of the File System Access API is not in TypeScript's DOM lib, because it is
// a Chromium extension to the spec rather than part of it. These are the only members we use.

interface FileSystemHandlePermissionDescriptor {
	mode?: "read" | "readwrite";
}

interface FileSystemHandle {
	queryPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
	requestPermission(descriptor?: FileSystemHandlePermissionDescriptor): Promise<PermissionState>;
}
