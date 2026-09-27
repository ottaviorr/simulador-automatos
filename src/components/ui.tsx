import * as Tooltip from '@radix-ui/react-tooltip';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function Tip({ label, shortcut, children, side = 'bottom' }: { label: string; shortcut?: string; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side={side}
          sideOffset={6}
          className="z-50 flex items-center gap-2 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          {label}
          {shortcut && <kbd className="rounded bg-white/15 px-1.5 font-mono text-[10px] dark:bg-black/10">{shortcut}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean };

export function IconButton({ label, shortcut, active, className, side, ...p }: BtnProps & { label: string; shortcut?: string; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <Tip label={label} shortcut={shortcut} side={side}>
      <button
        aria-label={label}
        aria-pressed={active}
        className={cx(
          'grid size-9 place-items-center rounded-xl text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-violet-500 disabled:opacity-40 disabled:hover:bg-transparent dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100',
          active && 'bg-violet-100 text-violet-700 hover:bg-violet-100 hover:text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 dark:hover:bg-violet-500/20',
          className,
        )}
        {...p}
      />
    </Tip>
  );
}

export function Button({ variant = 'default', className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'default' | 'primary' | 'ghost' }) {
  return (
    <button
      className={cx(
        'inline-flex h-9 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500 disabled:pointer-events-none disabled:opacity-50',
        variant === 'primary' && 'bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400 dark:text-zinc-950',
        variant === 'default' && 'border border-zinc-200 bg-white hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800',
        variant === 'ghost' && 'hover:bg-zinc-100 dark:hover:bg-zinc-800',
        className,
      )}
      {...p}
    />
  );
}

export const inputCls =
  'h-9 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-900';

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-zinc-200 p-4 last:border-0 dark:border-zinc-800">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Badge({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'accent' | 'green' | 'red' | 'amber'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    accent: 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300',
    green: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300',
    red: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
  };
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}
