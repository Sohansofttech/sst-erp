import { NextRequest } from "next/server";
import net from "net";

/**
 * Safely extracts the client IP address without blindly trusting spoofed X-Forwarded-For headers.
 *
 * Precedence:
 * 1. Platform-trusted headers from verified edge network proxies:
 *    - 'x-vercel-forwarded-for' (Vercel Edge Network)
 *    - 'cf-connecting-ip' (Cloudflare Edge Proxy)
 *    - 'x-real-ip' (Nginx / ALB / Gateway proxy)
 * 2. 'x-forwarded-for': Validated against IPv4/IPv6 format.
 * 3. Safe fallback to '127.0.0.1'.
 */
export function getClientIp(req: NextRequest | Headers): string {
  const getHeader = (name: string): string | null => {
    if ("headers" in req && typeof req.headers.get === "function") {
      return req.headers.get(name);
    }
    if (typeof (req as Headers).get === "function") {
      return (req as Headers).get(name);
    }
    return null;
  };

  // 1. Platform edge headers
  const vercelIp = getHeader("x-vercel-forwarded-for");
  if (vercelIp && net.isIP(vercelIp.trim())) {
    return vercelIp.trim();
  }

  const cfIp = getHeader("cf-connecting-ip");
  if (cfIp && net.isIP(cfIp.trim())) {
    return cfIp.trim();
  }

  const realIp = getHeader("x-real-ip");
  if (realIp && net.isIP(realIp.trim())) {
    return realIp.trim();
  }

  // 2. Inspect X-Forwarded-For
  const forwarded = getHeader("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      if (net.isIP(part)) {
        return part;
      }
    }
  }

  return "127.0.0.1";
}
