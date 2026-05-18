import clsx from 'clsx'

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-white',
        className,
      )}
    >
      <img
        src="/favicon_48.png"
        alt=""
        className="h-10 w-10 rounded-md object-cover"
      />
      <span className="flex h-10 items-center text-lg leading-none font-orbitron font-black tracking-wide">ZIEZ.DEV</span>
    </span>
  )
}
