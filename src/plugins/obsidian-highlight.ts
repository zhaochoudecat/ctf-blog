import type { PhrasingContent, Text } from "mdast";
import type { MdastPluginDefinition } from "satteri";

const OBSIDIAN_HIGHLIGHT = /==([^=\n]+)==/g;

function text(value: string): Text {
	return { type: "text", value };
}

function highlight(value: string): PhrasingContent {
	return {
		type: "emphasis",
		data: { hName: "mark" },
		children: [text(value)],
	};
}

export function satteriObsidianHighlightPlugin(): MdastPluginDefinition {
	return {
		name: "cactus-obsidian-highlight",
		text(node, ctx) {
			const matches = [...node.value.matchAll(OBSIDIAN_HIGHLIGHT)];
			if (matches.length === 0) return;

			const replacement: PhrasingContent[] = [];
			let cursor = 0;

			for (const match of matches) {
				const start = match.index;
				if (start > cursor) replacement.push(text(node.value.slice(cursor, start)));
				const value = match[1];
				if (value !== undefined) replacement.push(highlight(value));
				cursor = start + match[0].length;
			}

			if (cursor < node.value.length) replacement.push(text(node.value.slice(cursor)));

			const firstReplacement = replacement[0];
			if (firstReplacement === undefined) return;
			ctx.replaceNode(node, firstReplacement);
			if (replacement.length > 1) ctx.insertAfter(node, replacement.slice(1));
		},
	};
}
