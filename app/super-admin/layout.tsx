import type { Metadata } from "next";
import "./super-admin.css";

export const metadata: Metadata = {
  title: "Super Admin | SST-ERP",
  description: "Platform administration dashboard for SST-ERP.",
};

export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
