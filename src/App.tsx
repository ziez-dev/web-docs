import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import "./index.css";

import { ThemeProvider } from '@/components/docs/ThemeProvider'
import { Layout } from '@/components/docs/Layout'
import { MarkdownRenderer } from '@/components/docs/MarkdownRenderer'
import { HeroPattern } from '@/components/docs/HeroPattern'
import { contentMap } from '@/content/index'

function ScrollToTop() {
  const { pathname } = useLocation()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])

  return null
}

function DocsPage() {
  const { pathname } = useLocation()
  const content = contentMap[pathname]

  if (!content) {
    return (
      <>
        <HeroPattern />
        <article className="flex h-full flex-col pt-16 pb-10">
          <div className="flex-auto">
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              Page not found
            </h1>
            <p className="mt-4 text-zinc-600 dark:text-zinc-400">
              The page you're looking for doesn't exist.
            </p>
          </div>
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
  return (
    <ThemeProvider>
      <BrowserRouter>
        <ScrollToTop />
        <Layout>
          <Routes>
            <Route path="*" element={<DocsPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App;
