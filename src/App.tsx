import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import "./index.css";

import { ThemeProvider } from '@/components/docs/ThemeProvider'
import { Layout } from '@/components/docs/Layout'
import { MarkdownRenderer } from '@/components/docs/MarkdownRenderer'
import { HeroPattern } from '@/components/docs/HeroPattern'
import { fetchContent } from '@/content/index'

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

function DocsPage({ onContentChange }: { onContentChange?: (content?: string) => void }) {
  const { pathname } = useLocation()
  const [content, setContent] = useState<string | undefined>()

  useEffect(() => {
    fetchContent(pathname).then((md) => {
      setContent(md ?? undefined)
      onContentChange?.(md ?? undefined)
    })
  }, [pathname, onContentChange])

  if (!content) {
    return (
      <>
        <HeroPattern />
        <article className="flex h-full w-full flex-col items-center justify-center pt-16 pb-10">
          <div className="text-sm text-zinc-500">Loading...</div>
        </article>
      </>
    )
  }

  return (
    <>
      <HeroPattern />
      <MarkdownRenderer content={content} />
    </>
  )
}

export function App() {
  const [content, setContent] = useState<string | undefined>()

  const handleContentChange = useCallback((c?: string) => {
    setContent(c)
  }, [])

  return (
    <ThemeProvider>
      <BrowserRouter basename={typeof process !== 'undefined' && process.env.BASE_PATH || undefined}>
        <ScrollToTop />
        <Layout content={content}>
          <Routes>
            <Route path="*" element={<DocsPage onContentChange={handleContentChange} />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App;
