import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import { Footer } from '@/components/docs/Footer'
import { Header } from '@/components/docs/Header'
import { Logo } from '@/components/docs/Logo'
import { Navigation } from '@/components/docs/Navigation'
import { SectionProvider, type Section } from '@/components/docs/SectionProvider'
import { TableOfContents } from '@/components/docs/TableOfContents'

export function Layout({
  children,
  sections = [],
  content,
}: {
  children: React.ReactNode
  sections?: Array<Section>
  content?: string
}) {
  return (
    <SectionProvider sections={sections}>
      <div className="h-full lg:ml-72 xl:mr-52 xl:ml-80">
        <motion.header
          layoutScroll
          className="contents lg:pointer-events-none lg:fixed lg:inset-0 lg:z-40 lg:flex"
        >
          <div className="contents lg:pointer-events-auto lg:block lg:w-72 xl:w-80">
            <div className="theme-chrome hidden lg:flex lg:h-full lg:flex-col lg:overflow-y-auto lg:border-r lg:border-zinc-900/10 dark:lg:border-white/10">
              <div className="theme-chrome sticky top-0 z-10 bg-white/88 px-6 pt-4 pb-2 backdrop-blur-md dark:bg-zinc-900/88">
                <Link to="/" aria-label="Home" className="inline-flex">
                  <Logo />
                </Link>
              </div>
              <div className="flex-1 px-6 pb-8">
                <Navigation className="mt-3 block" />
              </div>
            </div>
          </div>
          <Header />
        </motion.header>
        <div className="relative flex h-full flex-col px-4 pt-14 sm:px-6 lg:px-8">
          <main className="flex-auto">{children}</main>
          <Footer />
        </div>
      </div>
      <TableOfContents content={content} />
    </SectionProvider>
  )
}
