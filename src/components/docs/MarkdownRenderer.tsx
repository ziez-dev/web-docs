import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeShikiFromHighlighter from '@shikijs/rehype/core'
import rehypeRaw from 'rehype-raw'
import { createHighlighterCoreSync } from 'shiki/core'
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript'
import clsx from 'clsx'
import type { Components } from 'react-markdown'
import type { HighlighterCore } from 'shiki/core'

import { ArchitectureFlowDiagram } from '@/components/docs/diagrams/ArchitectureFlowDiagram'
import { MiddlewareFlowDiagram } from '@/components/docs/diagrams/MiddlewareFlowDiagram'
import { Prose } from '@/components/docs/Prose'
import { useTheme } from '@/components/docs/ThemeProvider'

let highlighterInstance: HighlighterCore | null = null
let highlighterPromise: Promise<HighlighterCore> | null = null

async function getHighlighter(): Promise<HighlighterCore> {
  if (highlighterInstance) return highlighterInstance
  if (highlighterPromise) return highlighterPromise

  highlighterPromise = (async () => {
    const [zig, bash] = await Promise.all([
      import('shiki/langs/zig.mjs'),
      import('shiki/langs/bash.mjs'),
    ])
    const [tokyoNight, githubLight] = await Promise.all([
      import('shiki/themes/tokyo-night.mjs'),
      import('shiki/themes/github-light.mjs'),
    ])

    const hl = createHighlighterCoreSync({
      themes: [tokyoNight.default, githubLight.default],
      langs: [zig.default, bash.default],
      engine: createJavaScriptRegexEngine(),
    })
    highlighterInstance = hl
    return hl
  })()

  return highlighterPromise
}

const diagramComponents: Record<string, React.ComponentType> = {
  'architecture': ArchitectureFlowDiagram,
  'middleware-flow': MiddlewareFlowDiagram,
}

function InfoIcon(props: React.ComponentPropsWithoutRef<'svg'>) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" {...props}>
      <circle cx="8" cy="8" r="8" strokeWidth="0" />
      <path
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
        d="M6.75 7.75h1.5v3.5"
      />
      <circle cx="8" cy="4" r=".5" fill="none" />
    </svg>
  )
}

function extractText(node: any): string {
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (node?.props?.children) return extractText(node.props.children)
  return ''
}

function CodeBlock({ children, lang = '', ...props }: any) {
  const [copied, setCopied] = useState(false)

  const rawText = extractText(children)

  const handleCopy = () => {
    navigator.clipboard.writeText(rawText.replace(/\n$/, ''))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="not-prose my-6 overflow-hidden rounded-xl border border-zinc-200 bg-white/90 shadow-sm dark:border-zinc-700/50 dark:bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/80 px-4 py-2 dark:border-zinc-700/50 dark:bg-zinc-900/80">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-zinc-500 dark:text-zinc-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{lang || 'text'}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          {copied ? (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12" /></svg>
              Copied
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre {...props}>
        {children}
      </pre>
    </div>
  )
}

const components: Components = {
  pre({ node, children, ...props }: any) {
    const codeNode = node?.children?.find((c: any) => c.tagName === 'code')
    const codeClass = codeNode?.properties?.className || []
    const langMatch = Array.isArray(codeClass)
      ? codeClass.find((c: string) => c.startsWith('language-'))
      : /language-(\w+)/.exec(codeClass)?.[0]
    const lang = langMatch?.replace('language-', '') || ''
    return <CodeBlock lang={lang} {...props}>{children}</CodeBlock>
  },
  div({ node, children, ...props }: any) {
    const diagramType = node?.properties?.dataDiagram
    if (diagramType && diagramType in diagramComponents) {
      const DiagramComponent = diagramComponents[diagramType]!
      return <DiagramComponent />
    }
    return <div {...props}>{children}</div>
  },
  code({ className, children, ...props }) {
    if (!className) {
      return (
        <code
          className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200"
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  h1({ children, ...props }) {
    const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    return (
      <h1 id={id} className="scroll-mt-24" {...props}>
        {children}
      </h1>
    )
  },
  h2({ children, ...props }) {
    const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    return (
      <h2 id={id} className="scroll-mt-24" {...props}>
        <a href={`#${id}`} className="group text-inherit no-underline hover:text-inherit">
          {children}
        </a>
      </h2>
    )
  },
  h3({ children, ...props }) {
    const id = String(children).toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    return (
      <h3 id={id} className="scroll-mt-24" {...props}>
        <a href={`#${id}`} className="group text-inherit no-underline hover:text-inherit">
          {children}
        </a>
      </h3>
    )
  },
  table({ children, ...props }) {
    return (
      <div className="my-6 overflow-x-auto">
        <table className="w-full text-left text-sm" {...props}>
          {children}
        </table>
      </div>
    )
  },
  blockquote({ children, ...props }) {
    return (
      <div className="my-6 flex gap-2.5 rounded-2xl border border-cyan-500/20 bg-cyan-50/50 p-4 text-sm/6 text-cyan-900 dark:border-cyan-500/30 dark:bg-cyan-500/5 dark:text-cyan-200 dark:[--tw-prose-links-hover:var(--color-cyan-300)] dark:[--tw-prose-links:var(--color-white)]">
        <InfoIcon className="mt-1 h-4 w-4 flex-none fill-cyan-500 stroke-white dark:fill-cyan-200/20 dark:stroke-cyan-200" />
        <div className="*:first:mt-0 *:last:mb-0">{children}</div>
      </div>
    )
  },
  a({ href, children, ...props }) {
    const isExternal = href?.startsWith('http')
    return (
      <a
        href={href}
        {...(isExternal ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        {...props}
      >
        {children}
      </a>
    )
  },
}

export function MarkdownRenderer({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const { resolvedTheme } = useTheme()
  const [highlighter, setHighlighter] = useState<HighlighterCore | null>(highlighterInstance)

  useEffect(() => {
    if (!highlighter) {
      getHighlighter().then(setHighlighter)
    }
  }, [highlighter])

  if (!highlighter) {
    return (
      <article className={clsx('flex h-full w-full flex-col items-center justify-center pt-16 pb-10', className)}>
        <div className="text-sm text-zinc-500">Loading...</div>
      </article>
    )
  }

  return (
    <article className={clsx('flex h-full w-full flex-col pt-16 pb-10', className)}>
      <Prose className="flex-auto w-full">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[
            [rehypeShikiFromHighlighter, highlighter, { theme: resolvedTheme === 'dark' ? 'tokyo-night' : 'github-light', addLanguageClass: true }],
            rehypeRaw,
          ]}
          components={components}
        >
          {content}
        </ReactMarkdown>
      </Prose>
    </article>
  )
}
