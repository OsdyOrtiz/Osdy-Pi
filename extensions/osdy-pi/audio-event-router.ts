import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { AudioNotificationService } from "./audio-notification-service.js";

export type AudioEventRouter = {
	onAgentStart(): void;
	onAgentEnd(ctx: ExtensionContext): void;
	onToolExecutionEnd(isError: boolean, ctx: ExtensionContext): void;
	onPermissionRequested(ctx: ExtensionContext): void;
	onQuestionRequested(ctx: ExtensionContext): void;
};

class DefaultAudioEventRouter implements AudioEventRouter {
	private errorNotified = false;

	constructor(private readonly notificationService: AudioNotificationService) {}

	onAgentStart(): void {
		this.errorNotified = false;
	}

	onAgentEnd(ctx: ExtensionContext): void {
		this.notificationService.notify("completion", ctx);
	}

	onToolExecutionEnd(isError: boolean, ctx: ExtensionContext): void {
		if (!isError || this.errorNotified) return;
		this.errorNotified = true;
		this.notificationService.notify("error", ctx);
	}

	onPermissionRequested(ctx: ExtensionContext): void {
		this.notificationService.notify("permission", ctx);
	}

	onQuestionRequested(ctx: ExtensionContext): void {
		this.notificationService.notify("question", ctx);
	}
}

export function createAudioEventRouter(
	notificationService: AudioNotificationService,
): AudioEventRouter {
	return new DefaultAudioEventRouter(notificationService);
}
