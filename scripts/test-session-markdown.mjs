// Checks for the session -> Markdown serializer.
//
// The serializer is pure, so it can be exercised without a browser. This file is run with
// `npm run test:markdown`, which strips the TypeScript first (there is no test framework
// in this repo, and adding one is not worth it for a single pure module).

import assert from "node:assert/strict";
import { sessionToMarkdown } from "../dist-test/session-markdown.js";

let passed = 0;
const check = (name, fn) => {
	try {
		fn();
		passed++;
		console.log(`  ok  ${name}`);
	} catch (error) {
		console.error(`  FAIL ${name}`);
		console.error(
			String(error?.message ?? error)
				.split("\n")
				.map((l) => `       ${l}`)
				.join("\n"),
		);
		process.exitCode = 1;
	}
};

const usage = {
	input: 12000,
	output: 196,
	cacheRead: 7400,
	cacheWrite: 0,
	totalTokens: 19596,
	cost: { input: 0.03, output: 0.0294, cacheRead: 0.0059, cacheWrite: 0, total: 0.0653 },
};

const metadata = {
	id: "0f8c1d2e-aaaa-bbbb-cccc-1234567890ab",
	title: "Controlled Agentic Commerce with AgentCore Payments",
	createdAt: "2026-08-18T09:12:44.117Z",
	lastModified: "2026-08-18T09:18:02.559Z",
	messageCount: 4,
	thinkingLevel: "high",
	preview: "what this page a bout cuh",
	usage,
};

const session = {
	id: metadata.id,
	title: metadata.title,
	model: { id: "gpt-5.6-sol", provider: "openai-codex" },
	thinkingLevel: "high",
	createdAt: metadata.createdAt,
	lastModified: metadata.lastModified,
	messages: [
		{ role: "welcome", tutorials: [] },
		{
			role: "navigation",
			url: "https://aws.amazon.com/blogs/agentcore-payments",
			title: "Controlled Agentic Commerce",
			skillsOutput: "",
		},
		{ role: "user", content: "what this page a bout cuh", timestamp: 1 },
		{
			role: "assistant",
			content: [
				{ type: "thinking", thinking: "Planning page content extraction" },
				{ type: "toolCall", id: "call_1", name: "browser_repl", arguments: { code: "document.title" } },
			],
			model: "gpt-5.6-sol",
			provider: "openai-codex",
			api: "openai-codex-responses",
			usage,
			stopReason: "toolUse",
			timestamp: 2,
		},
		{
			role: "toolResult",
			toolCallId: "call_1",
			toolName: "browser_repl",
			content: [{ type: "text", text: "Controlled Agentic Commerce" }],
			isError: false,
			timestamp: 3,
		},
		{
			role: "assistant",
			content: [{ type: "text", text: "Basically, this page is a coding walkthrough." }],
			model: "gpt-5.6-sol",
			provider: "openai-codex",
			api: "openai-codex-responses",
			usage,
			stopReason: "stop",
			timestamp: 4,
		},
		{ role: "artifact", action: "create", filename: "notes.md", content: "x" },
	],
};

console.log("session-markdown");

const { markdown, images } = sessionToMarkdown(session, metadata);
const [, frontmatter, body] = markdown.split(/^---$/m);

check("emits a frontmatter block delimited by ---", () => {
	assert.ok(markdown.startsWith("---\n"), "should start with ---");
	assert.ok(frontmatter, "should have a frontmatter section");
	assert.ok(body, "should have a body section");
});

check("frontmatter carries identity, model and thinking level", () => {
	assert.match(frontmatter, /^id: 0f8c1d2e-aaaa-bbbb-cccc-1234567890ab$/m);
	assert.match(frontmatter, /^model: openai-codex\/gpt-5\.6-sol$/m);
	assert.match(frontmatter, /^thinking_level: high$/m);
	// Timestamps are quoted deliberately: an unquoted ISO 8601 scalar is coerced to a date object
	// by several frontmatter parsers, so quoting keeps them plain strings everywhere.
	assert.match(frontmatter, /^created: "2026-08-18T09:12:44\.117Z"$/m);
	assert.match(frontmatter, /^modified: "2026-08-18T09:18:02\.559Z"$/m);
});

check("frontmatter carries token usage and cost", () => {
	assert.match(frontmatter, /^ {2}total: 19596$/m);
	assert.match(frontmatter, /^cost_usd: 0\.0653$/m);
});

check("titles containing a colon are quoted so the YAML stays valid", () => {
	const tricky = sessionToMarkdown(
		{ ...session, title: 'Costs: "reading" it' },
		{ ...metadata, title: 'Costs: "reading" it' },
	).markdown;
	assert.match(tricky, /^title: "Costs: \\"reading\\" it"$/m);
});

check("renders user and assistant prose in full", () => {
	assert.match(body, /^## User\n\nwhat this page a bout cuh$/m);
	assert.match(body, /^Basically, this page is a coding walkthrough\.$/m);
});

check("collapses thinking and tool calls into a single summary line", () => {
	const summary = body.split("\n").find((l) => l.startsWith(">"));
	assert.ok(summary, "expected a blockquote summary line");
	assert.match(summary, /Thought/);
	assert.match(summary, /browser_repl/);
	assert.ok(
		!body.includes("Planning page content extraction"),
		"raw thinking text should not be included in a readable export",
	);
	assert.ok(!body.includes("document.title"), "raw tool arguments should not be included");
});

check("merges a tool-calling turn and its answer under one Assistant heading", () => {
	// The agent emits a tool-call message and the follow-up answer as two assistant messages, but
	// to a reader that is one turn. A toolResult sits between them and must not split the run.
	assert.equal(
		body.match(/^## Assistant$/gm).length,
		1,
		"consecutive assistant messages should share a single heading",
	);
	const turn = body.slice(body.indexOf("## Assistant"));
	assert.ok(turn.indexOf(">") < turn.indexOf("Basically"), "summary should precede the prose");
});

check("records navigation as context", () => {
	assert.match(body, /Controlled Agentic Commerce/);
	assert.match(body, /https:\/\/aws\.amazon\.com\/blogs\/agentcore-payments/);
});

check("drops welcome and artifact messages", () => {
	assert.ok(!/## Welcome/i.test(body), "welcome message should not appear");
	assert.ok(!body.includes("notes.md"), "artifact bookkeeping should not appear");
});

check("returns no images when the session has none", () => {
	assert.deepEqual(images, []);
});

check("extracts images to sibling files and references them relatively", () => {
	const withImage = sessionToMarkdown(
		{
			...session,
			messages: [
				{
					role: "user",
					content: [
						{ type: "text", text: "look" },
						{ type: "image", data: "aGVsbG8=", mimeType: "image/png" },
					],
					timestamp: 1,
				},
			],
		},
		metadata,
	);
	assert.equal(withImage.images.length, 1);
	assert.match(withImage.images[0].name, /\.png$/);
	assert.equal(withImage.images[0].base64, "aGVsbG8=");
	assert.ok(
		withImage.markdown.includes(`(${withImage.images[0].name})`),
		"body should reference the extracted image by its relative path",
	);
	assert.ok(!withImage.markdown.includes("aGVsbG8="), "base64 must not be inlined in the body");
});

check("builds a dated, slugified, filesystem-safe filename", () => {
	const { filename } = sessionToMarkdown(session, metadata);
	assert.equal(filename, "2026-08-18-controlled-agentic-commerce-with-agentcore-payments.md");
});

check("filename stays safe for titles full of punctuation and slashes", () => {
	const { filename } = sessionToMarkdown(
		{ ...session, title: "a/b\\c:d*e?f" },
		{ ...metadata, title: "a/b\\c:d*e?f" },
	);
	assert.ok(!/[/\\:*?"<>|]/.test(filename), `unsafe characters in ${filename}`);
});

check("falls back to the session id when the title slugifies to nothing", () => {
	const { filename } = sessionToMarkdown({ ...session, title: "***" }, { ...metadata, title: "***" });
	assert.ok(filename.endsWith(".md"));
	assert.ok(filename.includes("0f8c1d2e"), `expected id fallback, got ${filename}`);
});

console.log(`\n${passed} passed${process.exitCode ? ", some failed" : ""}`);
