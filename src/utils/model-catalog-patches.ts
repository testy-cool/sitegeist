import type { Model } from "@earendil-works/pi-ai/compat";
import { DEEPSEEK_MODELS } from "@earendil-works/pi-ai/providers/deepseek.models";

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
