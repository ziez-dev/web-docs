import clsx from 'clsx'
import { AnimatePresence, motion, useIsPresent } from 'framer-motion'
import { Link, useLocation } from 'react-router-dom'
import { useRef } from 'react'

import {
  useIsInsideMobileNavigation,
  useMobileNavigationStore,
} from '@/components/docs/MobileNavigation'
import { useSectionStore } from '@/components/docs/SectionProvider'
import { Tag } from '@/components/docs/Tag'
import { remToPx } from '@/lib/remToPx'
import { preloadContent } from '@/content/index'

interface NavGroup {
  title: string
  links: Array<{
    title: string
    href: string
  }>
}

function useInitialValue<T>(value: T, condition = true) {
  let initialValue = useRef(value).current
  return condition ? initialValue : value
}

function TopLevelNavItem({
  href,
  children,
}: {
  href: string
  children: React.ReactNode
}) {
  const isInsideMobileNavigation = useIsInsideMobileNavigation()
  const closeMobileNavigation = useMobileNavigationStore((state) => state.close)

  return (
    <li className="md:hidden">
      <Link
        to={href}
        className="block py-1 text-sm text-zinc-600 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        onClick={() => {
          if (isInsideMobileNavigation) {
            closeMobileNavigation()
          }
        }}
      >
        {children}
      </Link>
    </li>
  )
}

function NavLink({
  href,
  children,
  tag,
  active = false,
  isAnchorLink = false,
}: {
  href: string
  children: React.ReactNode
  tag?: string
  active?: boolean
  isAnchorLink?: boolean
}) {
  const isInsideMobileNavigation = useIsInsideMobileNavigation()
  const closeMobileNavigation = useMobileNavigationStore((state) => state.close)

  return (
    <Link
      to={href}
      aria-current={active ? 'page' : undefined}
      onMouseEnter={() => preloadContent(href)}
      onClick={() => {
        if (isInsideMobileNavigation) {
          closeMobileNavigation()
        }
      }}
      className={clsx(
        'flex justify-between gap-2 py-1 pr-3 text-sm transition',
        isAnchorLink ? 'pl-7' : 'pl-4',
        active
          ? 'text-zinc-900 dark:text-white'
          : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white',
      )}
    >
      <span className="truncate">{children}</span>
      {tag && (
        <Tag variant="small" color="zinc">
          {tag}
        </Tag>
      )}
    </Link>
  )
}

function VisibleSectionHighlight({
  group,
  pathname,
}: {
  group: NavGroup
  pathname: string
}) {
  let [sections, visibleSections] = useInitialValue(
    [
      useSectionStore((s) => s.sections),
      useSectionStore((s) => s.visibleSections),
    ],
    useIsInsideMobileNavigation(),
  )

  let isPresent = useIsPresent()
  let firstVisibleSectionIndex = Math.max(
    0,
    [{ id: '_top' }, ...sections].findIndex(
      (section) => section.id === visibleSections[0],
    ),
  )
  let itemHeight = remToPx(2)
  let height = isPresent
    ? Math.max(1, visibleSections.length) * itemHeight
    : itemHeight
  let top =
    group.links.findIndex((link) => link.href === pathname) * itemHeight +
    firstVisibleSectionIndex * itemHeight

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.2 } }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 top-0 bg-zinc-800/2.5 will-change-transform dark:bg-white/2.5"
      style={{ borderRadius: 8, height, top }}
    />
  )
}

function ActivePageMarker({
  group,
  pathname,
}: {
  group: NavGroup
  pathname: string
}) {
  let itemHeight = remToPx(2)
  let offset = remToPx(0.25)
  let activePageIndex = group.links.findIndex((link) => link.href === pathname)
  let top = offset + activePageIndex * itemHeight

  return (
    <motion.div
      layout
      className="absolute left-2 h-6 w-px bg-cyan-500"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { delay: 0.2 } }}
      exit={{ opacity: 0 }}
      style={{ top }}
    />
  )
}

function NavigationGroup({
  group,
  className,
}: {
  group: NavGroup
  className?: string
}) {
  let isInsideMobileNavigation = useIsInsideMobileNavigation()
  let { pathname } = useLocation()
  let [currentPathname, sections] = useInitialValue(
    [pathname, useSectionStore((s) => s.sections)],
    isInsideMobileNavigation,
  )

  let isActiveGroup =
    group.links.findIndex((link) => link.href === currentPathname) !== -1

  return (
    <li className={clsx('relative mt-6', className)}>
      <motion.h2
        layout="position"
        className="text-xs font-semibold text-zinc-900 dark:text-white"
      >
        {group.title}
      </motion.h2>
      <div className="relative mt-3 pl-2">
        <AnimatePresence initial={!isInsideMobileNavigation}>
          {isActiveGroup && (
            <VisibleSectionHighlight group={group} pathname={currentPathname} />
          )}
        </AnimatePresence>
        <motion.div
          layout
          className="absolute inset-y-0 left-2 w-px bg-zinc-900/10 dark:bg-white/5"
        />
        <AnimatePresence initial={false}>
          {isActiveGroup && (
            <ActivePageMarker group={group} pathname={currentPathname} />
          )}
        </AnimatePresence>
        <ul role="list" className="border-l border-transparent">
          {group.links.map((link) => (
            <motion.li key={link.href} layout="position" className="relative">
              <NavLink href={link.href} active={link.href === currentPathname}>
                {link.title}
              </NavLink>
              <AnimatePresence mode="popLayout" initial={false}>
                {link.href === currentPathname && sections.length > 0 && (
                  <motion.ul
                    role="list"
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      transition: { delay: 0.1 },
                    }}
                    exit={{
                      opacity: 0,
                      transition: { duration: 0.15 },
                    }}
                  >
                    {sections.map((section) => (
                      <li key={section.id}>
                        <NavLink
                          href={`${link.href}#${section.id}`}
                          tag={section.tag}
                          isAnchorLink
                        >
                          {section.title}
                        </NavLink>
                      </li>
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </motion.li>
          ))}
        </ul>
      </div>
    </li>
  )
}

export const navigation: Array<NavGroup> = [
  {
    title: 'Getting Started',
    links: [
      { title: 'Introduction', href: '/' },
      { title: 'Quick Start', href: '/getting-started/quick-start' },
      { title: 'Project Structure', href: '/getting-started/project-structure' },
    ],
  },
  {
    title: 'Essential',
    links: [
      { title: 'Routing', href: '/essential/routing' },
      { title: 'Request', href: '/essential/request' },
      { title: 'Response', href: '/essential/response' },
      { title: 'Middleware', href: '/essential/middleware' },
      { title: 'Error Handling', href: '/essential/error-handling' },
    ],
  },
  {
    title: 'Patterns',
    links: [
      { title: 'Serialization', href: '/patterns/serialization' },
      { title: 'Streaming', href: '/patterns/streaming' },
      { title: 'Interceptors', href: '/patterns/interceptors' },
      { title: 'Validation', href: '/patterns/validation' },
      { title: 'Schema Validation', href: '/patterns/schema-validation' },
      { title: 'Cookies', href: '/patterns/cookies' },
      { title: 'Environment', href: '/patterns/environment' },
      { title: 'Logging', href: '/patterns/logging' },
    ],
  },
  {
    title: 'Plugins',
    links: [
      { title: 'Overview', href: '/plugins/overview' },
      { title: 'CORS', href: '/plugins/ziez-cors' },
      { title: 'Compression', href: '/plugins/ziez-compression' },
      { title: 'Security', href: '/plugins/ziez-security' },
      { title: 'Static', href: '/plugins/ziez-static' },
      { title: 'Template', href: '/plugins/ziez-template' },
      { title: 'TLS', href: '/plugins/ziez-tls' },
      { title: 'Tracker', href: '/plugins/ziez-tracker' },
      { title: 'UA Parser', href: '/plugins/ziez-ua-parser' },
    ],
  },
]

export function Navigation(props: React.ComponentPropsWithoutRef<'nav'>) {
  return (
    <nav {...props}>
      <ul role="list">
        <TopLevelNavItem href="/">Docs</TopLevelNavItem>
        <TopLevelNavItem href="https://github.com/user/ziez">GitHub</TopLevelNavItem>
        {navigation.map((group, groupIndex) => (
          <NavigationGroup
            key={group.title}
            group={group}
            className={groupIndex === 0 ? 'md:mt-0' : ''}
          />
        ))}
      </ul>
    </nav>
  )
}
