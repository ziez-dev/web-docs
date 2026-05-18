import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'

interface Heading {
  id: string
  text: string
  level: 2 | 3
}

export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = []
  for (const line of markdown.split('\n')) {
    const match = line.match(/^(#{2,3})\s+(.+)$/)
    if (match?.[1] && match[2]) {
      const level = match[1].length as 2 | 3
      const text = match[2].trim()
      const id = text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
      headings.push({ id, text, level })
    }
  }
  return headings
}

export function TableOfContents({ content }: { content?: string }) {
  const [activeId, setActiveId] = useState<string>('')
  const skipScrollRef = useRef(false)

  const headings = content ? extractHeadings(content) : []

  useEffect(() => {
    if (headings.length === 0) {
      setActiveId('')
      return
    }

    function updateActiveHeading() {
      if (skipScrollRef.current) return

      const scrollY = window.scrollY + 100
      let current = headings[0]?.id ?? ''

      for (const h of headings) {
        const el = document.getElementById(h.id)
        if (el && el.offsetTop <= scrollY) {
          current = h.id
        }
      }

      setActiveId(current)
    }

    const timer = setTimeout(() => {
      updateActiveHeading()
      window.addEventListener('scroll', updateActiveHeading, { passive: true })
    }, 150)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('scroll', updateActiveHeading)
    }
  }, [headings])

  if (headings.length === 0) return null

  function handleClick(e: React.MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault()
    setActiveId(id)
    skipScrollRef.current = true
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
    setTimeout(() => { skipScrollRef.current = false }, 500)
  }

  return (
    <nav className="xl:fixed xl:right-0 xl:top-0 xl:flex xl:h-full xl:w-52">
      <div className="sticky top-24 pb-8 pl-8 pt-20">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-900 dark:text-white">
          On this page
        </h2>
        <ul role="list" className="mt-3 space-y-1 border-l border-zinc-900/10 dark:border-white/10">
          {headings.map((heading) => (
            <li key={heading.id}>
              <a
                href={`#${heading.id}`}
                onClick={(e) => handleClick(e, heading.id)}
                className={clsx(
                  'block truncate py-1 text-sm transition',
                  heading.level === 3 ? 'pl-6' : 'pl-4',
                  activeId === heading.id
                    ? '-ml-px border-l border-cyan-500 pl-3 font-medium text-zinc-900 dark:border-cyan-400 dark:text-white'
                    : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white',
                )}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
