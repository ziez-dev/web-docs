import index from "./index.html";
import { existsSync } from "node:fs";
import path from "node:path";

const publicDir = path.join(process.cwd(), "public");
const docsRoutePrefixes = ["/getting-started/", "/essential/", "/patterns/", "/plugins/"] as const;
const port = Number(process.env.PORT ?? 3000);

function resolvePublicAsset(url: URL) {
  const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  if (relativePath.length === 0) {
    return null;
  }

  const assetPath = path.resolve(publicDir, relativePath);
  if (!assetPath.startsWith(`${publicDir}${path.sep}`) && assetPath !== publicDir) {
    return null;
  }

  if (!existsSync(assetPath)) {
    return null;
  }

  return Bun.file(assetPath);
}

function isDocsRoute(pathname: string) {
  return pathname === "/" || docsRoutePrefixes.some((route) => pathname.startsWith(route));
}

const server = Bun.serve({
  port,
  routes: {
    "/": index,
    "/getting-started/*": index,
    "/essential/*": index,
    "/patterns/*": index,
    "/plugins/*": index,
  },
  development: true,
  fetch(req) {
    const url = new URL(req.url);
    const asset = resolvePublicAsset(url);
    if (asset) {
      return new Response(asset);
    }

    if (isDocsRoute(url.pathname)) {
      return index as unknown as Response;
    }

    return new Response("Not Found", { status: 404 });
  },
});

console.log(`🚀 ziez docs running at ${server.url}`);
