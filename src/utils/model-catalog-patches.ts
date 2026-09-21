import type { Model } from "@earendil-works/pi-ai/compat";
import { DEEPSEEK_MODELS } from "@earendil-works/pi-ai/providers/deepseek.models";
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
