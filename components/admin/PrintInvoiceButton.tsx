"use client";

export function PrintInvoiceButton() {
  return (
    <button
      className="rounded-md bg-[#123B5A] px-4 py-2 text-sm font-semibold text-white"
      type="button"
      onClick={() => window.print()}
    >
      Print / Save as PDF
    </button>
  );
}
