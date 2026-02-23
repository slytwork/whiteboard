'use client';

type RevealOverlayProps = {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function RevealOverlay({ title, subtitle, actionLabel, onAction }: RevealOverlayProps) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/85">
      <div className="max-w-md rounded-lg border border-white/20 bg-slate-900/90 p-8 text-center shadow-2xl">
        <h2 className="text-3xl font-bold text-chalk">{title}</h2>
        {subtitle ? <p className="mt-3 text-sm text-slate-300">{subtitle}</p> : null}
        {actionLabel && onAction ? (
          <button
            className="mt-6 rounded bg-accent px-5 py-2 font-semibold text-black hover:bg-lime-300"
            onClick={onAction}
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
