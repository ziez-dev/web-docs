export const contentPaths: Record<string, string> = {
  '/': './content/getting-started/introduction.md',
  '/getting-started/quick-start': './content/getting-started/quick-start.md',

  '/essential/routing': './content/essential/routing.md',
  '/essential/request': './content/essential/request.md',
  '/essential/response': './content/essential/response.md',
  '/essential/middleware': './content/essential/middleware.md',
  '/essential/error-handling': './content/essential/error-handling.md',

  '/patterns/serialization': './content/patterns/serialization.md',
  '/patterns/streaming': './content/patterns/streaming.md',
  '/patterns/interceptors': './content/patterns/interceptors.md',
  '/patterns/validation': './content/patterns/validation.md',
  '/patterns/schema-validation': './content/patterns/schema-validation.md',
  '/patterns/cookies': './content/patterns/cookies.md',
  '/patterns/environment': './content/patterns/environment.md',
  '/patterns/logging': './content/patterns/logging.md',

  '/plugins/overview': './content/plugins/overview.md',
  '/plugins/ziez-cors': './content/plugins/ziez-cors.md',
  '/plugins/ziez-compression': './content/plugins/ziez-compression.md',
  '/plugins/ziez-security': './content/plugins/ziez-security.md',
  '/plugins/ziez-static': './content/plugins/ziez-static.md',
  '/plugins/ziez-template': './content/plugins/ziez-template.md',
  '/plugins/ziez-tls': './content/plugins/ziez-tls.md',
  '/plugins/ziez-tracker': './content/plugins/ziez-tracker.md',
  '/plugins/ziez-ua-parser': './content/plugins/ziez-ua-parser.md',
}

const cache = new Map<string, string>()

export function getContentPath(pathname: string) {
  return contentPaths[pathname] ?? null
}

export async function fetchContent(pathname: string): Promise<string | null> {
  const contentPath = contentPaths[pathname]
  if (!contentPath) return null

  const cached = cache.get(contentPath)
  if (cached) return cached

  const res = await fetch(contentPath)
  if (!res.ok) return null

  const text = await res.text()
  cache.set(contentPath, text)
  return text
}

export function preloadContent(pathname: string) {
  fetchContent(pathname)
}
