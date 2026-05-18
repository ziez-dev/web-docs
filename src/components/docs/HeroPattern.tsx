import { GridPattern } from '@/components/docs/GridPattern'

export function HeroPattern() {
  return (
    <div className="absolute inset-0 -z-10 mx-0 max-w-none overflow-hidden">
      <div className="absolute top-0 left-1/2 -ml-152 h-100 w-325 dark:mask-[linear-gradient(white,transparent)]">
        <div className="absolute inset-0 bg-linear-to-r from-[#00d9ff] via-[#34d9ff] to-[#7ad7ff] mask-[radial-gradient(farthest-side_at_top,white,transparent)] opacity-70 dark:from-[#00e5ff]/30 dark:via-[#34d9ff]/30 dark:to-[#80deea]/30 dark:opacity-100">
          <GridPattern
            width={72}
            height={56}
            x={-12}
            y={4}
            squares={[
              [4, 3],
              [2, 1],
              [7, 3],
              [10, 6],
            ]}
            className="absolute inset-x-0 inset-y-[-50%] h-[200%] w-full skew-y-[-18deg] fill-cyan-500/25 stroke-cyan-700/30 mix-blend-multiply dark:fill-white/2.5 dark:stroke-white/5 dark:mix-blend-overlay"
          />
        </div>
        <svg
          viewBox="0 0 1113 440"
          aria-hidden="true"
          className="absolute top-0 left-1/2 -ml-76 w-278.25 fill-white/70 blur-[18px] dark:hidden"
        >
          <path d="M.016 439.5s-9.5-300 434-300S882.516 20 882.516 20V0h230.004v439.5H.016Z" />
        </svg>
      </div>
    </div>
  )
}
