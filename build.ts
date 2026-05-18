import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import tailwind from "bun-plugin-tailwind";

const outdir = path.join(process.cwd(), "dist");
const publicDir = path.join(process.cwd(), "public");
await rm(outdir, { recursive: true, force: true });

const entrypoints = [...new Bun.Glob("src/**/*.html").scanSync()];

const result = await Bun.build({
	entrypoints,
	outdir,
	plugins: [tailwind],
	minify: true,
	target: "browser",
	sourcemap: "none",
	splitting: true,
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
});

for (const output of result.outputs) {
	console.log(
		` ${path.relative(process.cwd(), output.path)}  ${(output.size / 1024).toFixed(1)} KB`,
	);
}

if (existsSync(publicDir)) {
	await cp(publicDir, outdir, { recursive: true });
	console.log(` copied public assets -> ${path.relative(process.cwd(), outdir)}`);
}
