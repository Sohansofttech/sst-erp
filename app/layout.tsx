import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";
import Script from "next/script";


const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Institutional ERP — Student Portal",
  description: "Next.js Institutional ERP Student Portal with Multi-Tenant Architecture",
  icons: {
    icon: "/sohan_logo.png",
    shortcut: "/sohan_logo.png",
    apple: "/sohan_logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("h-full antialiased font-sans", inter.variable)}
    >
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var s=localStorage.getItem('sst_erp_inst_admin_theme_active');if(s){var t=JSON.parse(s);if(t&&t.sidebarBackground){var r=document.documentElement;r.style.setProperty('--admin-sidebar-bg',t.sidebarBackground);r.style.setProperty('--admin-primary-btn',t.primaryButtonColor);r.style.setProperty('--admin-active-nav',t.activeSidebarNav);r.style.setProperty('--admin-workspace-bg',t.workspaceBackground);r.style.setProperty('--admin-card-bg',t.cardBackground);r.style.setProperty('--admin-text-primary',t.primaryTextColor);r.style.setProperty('--admin-text-secondary',t.secondaryTextColor);r.style.setProperty('--admin-accent',t.accentColor);}}}catch(e){}})()`,
          }}
        />
      </head>
      <body suppressHydrationWarning className="min-h-full flex flex-col bg-background text-foreground">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
