import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { Message } from "@earendil-works/pi-ai";
import { getSitegeistStorage } from "../storage/app-storage.js";
import type { NavigationMessage } from "./NavigationMessage.js";

/**
 * A user message starting with "/name" invokes the skill of that name. The transcript keeps what the user
 * typed; the model gets the skill's description and examples in front of it. The skill is read on every
 * turn, so an edited skill takes effect in the same session.
 */
async function expandSlashCommand(text: string): Promise<string> {
	const match = /^\/(\S+)\s*([\s\S]*)$/.exec(text);
	if (!match) return text;
	const [, name, request] = match;
	const skill = await getSitegeistStorage().skills.get(name);
	if (!skill) return text;
	return `<skill-invocation>
The user invoked the "${skill.name}" skill. Use it for this request. Its library is injected on pages matching: ${skill.domainPatterns.join(", ")}. Navigate to a matching page first if the current tab is not one.

${skill.description}

Examples:
${skill.examples}
</skill-invocation>

${request || `Run the "${skill.name}" skill.`}`;
}

// Helper: Check if a message has toolCall blocks
function hasToolCalls(msg: Message): boolean {
	if (msg.role !== "assistant") return false;
	return msg.content.some((block) => block.type === "toolCall");
}

// Helper: Get all toolCall IDs from an assistant message
function getToolCallIds(msg: Message): Set<string> {
	const ids = new Set<string>();
	if (msg.role !== "assistant") return ids;

	for (const block of msg.content) {
		if (block.type === "toolCall") {
			ids.add(block.id);
		}
	}
	return ids;
}

// Helper: Check if a toolResult message matches the given tool call IDs
function isToolResultFor(msg: Message, toolCallIds: Set<string>): boolean {
	if (msg.role !== "toolResult") return false;
	return toolCallIds.has(msg.toolCallId);
}

// Reorder messages so assistant tool calls are immediately followed by their tool results
// This moves navigation and other user messages after the tool results
function reorderMessages(messages: Message[]): Message[] {
	const result: Message[] = [];
	let i = 0;

	while (i < messages.length) {
		const msg = messages[i];

		if (msg.role === "assistant" && hasToolCalls(msg)) {
			// Found assistant with tool calls
			result.push(msg);
			i++;

			// Collect tool call IDs from this assistant message
			const toolCallIds = getToolCallIds(msg);

			// Scan forward and collect messages until next assistant or end
			const toolResultMessages: Message[] = [];
			const otherMessages: Message[] = [];

			while (i < messages.length && messages[i].role !== "assistant") {
				const nextMsg = messages[i];

				if (isToolResultFor(nextMsg, toolCallIds)) {
					toolResultMessages.push(nextMsg);
				} else {
					otherMessages.push(nextMsg);
				}
				i++;
			}

			// Add tool result messages first, then other messages (like nav)
			result.push(...toolResultMessages);
			result.push(...otherMessages);
		} else {
			// Not an assistant with tool calls, just add it
			result.push(msg);
			i++;
		}
	}

	return result;
}

// Custom message transformer for browser extension
// Handles navigation messages and app-specific message types
/** Prepends text to a user message's content, whether it is a string or content blocks. */
function prependToUserContent(content: any, prefix: string): any {
	if (typeof content === "string") return prefix + content;
	if (Array.isArray(content) && content[0]?.type === "text") {
		return [{ ...content[0], text: prefix + content[0].text }, ...content.slice(1)];
	}
	if (Array.isArray(content)) return [{ type: "text", text: prefix }, ...content];
	return content;
}

export async function browserMessageTransformer(messages: AgentMessage[]): Promise<Message[]> {
	const transformed = [];
	// Artifacts copied into a branched chat are invisible to the model otherwise: the history it
	// sees was cut before they were made. Name them on the next user message.
	let carriedOver: string[] = [];

	for (const m of messages) {
		if (m.role === "artifact" && m.carriedOver) {
			carriedOver.push(m.filename);
			continue;
		}

		// Filter out UI-only messages
		if (m.role === "artifact" || m.role === "welcome") {
			continue;
		}

		// Filter non-LLM messages
		if (m.role !== "user" && m.role !== "assistant" && m.role !== "toolResult" && m.role !== "navigation") {
			continue;
		}

		if (m.role === "navigation") {
			const nav = m as NavigationMessage;
			const tabInfo = nav.tabId !== undefined ? ` (tab id: ${nav.tabId})` : "";

			// Use cached skills output (formatted at message creation time)
			const skillsInfo = nav.skillsOutput;

			transformed.push({
				role: "user",
				content: `<browser-context>
✓ Navigation succeeded: ${nav.title}${tabInfo}
✓ URL: ${nav.url}
</browser-context>

<skills>
${skillsInfo}
</skills>

<instructions>
- DO NOT STOP - This is informational only. CONTINUE IMMEDIATELY with the next step of your multi-step workflow. This message does NOT mean you should wait for user input.
- DO NOT REPEAT THIS MESSAGE BACK TO THE USER!
</instructions>`,
			} as Message);
		} else if (m.role === "user") {
			const { attachments, ...rest } = m as any;
			if (typeof rest.content === "string") {
				rest.content = await expandSlashCommand(rest.content);
			} else if (Array.isArray(rest.content) && rest.content[0]?.type === "text") {
				rest.content = [
					{ ...rest.content[0], text: await expandSlashCommand(rest.content[0].text) },
					...rest.content.slice(1),
				];
			}
			if (carriedOver.length > 0) {
				rest.content = prependToUserContent(
					rest.content,
					`<carried-over-artifacts>
This chat was branched from an earlier one. The artifacts panel holds these files in their latest version from that chat, which can be newer than anything in the history above: ${carriedOver.join(", ")}. Read one with the artifacts tool's get command before changing it.
</carried-over-artifacts>

`,
				);
				carriedOver = [];
			}
			transformed.push(rest as Message);
		} else {
			transformed.push(m as Message);
		}
	}

	return reorderMessages(transformed);
}
