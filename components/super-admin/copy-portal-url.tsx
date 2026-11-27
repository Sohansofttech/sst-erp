"use client";

import { useState } from "react";

export function CopyPortalUrlButton({
  url,
  className = "sa-button sa-button-secondary",
  label = "Copy Portal URL",
}: {
  url: string;
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copyUrl() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button type="button" className={className} onClick={copyUrl}>
      {copied ? "Copied" : label}
    </button>
  );
}
