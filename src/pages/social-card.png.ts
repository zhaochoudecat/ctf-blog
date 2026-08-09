import type { APIRoute } from "astro";
import satori, { type SatoriOptions } from "satori";
import { html } from "satori-html";
import sharp from "sharp";
import RobotoMonoBold from "@/assets/roboto-mono-700.ttf";
import RobotoMono from "@/assets/roboto-mono-regular.ttf";
import { siteConfig } from "@/site.config";

export const prerender = true;

const options: SatoriOptions = {
	fonts: [
		{ data: Buffer.from(RobotoMono), name: "Roboto Mono", style: "normal", weight: 400 },
		{ data: Buffer.from(RobotoMonoBold), name: "Roboto Mono", style: "normal", weight: 700 },
	],
	height: 630,
	width: 1200,
};

export const GET: APIRoute = async () => {
	const markup = html`<div tw="flex h-full w-full flex-col bg-[#111827] p-16 text-white">
		<div tw="flex flex-1 flex-col justify-center">
			<p tw="mb-5 text-2xl text-[#38bdf8]">Writeups / Web Security / Labs</p>
			<h1 tw="m-0 text-7xl font-bold">${siteConfig.title}</h1>
			<p tw="mt-7 text-3xl text-[#cbd5e1]">Reproducible notes for CTF players.</p>
		</div>
		<div tw="flex items-center justify-between border-t-2 border-[#38bdf8] pt-8 text-2xl">
			<p>github.com/zhaochoudecat</p>
			<p>@${siteConfig.author}</p>
		</div>
	</div>`;

	const svg = await satori(markup, options);
	const png = await sharp(Buffer.from(svg)).png().toBuffer();

	return new Response(new Uint8Array(png), {
		headers: {
			"Cache-Control": "public, max-age=31536000, immutable",
			"Content-Type": "image/png",
		},
	});
};
