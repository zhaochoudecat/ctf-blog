import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.resolve(
	process.env.OBSIDIAN_VAULT_PATH || process.argv[2] || path.join(projectRoot, "..", "obsidian"),
);
const postsRoot = path.join(projectRoot, "content", "posts");
const targetRoot = path.join(postsRoot, "_obsidian");
const publicRoot = path.join(projectRoot, "public");
const htmlNotesRoot = path.join(publicRoot, "_obsidian");
const publishOnly = process.env.OBSIDIAN_PUBLISH_ONLY === "true";

if (!isInside(postsRoot, targetRoot) || !isInside(publicRoot, htmlNotesRoot)) {
	throw new Error("Refusing to write generated Obsidian content outside the project");
}

if (!(await isDirectory(sourceRoot))) {
	console.warn(`[obsidian] Vault not found at ${sourceRoot}; local sync skipped.`);
	process.exit(0);
}

const sourceFiles = await findMarkdownFiles(sourceRoot);
const notes = [];

for (const sourcePath of sourceFiles) {
	if (path.basename(sourcePath).toLowerCase() === "readme.md") continue;
	const raw = await readFile(sourcePath, "utf8");
	const parsed = splitFrontmatter(raw);
	if (!parsed) continue;

	const data = parseSimpleFrontmatter(parsed.frontmatter);
	const publishDate = normalizeDate(data.publishDate ?? data.date);
	const title = stringValue(data.title);

	if (!title || !publishDate || data.publish === false || (publishOnly && data.publish !== true)) {
		continue;
	}

	notes.push({
		body: parsed.body,
		data,
		publishDate,
		relativePath: path.relative(sourceRoot, sourcePath),
		sourcePath,
		title,
	});
}

const htmlSourceFiles = await findHtmlFiles(sourceRoot);
const htmlNotes = [];

for (const sourcePath of htmlSourceFiles) {
	const raw = await readFile(sourcePath, "utf8");
	const title = extractHtmlTitle(raw);
	if (!title) continue;

	const companion = await readCompanionMarkdown(sourcePath);
	const data = companion?.data ?? {};
	const sourceStats = await stat(sourcePath);
	const publishDate = normalizeDate(data.publishDate ?? data.date) || sourceStats.mtime.toISOString();
	if (data.publish === false || (publishOnly && data.publish !== true)) continue;

	htmlNotes.push({
		data,
		publishDate,
		relativePath: path.relative(sourceRoot, sourcePath),
		sourcePath,
		title: `${title}（学霸笔记）`,
	});
}

await rm(targetRoot, { recursive: true, force: true });
await mkdir(targetRoot, { recursive: true });
await rm(htmlNotesRoot, { recursive: true, force: true });
await mkdir(htmlNotesRoot, { recursive: true });

const copiedAssets = new Set();
const missingAssets = new Set();

for (const note of notes) {
	const destinationPath = path.join(targetRoot, note.relativePath);
	const body = await transformMarkdown(note.body, note.sourcePath, destinationPath);
	const tags = uniqueStrings([
		...arrayValue(note.data.tags),
		...arrayValue(note.data.categories),
		...arrayValue(note.data.category),
	]);
	const description =
		stringValue(note.data.description) || makeDescription(body) || `${note.title} CTF Writeup`;

	const frontmatter = formatFrontmatter({
		title: note.title,
		description,
		publishDate: note.publishDate,
		updatedDate: normalizeDate(note.data.updatedDate ?? note.data.updated),
		tags,
		draft: note.data.draft === true,
		pinned: note.data.pinned === true,
	});

	await mkdir(path.dirname(destinationPath), { recursive: true });
	await writeFile(destinationPath, `---\n${frontmatter}---\n\n${body.trimStart()}`, "utf8");
}

for (const note of htmlNotes) {
	const destinationPath = path.join(targetRoot, note.relativePath.replace(/\.html?$/i, ".md"));
	const destinationHtmlPath = path.join(htmlNotesRoot, note.relativePath);
	const publicPath = publicUrlPath(note.relativePath);
	const description =
		stringValue(note.data.description) || `${note.title}：保留原始 HTML 页面样式的可视化笔记。`;
	const tags = uniqueStrings([
		...arrayValue(note.data.tags),
		...arrayValue(note.data.categories),
		...arrayValue(note.data.category),
	]);
	const frontmatter = formatFrontmatter({
		title: note.title,
		description,
		publishDate: note.publishDate,
		updatedDate: normalizeDate(note.data.updatedDate ?? note.data.updated),
		tags,
		draft: note.data.draft === true,
		pinned: note.data.pinned === true,
	});
	const safeTitle = escapeHtml(note.title);
	const body = [
		"这是从 Obsidian 同步的独立 HTML 学霸笔记，保留原页面的排版、配色和交互效果。",
		`<div class="html-note-embed"><iframe src="${publicPath}" title="${safeTitle}" loading="lazy"></iframe></div>`,
		`<p><a href="${publicPath}" target="_blank" rel="noopener noreferrer">在新窗口打开 HTML 学霸笔记 ↗</a></p>`,
	].join("\n\n");

	await mkdir(path.dirname(destinationPath), { recursive: true });
	await mkdir(path.dirname(destinationHtmlPath), { recursive: true });
	await copyFile(note.sourcePath, destinationHtmlPath);
	await writeFile(destinationPath, `---\n${frontmatter}---\n\n${body}\n`, "utf8");
}

console.log(
	`[obsidian] Imported ${notes.length + htmlNotes.length} posts (${notes.length} Markdown, ${htmlNotes.length} HTML) and ${copiedAssets.size} referenced assets from ${sourceRoot}.`,
);
if (missingAssets.size > 0) {
	console.warn(`[obsidian] ${missingAssets.size} local image references could not be resolved:`);
	for (const item of [...missingAssets].slice(0, 12)) console.warn(`  - ${item}`);
	if (missingAssets.size > 12) console.warn(`  - ...and ${missingAssets.size - 12} more`);
}

async function transformMarkdown(markdown, sourcePath, destinationPath) {
	const lines = markdown.split(/(?<=\n)/);
	let fence = null;
	const output = [];

	for (const line of lines) {
		const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
		if (fenceMatch) {
			const marker = fenceMatch[1][0];
			if (fence === marker) {
				fence = null;
				output.push(line);
			} else if (!fence) {
				fence = marker;
				output.push(normalizeFenceLanguage(line));
			} else output.push(line);
			continue;
		}

		if (fence) {
			output.push(line);
			continue;
		}

		let transformed = await replaceAsync(
			line,
			/!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+["'][^)]*["'])?\s*\)/g,
			async (match, alt, rawTarget) => {
				const result = await localAssetTarget(rawTarget, sourcePath, destinationPath);
				return result ? `![${alt}](${result})` : match;
			},
		);

		transformed = await replaceAsync(transformed, /!\[\[([^\]]+)\]\]/g, async (match, value) => {
			const [rawTarget, alias] = value.split("|", 2);
			const result = await localAssetTarget(rawTarget, sourcePath, destinationPath);
			return result ? `![${alias ?? ""}](${result})` : match;
		});

		// Keep unresolved Obsidian note links readable without creating broken .md URLs.
		transformed = transformed.replace(/(?<!!)\[\[([^\]]+)\]\]/g, (_match, value) => {
			const [target, alias] = value.split("|", 2);
			return alias || target;
		});

		output.push(transformed);
	}

	return output.join("");
}

async function localAssetTarget(rawTarget, sourcePath, destinationPath) {
	let target = rawTarget.trim();
	if (target.startsWith("<") && target.endsWith(">")) target = target.slice(1, -1);
	if (/^(?:[a-z]+:|#|\/\/)/i.test(target)) return null;

	const targetWithoutFragment = target.split(/[?#]/, 1)[0];
	let decodedTarget = targetWithoutFragment;
	try {
		decodedTarget = decodeURIComponent(targetWithoutFragment);
	} catch {
		// Keep the original text when a note contains a literal percent sign.
	}

	const normalizedTarget = decodedTarget.replaceAll("/", path.sep);
	const candidates = [];
	if (normalizedTarget.startsWith(path.sep)) {
		candidates.push(path.join(sourceRoot, normalizedTarget.replace(/^[/\\]+/, "")));
	} else {
		candidates.push(path.resolve(path.dirname(sourcePath), normalizedTarget));
	}

	const assetsIndex = normalizedTarget.toLowerCase().indexOf(`assets${path.sep}`);
	if (assetsIndex >= 0) {
		candidates.push(path.join(sourceRoot, normalizedTarget.slice(assetsIndex)));
	}
	candidates.push(path.join(sourceRoot, "assets", path.basename(normalizedTarget)));

	let resolvedAsset;
	for (const candidate of candidates) {
		if (isInside(sourceRoot, candidate) && (await isFile(candidate))) {
			resolvedAsset = candidate;
			break;
		}
	}

	if (!resolvedAsset) {
		missingAssets.add(`${path.relative(sourceRoot, sourcePath)} -> ${target}`);
		return null;
	}

	const assetRelativePath = path.relative(sourceRoot, resolvedAsset);
	const destinationAsset = path.join(targetRoot, assetRelativePath);
	const assetKey = destinationAsset.toLowerCase();
	if (!copiedAssets.has(assetKey)) {
		await mkdir(path.dirname(destinationAsset), { recursive: true });
		await copyFile(resolvedAsset, destinationAsset);
		copiedAssets.add(assetKey);
	}

	let relativeTarget = path.relative(path.dirname(destinationPath), destinationAsset).replaceAll("\\", "/");
	if (!relativeTarget.startsWith(".")) relativeTarget = `./${relativeTarget}`;
	return /[\s()]/.test(relativeTarget) ? `<${relativeTarget}>` : relativeTarget;
}

function splitFrontmatter(raw) {
	const content = raw.replace(/^\uFEFF/, "");
	const match = content.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
	if (!match) return null;
	return { frontmatter: match[1], body: content.slice(match[0].length) };
}

function parseSimpleFrontmatter(frontmatter) {
	const data = {};
	const lines = frontmatter.split(/\r?\n/);

	for (let index = 0; index < lines.length; index += 1) {
		const match = lines[index].match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
		if (!match) continue;
		const [, key, rawValue = ""] = match;

		if (rawValue.trim()) {
			data[key] = parseScalar(rawValue.trim());
			continue;
		}

		const values = [];
		let cursor = index + 1;
		while (cursor < lines.length) {
			const item = lines[cursor].match(/^\s+-\s+(.+)$/);
			if (!item) break;
			values.push(parseScalar(item[1].trim()));
			cursor += 1;
		}
		if (values.length > 0) {
			data[key] = values;
			index = cursor - 1;
		}
	}

	return data;
}

function parseScalar(value) {
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === "null" || value === "~") return null;
	if (value.startsWith("[") && value.endsWith("]")) {
		return value
			.slice(1, -1)
			.split(",")
			.map((item) => parseScalar(item.trim()))
			.filter((item) => item !== "");
	}
	if (value.startsWith('"') && value.endsWith('"')) {
		try {
			return JSON.parse(value);
		} catch {
			return value.slice(1, -1);
		}
	}
	if (value.startsWith("'") && value.endsWith("'")) {
		return value.slice(1, -1).replaceAll("''", "'");
	}
	return value;
}

function formatFrontmatter(data) {
	const lines = [
		`title: ${yamlString(data.title)}`,
		`description: ${yamlString(data.description)}`,
		`publishDate: ${yamlString(data.publishDate)}`,
	];
	if (data.updatedDate) lines.push(`updatedDate: ${yamlString(data.updatedDate)}`);
	if (data.tags.length === 0) lines.push("tags: []");
	else {
		lines.push("tags:");
		for (const tag of data.tags) lines.push(`  - ${yamlString(tag)}`);
	}
	lines.push(`draft: ${data.draft}`, `pinned: ${data.pinned}`);
	return `${lines.join("\n")}\n`;
}

function normalizeFenceLanguage(line) {
	return line.replace(/^(\s{0,3}(?:`{3,}|~{3,}))([^\s`~]+)/, (_match, fence, language) => {
		const normalized = language.toLowerCase();
		const aliases = {
			basg: "bash",
			htaccess: "apache",
			url: "text",
		};
		return `${fence}${aliases[normalized] ?? normalized}`;
	});
}

function makeDescription(body) {
	const withoutCode = body.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g, " ");
	for (const paragraph of withoutCode.split(/\r?\n\s*\r?\n/)) {
		const meaningfulLines = paragraph
			.split(/\r?\n/)
			.filter((line) => !/^\s*(?:#{1,6}\s|!\[)/.test(line));
		if (meaningfulLines.length === 0) continue;
		const text = meaningfulLines
			.join("\n")
			.replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
			.replace(/<[^>]+>/g, " ")
			.replace(/^\s{0,3}(?:#{1,6}|>|[-*+] |\d+\. )\s*/gm, "")
			.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
			.replace(/[`*_~]/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (text && !/^\|.*\|$/.test(text)) return truncate(text, 160);
	}
	return "";
}

function normalizeDate(value) {
	if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
	const text = stringValue(value);
	return text || "";
}

function extractHtmlTitle(raw) {
	const match = raw.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
	return match ? match[1].replace(/\s+/g, " ").trim() : "";
}

async function readCompanionMarkdown(sourcePath) {
	const sourceDirectory = path.dirname(sourcePath);
	const sourceBaseName = path.basename(sourcePath, path.extname(sourcePath));
	const baseNames = [sourceBaseName.replace(/-学霸笔记$/u, ""), sourceBaseName];

	for (const baseName of baseNames) {
		const candidate = path.join(sourceDirectory, `${baseName}.md`);
		if (!(await isFile(candidate))) continue;
		const parsed = splitFrontmatter(await readFile(candidate, "utf8"));
		if (parsed) return { data: parseSimpleFrontmatter(parsed.frontmatter) };
	}

	return null;
}

function arrayValue(value) {
	if (Array.isArray(value)) return value.flatMap(arrayValue);
	const text = stringValue(value);
	return text ? [text] : [];
}

function stringValue(value) {
	if (value === undefined || value === null) return "";
	return String(value).trim();
}

function uniqueStrings(values) {
	return [...new Set(values.map(stringValue).filter(Boolean))];
}

function yamlString(value) {
	return JSON.stringify(String(value));
}

function truncate(value, maxLength) {
	return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

async function findMarkdownFiles(root) {
	const files = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) files.push(...(await findMarkdownFiles(fullPath)));
		else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) files.push(fullPath);
	}
	return files.sort((left, right) => left.localeCompare(right, "zh-CN"));
}

async function findHtmlFiles(root) {
	const files = [];
	for (const entry of await readdir(root, { withFileTypes: true })) {
		if (entry.name.startsWith(".")) continue;
		const fullPath = path.join(root, entry.name);
		if (entry.isDirectory()) files.push(...(await findHtmlFiles(fullPath)));
		else if (entry.isFile() && /\.html?$/i.test(entry.name)) files.push(fullPath);
	}
	return files.sort((left, right) => left.localeCompare(right, "zh-CN"));
}

async function replaceAsync(value, regex, replacer) {
	let result = "";
	let lastIndex = 0;
	for (const match of value.matchAll(regex)) {
		result += value.slice(lastIndex, match.index);
		result += await replacer(...match);
		lastIndex = match.index + match[0].length;
	}
	return result + value.slice(lastIndex);
}

async function isDirectory(target) {
	try {
		return (await stat(target)).isDirectory();
	} catch {
		return false;
	}
}

async function isFile(target) {
	try {
		return (await stat(target)).isFile();
	} catch {
		return false;
	}
}

function isInside(parent, child) {
	const relative = path.relative(path.resolve(parent), path.resolve(child));
	return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function publicUrlPath(relativePath) {
	return `/_obsidian/${relativePath
		.split(path.sep)
		.map((segment) => encodeURIComponent(segment))
		.join("/")}`;
}

function escapeHtml(value) {
	return String(value)
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}
