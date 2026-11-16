"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  Bell,
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  LogOut,
  Menu,
  Settings,
  User,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export interface PortalNavItem {
  label: string
  href: string
  icon?: React.ReactNode
  badge?: string | number
  badgeTone?: "teal" | "muted" | "warning"
  exact?: boolean
}

export interface PortalNavGroup {
  id: string
  label: string
  items: PortalNavItem[]
  collapsible?: boolean
  defaultOpen?: boolean
}

export interface PortalUser {
  name: string
  email?: string
  role?: string
  avatarUrl?: string
  initials?: string
}

export interface PortalShellProps {
  institutionName: string
  institutionSlug: string
  portalLabel?: string
  navItems?: PortalNavItem[]
  navGroups?: PortalNavGroup[]
  academicYears?: string[]
  selectedAcademicYear?: string
  onAcademicYearChange?: (year: string) => void
  notificationCount?: number
  onNotificationClick?: () => void
  headerExtra?: React.ReactNode
  user?: PortalUser
  profileHref?: string
  onSignOut?: () => void
  sidebarFooter?: React.ReactNode
  children: React.ReactNode
}

const DEFAULT_ACADEMIC_YEARS = ["2026-27", "2025-26", "2024-25"]

const DEFAULT_USER: PortalUser = {
  name: "Dr. Ananya Sharma",
  email: "ananya.sharma@vidyaniketan.edu.in",
  role: "Senior Faculty",
  initials: "AS",
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

interface SidebarContentProps {
  institutionName: string
  institutionSlug: string
  portalLabel: string
  groups: PortalNavGroup[]
  pathname: string
  sidebarFooter?: React.ReactNode
  onNavigate?: () => void
}

function SidebarContent({
  institutionName,
  institutionSlug,
  portalLabel,
  groups,
  pathname,
  sidebarFooter,
  onNavigate,
}: SidebarContentProps) {
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {}
      for (const group of groups) {
        initial[group.id] = group.defaultOpen ?? true
      }
      return initial
    }
  )

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !(prev[groupId] ?? true),
    }))
  }

  return (
    <div className="flex h-full flex-col bg-brand text-brand-foreground">
      {/* Brand header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-sidebar-border px-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal/20 text-teal ring-1 ring-teal/30">
          <GraduationCap className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-tight text-white">
            {institutionName}
          </p>
          <p className="truncate text-[12px] font-medium text-white/70">
            {portalLabel}
          </p>
        </div>
      </div>

      {/* Grouped Navigation */}
      <nav
        aria-label="Portal Navigation"
        className="flex-1 space-y-4 overflow-y-auto px-3 py-4"
      >
        {groups.map((group) => {
          const isOpen = openGroups[group.id] ?? true
          const isCollapsible = group.collapsible ?? true

          return (
            <div key={group.id} className="space-y-1">
              {isCollapsible ? (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-1 text-left text-[11px] font-semibold tracking-wider text-white/55 uppercase transition-colors hover:text-white/85"
                >
                  <span>{group.label}</span>
                  {isOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
              ) : (
                <div className="px-3 py-1 text-[11px] font-semibold tracking-wider text-white/55 uppercase">
                  {group.label}
                </div>
              )}

              {isOpen && (
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const isActive = item.exact
                      ? pathname === item.href
                      : pathname === item.href ||
                        pathname.startsWith(`${item.href}/`)

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors",
                          isActive
                            ? "bg-white/14 font-semibold text-white shadow-xs"
                            : "text-white/78 hover:bg-white/8 hover:text-white"
                        )}
                      >
                        {isActive && (
                          <span
                            aria-hidden="true"
                            className="absolute top-1.5 bottom-1.5 left-0 w-1 rounded-r-full bg-teal"
                          />
                        )}
                        {item.icon && (
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center transition-colors",
                              isActive
                                ? "text-teal"
                                : "text-white/70 group-hover:text-white"
                            )}
                          >
                            {item.icon}
                          </span>
                        )}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span
                            className={cn(
                              "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold",
                              item.badgeTone === "warning"
                                ? "bg-warning/25 text-amber-200"
                                : item.badgeTone === "muted"
                                  ? "bg-white/12 text-white/75"
                                  : "bg-teal/20 text-teal"
                            )}
                          >
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Sidebar footer */}
      <div className="border-t border-sidebar-border p-4">
        {sidebarFooter ?? (
          <div className="rounded-lg bg-white/8 px-3 py-2.5">
            <p className="text-[11px] font-medium tracking-wide text-white/60 uppercase">
              Campus Tenant
            </p>
            <p className="mt-0.5 truncate font-mono text-[12px] text-white/90">
              /{institutionSlug}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export function PortalShell({
  institutionName,
  institutionSlug,
  portalLabel = "Teacher Portal",
  navItems,
  navGroups,
  academicYears = DEFAULT_ACADEMIC_YEARS,
  selectedAcademicYear,
  onAcademicYearChange,
  notificationCount = 0,
  onNotificationClick,
  headerExtra,
  user = DEFAULT_USER,
  profileHref,
  onSignOut,
  sidebarFooter,
  children,
}: PortalShellProps) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [internalYear, setInternalYear] = React.useState(
    selectedAcademicYear ?? academicYears[0] ?? "2026-27"
  )

  const resolvedGroups = React.useMemo<PortalNavGroup[]>(() => {
    if (navGroups && navGroups.length > 0) return navGroups
    return [
      {
        id: "default",
        label: "Navigation",
        items: navItems ?? [],
        collapsible: false,
      },
    ]
  }, [navGroups, navItems])

  const currentYear = selectedAcademicYear ?? internalYear
  const handleYearChange = (value: string) => {
    setInternalYear(value)
    onAcademicYearChange?.(value)
  }

  const userInitials = user.initials ?? getInitials(user.name)

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col">
        <SidebarContent
          institutionName={institutionName}
          institutionSlug={institutionSlug}
          portalLabel={portalLabel}
          groups={resolvedGroups}
          pathname={pathname}
          sidebarFooter={sidebarFooter}
        />
      </aside>

      {/* Mobile Collapsible Sidebar Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-72 border-r-0 bg-brand p-0 text-brand-foreground"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>{institutionName} Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent
            institutionName={institutionName}
            institutionSlug={institutionSlug}
            portalLabel={portalLabel}
            groups={resolvedGroups}
            pathname={pathname}
            sidebarFooter={sidebarFooter}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main Column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Top White Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="size-5 text-foreground" />
            </Button>

            <div className="flex min-w-0 items-center gap-2.5">
              <div className="hidden size-8 shrink-0 items-center justify-center rounded-md bg-brand/8 text-brand sm:flex">
                <Building2 className="size-4" />
              </div>
              <span className="truncate text-[15px] font-semibold text-foreground">
                {institutionName}
              </span>
              <Badge
                variant="outline"
                className="hidden border-teal/30 bg-teal/10 font-mono text-[11px] font-medium text-brand sm:inline-flex"
              >
                {institutionSlug}
              </Badge>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {headerExtra}

            {/* Academic Year Selector */}
            <Select value={currentYear} onValueChange={handleYearChange}>
              <SelectTrigger
                size="sm"
                aria-label="Select academic year"
                className="h-9 gap-1.5 border-border bg-card text-[13px] font-medium text-foreground"
              >
                <Calendar className="size-3.5 text-muted-foreground" />
                <span className="hidden text-muted-foreground md:inline">
                  AY
                </span>
                <SelectValue placeholder="Academic Year" />
              </SelectTrigger>
              <SelectContent align="end">
                {academicYears.map((year) => (
                  <SelectItem key={year} value={year}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Notification Bell */}
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onNotificationClick}
              aria-label={
                notificationCount > 0
                  ? `${notificationCount} unread notifications`
                  : "Notifications"
              }
              className="relative border-border bg-card text-muted-foreground hover:text-foreground"
            >
              <Bell className="size-4" />
              {notificationCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                  {notificationCount > 99 ? "99+" : notificationCount}
                </span>
              )}
            </Button>

            {/* User Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-2 rounded-lg px-2 hover:bg-muted"
                >
                  <Avatar size="sm">
                    {user.avatarUrl && (
                      <AvatarImage src={user.avatarUrl} alt={user.name} />
                    )}
                    <AvatarFallback>{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left md:block">
                    <p className="text-[13px] leading-tight font-semibold text-foreground">
                      {user.name}
                    </p>
                    {user.role && (
                      <p className="text-[11px] leading-tight text-muted-foreground">
                        {user.role}
                      </p>
                    )}
                  </div>
                  <ChevronDown className="hidden size-3.5 text-muted-foreground md:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-semibold text-foreground">
                      {user.name}
                    </p>
                    {user.email && (
                      <p className="truncate text-xs text-muted-foreground">
                        {user.email}
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {profileHref ? (
                  <DropdownMenuItem asChild>
                    <Link href={profileHref}>
                      <User className="size-4" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem>
                    <User className="size-4" />
                    My Profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem>
                  <Settings className="size-4" />
                  Preferences
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={onSignOut}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content Area (#F8FAFC) */}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}
