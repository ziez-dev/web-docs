const base = (typeof process !== 'undefined' && process.env.BASE_PATH) || ''

function asset(path: string) {
  return `${base}${path}`
}

export const contentPaths: Record<string, string> = {
  '/': asset('/content/getting-started/introduction.md'),
  '/getting-started/quick-start': asset('/content/getting-started/quick-start.md'),

  '/essential/routing': asset('/content/essential/routing.md'),
  '/essential/request': asset('/content/essential/request.md'),
  '/essential/response': asset('/content/essential/response.md'),
  '/essential/middleware': asset('/content/essential/middleware.md'),
  '/essential/error-handling': asset('/content/essential/error-handling.md'),

  '/patterns/serialization': asset('/content/patterns/serialization.md'),
  '/patterns/streaming': asset('/content/patterns/streaming.md'),
  '/patterns/interceptors': asset('/content/patterns/interceptors.md'),
  '/patterns/validation': asset('/content/patterns/validation.md'),
  '/patterns/schema-validation': asset('/content/patterns/schema-validation.md'),
  '/patterns/cookies': asset('/content/patterns/cookies.md'),
  '/patterns/environment': asset('/content/patterns/environment.md'),
  '/patterns/logging': asset('/content/patterns/logging.md'),

  '/plugins/overview': asset('/content/plugins/overview.md'),
  '/plugins/ziez-cors': asset('/content/plugins/ziez-cors.md'),
  '/plugins/ziez-compression': asset('/content/plugins/ziez-compression.md'),
  '/plugins/ziez-security': asset('/content/plugins/ziez-security.md'),
  '/plugins/ziez-static': asset('/content/plugins/ziez-static.md'),
  '/plugins/ziez-template': asset('/content/plugins/ziez-template.md'),
  '/plugins/ziez-tls': asset('/content/plugins/ziez-tls.md'),
  '/plugins/ziez-tracker': asset('/content/plugins/ziez-tracker.md'),
  '/plugins/ziez-ua-parser': asset('/content/plugins/ziez-ua-parser.md'),
}

export { base }

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
