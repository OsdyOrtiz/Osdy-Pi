import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
export const PLUGIN_EVENTS = {
	QUESTION_PROMPT: "rpiv:ask-user:prompt",
} as const;

export interface SessionContextProvider {
	getCurrentSessionContext(): ExtensionContext | undefined;
}

export interface QuestionAudioNotificationRouter {
	onQuestionRequested(ctx: ExtensionContext): void;
}

export function subscribeQuestionPromptAudioNotification(
	api: Pick<ExtensionAPI, "events">,
	sessionContextProvider: SessionContextProvider,
	audioRouter: QuestionAudioNotificationRouter,
): void {
	api.events.on(PLUGIN_EVENTS.QUESTION_PROMPT, () => {
		const ctx = sessionContextProvider.getCurrentSessionContext();
		if (ctx) audioRouter.onQuestionRequested(ctx);
	});
}
