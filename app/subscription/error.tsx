"use client";

export default function SubscriptionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl rounded-xl border border-red-200 bg-white p-6 text-center">
      <h2 className="text-lg font-bold text-[#153B66]">Subscription data unavailable</h2>
      <p className="mt-2 text-sm text-slate-600">
        {error.message || "The subscription information could not be loaded."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-4 rounded-lg bg-[#2563EB] px-4 py-2 text-sm font-bold text-white"
      >
        Try again
      </button>
    </div>
  );
}
