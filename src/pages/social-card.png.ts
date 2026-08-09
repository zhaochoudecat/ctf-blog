import type { APIRoute } from "astro";
import sharp from "sharp";
import { siteConfig } from "@/site.config";

export const prerender = true;

export const GET: APIRoute = async () => {
	const svg = `
		<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
			<rect width="1200" height="630" fill="#111827"/>
			<text x="64" y="190" fill="#38bdf8" font-family="monospace" font-size="26">Writeups / Web Security / Labs</text>
			<text x="64" y="280" fill="#ffffff" font-family="monospace" font-size="72" font-weight="700">${siteConfig.title}</text>
			<text x="64" y="350" fill="#cbd5e1" font-family="monospace" font-size="32">Reproducible notes for CTF players.</text>
			<path d="M64 454H1136" stroke="#38bdf8" stroke-width="2"/>
			<text x="64" y="535" fill="#ffffff" font-family="monospace" font-size="24">github.com/zhaochoudecat</text>
			<text x="1136" y="535" fill="#ffffff" font-family="monospace" font-size="24" text-anchor="end">@${siteConfig.author}</text>
		</svg>`;

	const png = await sharp(Buffer.from(svg)).png().toBuffer();
	return new Response(new Uint8Array(png), {
		headers: {
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Type": "image/png",
		},
	});
};
