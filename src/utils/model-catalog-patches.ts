import type { Model } from "@earendil-works/pi-ai/compat";
import { DEEPSEEK_MODELS } from "@earendil-works/pi-ai/providers/deepseek.models";
import { OPENAI_MODELS } from "@earendil-works/pi-ai/providers/openai.models";
import { OPENAI_CODEX_MODELS } from "@earendil-works/pi-ai/providers/openai-codex.models";
import { MODELS } from "../../node_modules/@earendil-works/pi-ai/dist/models.generated.js";

// pi-ai 0.85.1 still lists the retired DeepSeek Flash ids. DeepSeek now serves them
// from V4.1 Flash (deepseek-flash) at its price, so the picker showed a stale model
// with the wrong cost and no image input. pi-mono fixed its catalog on 2026-09-10
// (earendil-works/pi#9423) but has not published it. Delete this file once the
// installed pi-ai catalog contains deepseek-flash.
const catalog = DEEPSEEK_MODELS as Record<string, Model<"openai-completions">>;

const retiredFlash = catalog["deepseek-v4-flash"];
const pro = catalog["deepseek-v4-pro"];

if (retiredFlash && !catalog["deepseek-flash"]) {
	catalog["deepseek-flash"] = {
		...retiredFlash,
		id: "deepseek-flash",
		name: "DeepSeek V4.1 Flash",
		input: ["text", "image"],
		cost: { input: 0.3, output: 1.2, cacheRead: 0.006, cacheWrite: 0 },
	};
	delete catalog["deepseek-v4-flash"];
	delete catalog["deepseek-v4-flash-vision-exp"];

	if (pro) {
		pro.cost = { input: 1.32, output: 3.96, cacheRead: 0.044, cacheWrite: 0 };
	}
}

// GPT-6 Sol and Luna shipped on 2026-09-22 and first appear in pi-ai 0.87.1, three versions past
// the pinned one. Each is cloned from its GPT-5.6 namesake, whose shape this pi-ai already streams,
// with the id, name and price from 0.87.1's catalog. Delete this block once pi-ai is bumped.
const gpt6Cost = {
	"gpt-6-sol": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
	"gpt-6-luna": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
for (const openaiCatalog of [OPENAI_CODEX_MODELS, OPENAI_MODELS] as Record<string, Model<any>>[]) {
	for (const tier of ["sol", "luna"] as const) {
		const base = openaiCatalog[`gpt-5.6-${tier}`];
		const id = `gpt-6-${tier}` as const;
		if (base && !openaiCatalog[id]) {
			openaiCatalog[id] = { ...base, id, name: `GPT-6 ${tier === "sol" ? "Sol" : "Luna"}`, cost: gpt6Cost[id] };
		}
	}
}

// Bifrost is Vlad's self-hosted OpenAI-compatible gateway. pi-ai has no entry for it, and the
// catalog of providers is not exported, so it is reached by file path. Adding it here makes it a
// provider like any other: its key goes in the API keys tab and its models show in the picker.
// Its /v1/models lists 431 Azure models, but only the ones below are deployed for the stored key
// (checked 2026-09-21; the others return DeploymentNotFound or "provider not allowed").
// Reasoning is off: whether Bifrost passes DeepSeek's thinking parameter through is unverified.
// Cost is DeepSeek's own list price for this model; Azure's is not in the catalog.
const providers = MODELS as unknown as Record<string, Record<string, Model<"openai-completions">>>;
if (!providers.bifrost) {
	providers.bifrost = {
		"azure/deepseek-v4-flash": {
			id: "azure/deepseek-v4-flash",
			name: "DeepSeek V4 Flash (Bifrost)",
			api: "openai-completions",
			provider: "bifrost",
			baseUrl: "https://bifrost.voidxd.cloud/v1",
			reasoning: false,
			input: ["text"],
			cost: { input: 0.14, output: 0.28, cacheRead: 0.0028, cacheWrite: 0 },
			contextWindow: 1000000,
			maxTokens: 32000,
			compat: { supportsStore: false, supportsDeveloperRole: false, maxTokensField: "max_tokens" },
		},
	};
}
