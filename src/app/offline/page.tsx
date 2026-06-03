import Image from "next/image";
import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#f6f7f9] px-6 text-center text-[#071426]">
      <section className="w-full max-w-sm rounded-[28px] bg-white p-8 shadow-[0_24px_80px_rgba(7,20,38,0.12)]">
        <Image
          src="/restock.png"
          alt="ReStock"
          width={128}
          height={128}
          className="mx-auto h-28 w-28 object-contain"
          priority
        />
        <h1 className="mt-6 text-2xl font-semibold">You are offline</h1>
        <p className="mt-3 text-sm leading-6 text-[#617084]">
          ReStock keeps your last reorder list cached. Reconnect to sync new
          changes with Supabase.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-12 items-center justify-center rounded-full bg-[#ef1d27] px-6 text-sm font-semibold text-white"
        >
          Open ReStock
        </Link>
      </section>
    </main>
  );
}
