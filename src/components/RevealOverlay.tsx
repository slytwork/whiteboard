'use client';

type RevealOverlayProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function RevealOverlay({ title, subtitle, actionLabel, onAction }: RevealOverlayProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-[2px]">
      <div className="max-w-lg rounded-2xl border border-white/30 bg-black/95 p-10 text-center shadow-[0_24px_80px_rgba(0,0,0,0.7)]">
        <h2 className="text-3xl font-black tracking-tight text-white">{title}</h2>
        {subtitle ? <p className="mt-3 text-sm text-zinc-300">{subtitle}</p> : null}
        {actionLabel && onAction ? (
          <button
            className="mt-7 rounded-md border border-white bg-white px-6 py-2.5 text-sm font-bold uppercase tracking-wide text-black transition hover:bg-zinc-200"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
