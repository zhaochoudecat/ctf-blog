import type { CollectionEntry } from "astro:content";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export interface ObsidianFile {
	name: string;
	title: string;
	url: string;
}

export interface ObsidianFolder {
	name: string;
	folders: ObsidianFolder[];
	files: ObsidianFile[];
}

function compareNames(left: { name: string }, right: { name: string }) {
	return left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" });
}

function titleFromFrontmatter(raw: string) {
	const match = raw.match(/^title:\s*(?:"([^"]*)"|'([^']*)'|(.+))\s*$/m);
	return match?.[1] ?? match?.[2] ?? match?.[3]?.trim();
}

async function findMarkdownFiles(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);

	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findMarkdownFiles(entryPath)));
		} else if (entry.isFile() && /\.mdx?$/i.test(entry.name)) {
			files.push(entryPath);
		}
	}
	return files;
}

export async function buildObsidianTree(posts: CollectionEntry<"post">[]): Promise<ObsidianFolder> {
	const root: ObsidianFolder = { name: "Obsidian", folders: [], files: [] };
	const postsByTitle = new Map<string, CollectionEntry<"post">[]>();
	for (const post of posts) {
		if (!post.id.startsWith("_obsidian/")) continue;
		const sameTitle = postsByTitle.get(post.data.title) ?? [];
		sameTitle.push(post);
		postsByTitle.set(post.data.title, sameTitle);
	}

	const sourceRoot = path.resolve(process.cwd(), "content", "posts", "_obsidian");
	for (const sourcePath of await findMarkdownFiles(sourceRoot)) {
		const relativePath = path.relative(sourceRoot, sourcePath).replaceAll("\\", "/");
		const title = titleFromFrontmatter(await readFile(sourcePath, "utf8"));
		const post = title ? postsByTitle.get(title)?.shift() : undefined;
		if (!post) continue;

		const parts = relativePath.split("/").filter(Boolean);
		const fileName = parts.pop()?.replace(/\.mdx?$/i, "");
		if (!fileName || parts.length === 0) continue;

		let folder = root;
		for (const folderName of parts) {
			let nextFolder = folder.folders.find((item) => item.name === folderName);
			if (!nextFolder) {
				nextFolder = { name: folderName, folders: [], files: [] };
				folder.folders.push(nextFolder);
			}
			folder = nextFolder;
		}

		folder.files.push({
			name: fileName,
			title: post.data.title,
			url: `/posts/${post.id}/`,
		});
	}

	function sortFolder(current: ObsidianFolder) {
		current.folders.sort(compareNames);
		current.files.sort(compareNames);
		current.folders.forEach(sortFolder);
	}

	sortFolder(root);
	return root;
}

export function countObsidianFiles(folder: ObsidianFolder): number {
	return (
		folder.files.length +
		folder.folders.reduce((total, child) => total + countObsidianFiles(child), 0)
	);
}
