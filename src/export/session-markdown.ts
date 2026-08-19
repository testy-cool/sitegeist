import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { SessionData, SessionMetadata } from "@mariozechner/pi-web-ui";

/**
 * Turns a stored session into a Markdown document with YAML frontmatter.
 *
 * This is a one-way, human-readable archive, not a backup format: thinking blocks and tool
 * calls collapse to a one-line summary and images move to sibling files, because a page-scraping
 * session otherwise produces a file that is almost entirely extracted HTML. The JSON export in
 * SessionListDialog remains the lossless representation that Import understands.
 *
 * Kept free of DOM and chrome APIs so it can be tested directly under node.
 */

export interface ExtractedImage {
	/** Path relative to the .md file, also used as the filename on disk. */
	name: string;
	/** Base64 payload, exactly as stored in the message. */
	base64: string;
	mimeType: string;
}

export interface MarkdownExport {
	filename: string;
	markdown: string;
	images: ExtractedImage[];
}

const EXTENSION_BY_MIME: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/jpg": "jpg",
	"image/gif": "gif",
	"image/webp": "webp",
	"image/svg+xml": "svg",
};

/**
 * YAML scalars only need quoting for some values, but working out exactly when is a good way to
 * emit a broken document. Titles routinely contain colons and quotes, so anything that is not a
 * plain word gets quoted and escaped.
 */
function yamlScalar(value: string): string {
	if (/^[A-Za-z0-9][A-Za-z0-9 _.@/-]*$/.test(value) && !/ {2}/.test(value)) {
		return value;
	}
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;
}

function slugify(value: string): string {
	return value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

/** Text of a user message, whose content may be a bare string or a content-part array. */
function userText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part: any) => part?.type === "text")
		.map((part: any) => part.text)
		.join("\n\n");
}

function collectImages(content: unknown, images: ExtractedImage[], slug: string): string[] {
	if (!Array.isArray(content)) return [];
	const refs: string[] = [];
	for (const part of content as any[]) {
		if (part?.type !== "image" || typeof part.data !== "string") continue;
		const ext = EXTENSION_BY_MIME[part.mimeType] ?? "bin";
		const name = `${slug}/image-${images.length + 1}.${ext}`;
		images.push({ name, base64: part.data, mimeType: part.mimeType });
		refs.push(`![](${name})`);
	}
	return refs;
}

/** One-line summary of the non-prose work an assistant turn did. */
function assistantSummary(content: any[]): string | undefined {
	const thinkingCount = content.filter((p) => p?.type === "thinking").length;
	const toolCalls = content.filter((p) => p?.type === "toolCall");
	const parts: string[] = [];
	if (thinkingCount > 0) {
		parts.push(thinkingCount === 1 ? "Thought" : `Thought in ${thinkingCount} blocks`);
	}
	for (const call of toolCalls) {
		parts.push(`called \`${call.name}\``);
	}
	return parts.length > 0 ? `> ${parts.join(" · ")}` : undefined;
}

export function sessionToMarkdown(session: SessionData, metadata: SessionMetadata): MarkdownExport {
	const title = session.title || metadata.title || "Untitled";
	const slugBase = slugify(title) || `session-${String(session.id).slice(0, 8)}`;
	const date = (metadata.createdAt || session.createdAt || "").slice(0, 10);
	const filename = `${date ? `${date}-` : ""}${slugBase}.md`;

	const images: ExtractedImage[] = [];
	const usage = metadata.usage;
	const model = session.model ? `${session.model.provider}/${session.model.id}` : "unknown";

	const front: string[] = [
		"---",
		`id: ${yamlScalar(String(session.id))}`,
		`title: ${yamlScalar(title)}`,
		`created: ${yamlScalar(metadata.createdAt || session.createdAt || "")}`,
		`modified: ${yamlScalar(metadata.lastModified || session.lastModified || "")}`,
		`model: ${yamlScalar(model)}`,
		`thinking_level: ${yamlScalar(String(session.thinkingLevel ?? metadata.thinkingLevel ?? "off"))}`,
		`messages: ${metadata.messageCount ?? session.messages.length}`,
	];
	if (usage) {
		front.push(
			"tokens:",
			`  input: ${usage.input ?? 0}`,
			`  output: ${usage.output ?? 0}`,
			`  cache_read: ${usage.cacheRead ?? 0}`,
			`  cache_write: ${usage.cacheWrite ?? 0}`,
			`  total: ${usage.totalTokens ?? 0}`,
			`cost_usd: ${usage.cost?.total ?? 0}`,
		);
	}
	front.push("---");

	const body: string[] = [`# ${title}`];

	// The agent splits one logical turn into a tool-calling assistant message and a follow-up
	// answer, with a toolResult in between. A reader sees one turn, so consecutive assistant
	// messages share a heading.
	let inAssistantTurn = false;

	for (const message of session.messages as AgentMessage[]) {
		const role = (message as any).role;

		// Bookkeeping and UI-only messages carry nothing a reader wants. They also must not end an
		// assistant turn, since a toolResult always sits inside one.
		if (role === "artifact" || role === "welcome" || role === "continue" || role === "toolResult") continue;

		if (role !== "assistant") inAssistantTurn = false;

		if (role === "navigation") {
			const nav = message as any;
			body.push(`### Navigated to ${nav.title || nav.url}`, `<${nav.url}>`);
			continue;
		}

		if (role === "user" || role === "user-with-attachments") {
			const text = userText((message as any).content).trim();
			const refs = collectImages((message as any).content, images, slugBase);
			const attachments = ((message as any).attachments ?? []).map((a: any) => `\`${a.fileName}\``).join(", ");
			body.push("## User");
			if (text) body.push(text);
			if (refs.length > 0) body.push(refs.join("\n"));
			if (attachments) body.push(`Attached: ${attachments}`);
			continue;
		}

		if (role === "assistant") {
			const content = ((message as any).content ?? []) as any[];
			const text = content
				.filter((p) => p?.type === "text")
				.map((p) => p.text)
				.join("\n\n")
				.trim();
			const summary = assistantSummary(content);

			// An assistant turn that only made a tool call has no prose; keep the summary so the
			// transcript still shows what happened, but do not emit an empty heading.
			if (!text && !summary) continue;
			if (!inAssistantTurn) body.push("## Assistant");
			inAssistantTurn = true;
			if (summary) body.push(summary);
			if (text) body.push(text);
		}
	}

	const markdown = `${front.join("\n")}\n\n${body.join("\n\n")}\n`;
	return { filename, markdown, images };
}
