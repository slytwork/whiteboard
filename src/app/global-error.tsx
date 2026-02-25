'use client';

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-black p-6 text-white">
        <div className="max-w-lg rounded-lg border border-zinc-700 bg-zinc-950 p-6 text-center">
          <h2 className="text-lg font-bold">Something went wrong.</h2>
          <p className="mt-2 text-sm text-zinc-300">{error.message || 'Unexpected application error.'}</p>
          <button
            onClick={() => reset()}
            className="mt-4 rounded-md border border-white bg-white px-4 py-2 text-xs font-bold uppercase tracking-wide text-black transition hover:bg-zinc-200"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
