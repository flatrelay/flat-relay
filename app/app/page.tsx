import Link from 'next/link';

export default function Home() {
  return (
    <section className="pt-16 sm:pt-28">
      <p className="font-mono text-xs uppercase tracking-[0.3em] text-flat">Live on Robinhood Chain</p>
      <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-[1.05] sm:text-7xl">
        Send $WIF as something to play.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-muted">
        Fund a challenge, share the link, and whoever beats it claims the $WIF. Every campaign burns 1%, and every
        claim is a public onchain transfer.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/create" className="rounded-full bg-flat px-6 py-3 font-medium text-ink">
          Send a $WIF gift
        </Link>
        <Link href="/proof" className="rounded-full border border-line px-6 py-3 hover:border-flat">
          See the proof →
        </Link>
      </div>
    </section>
  );
}
