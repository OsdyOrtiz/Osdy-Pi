import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerOsdyPi } from "./osdy-pi/runtime.js";

export default function (pi: ExtensionAPI): void {
	registerOsdyPi(pi);
}
