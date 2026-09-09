type MarkdownRenderContext = {
	messageType: string;
};

/**
 * Creates a display-only response Markdown wrapper. Pi passes original Markdown
 * to this pure transformer for each render, so it never persists or reuses output.
 * User markers apply only to source Markdown lines; terminal-generated soft wraps
 * are not available to this transformer and cannot receive additional markers.
 */
export function createResponseCardMarkdownTransformer(
	isEnabled: () => boolean,
): (markdown: string, context: MarkdownRenderContext) => string {
	return (markdown, { messageType }) => {
		if (
			!isEnabled() ||
			(messageType !== "assistant" && messageType !== "user") ||
			markdown === ""
		)
			return markdown;
		if (messageType === "user")
			return markdown
				.split("\n")
				.map((line) => `▌ ${line}`)
				.join("\n");
		return markdown
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");
	};
}
