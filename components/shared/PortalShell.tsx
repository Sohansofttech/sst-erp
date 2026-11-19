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
  notificationElement?: React.ReactNode
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
  user?: PortalUser
  onSignOut?: () => void
  sidebarFooter?: React.ReactNode
  onNavigate?: () => void
}

function SidebarContent({
  institutionName,
  institutionSlug,
  portalLabel,
  groups,
  pathname,
  user,
  onSignOut,
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

  const userInitials = user ? (user.initials ?? getInitials(user.name)) : "TC"

  return (
    <div className="flex h-full flex-col bg-[#123B5A] text-white select-none">
      {/* Brand header */}
      <div className="flex h-16 shrink-0 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#F5A000] text-white shadow-xs">
          <GraduationCap className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-tight text-white">
            {institutionName}
          </p>
          <p className="truncate text-[12px] font-medium text-white/75">
            {portalLabel}
          </p>
        </div>
      </div>

      {/* Profile banner inside sidebar */}
      {user && (
        <div className="mx-3 mt-3 mb-1 flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 border border-white/10">
          <Avatar className="size-10 shrink-0 ring-2 ring-[#F5A000]/60">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt={user.name} />}
            <AvatarFallback className="bg-[#F5A000] text-white font-bold text-xs">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-white leading-tight">
              {user.name}
            </p>
            <p className="truncate text-[11px] text-white/70 leading-tight mt-0.5">
              {user.role ?? user.email}
            </p>
          </div>
        </div>
      )}

      {/* Grouped Navigation */}
      <nav
        aria-label="Portal Navigation"
        className="flex-1 space-y-4 overflow-y-auto px-3 py-3"
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
                  className="flex w-full items-center justify-between rounded-lg px-3 py-1 text-left text-[11px] font-bold tracking-wider text-white/60 uppercase transition-colors hover:text-white/90"
                >
                  <span>{group.label}</span>
                  {isOpen ? (
                    <ChevronDown className="size-3.5" />
                  ) : (
                    <ChevronRight className="size-3.5" />
                  )}
                </button>
              ) : (
                <div className="px-3 py-1 text-[11px] font-bold tracking-wider text-white/60 uppercase">
                  {group.label}
                </div>
              )}

              {isOpen && (
                <div className="space-y-1">
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
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-all",
                          isActive
                            ? "bg-[#F5A000] font-bold text-white shadow-xs"
                            : "text-white/80 font-semibold hover:bg-[#1B4D70] hover:text-white"
                        )}
                      >
                        {item.icon && (
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center transition-colors",
                              isActive
                                ? "text-white"
                                : "text-white/75 group-hover:text-white"
                            )}
                          >
                            {item.icon}
                          </span>
                        )}
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.badge !== undefined && (
                          <span
                            className={cn(
                              "inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-bold",
                              isActive
                                ? "bg-white/25 text-white"
                                : item.badgeTone === "warning"
                                  ? "bg-[#F5A000]/30 text-amber-200"
                                  : "bg-white/15 text-white"
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
      <div className="border-t border-white/10 p-3 space-y-2">
        {sidebarFooter ?? (
          <div className="rounded-xl bg-white/[0.06] border border-white/10 px-3 py-2">
            <p className="text-[10px] font-bold tracking-wider text-white/60 uppercase">
              Campus Tenant
            </p>
            <p className="mt-0.5 truncate font-mono text-[12px] text-white/90">
              /{institutionSlug}
            </p>
          </div>
        )}
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] font-medium text-white/75 hover:bg-[#1B4D70] hover:text-white transition-colors"
          >
            <LogOut className="size-4 text-white/70" />
            <span>Sign out</span>
          </button>
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
  notificationElement,
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
    <div className="sst-teacher-theme min-h-screen bg-[#EEF1F5] text-[#202936]">
      {/* Desktop Fixed Left Sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64 lg:flex-col shadow-lg">
        <SidebarContent
          institutionName={institutionName}
          institutionSlug={institutionSlug}
          portalLabel={portalLabel}
          groups={resolvedGroups}
          pathname={pathname}
          user={user}
          onSignOut={onSignOut}
          sidebarFooter={sidebarFooter}
        />
      </aside>

      {/* Mobile Collapsible Sidebar Drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          className="w-72 border-r-0 bg-[#123B5A] p-0 text-white"
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
            user={user}
            onSignOut={onSignOut}
            sidebarFooter={sidebarFooter}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Main Column */}
      <div className="flex min-h-screen flex-col lg:pl-64">
        {/* Top White Header Bar */}
        <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[#E2E8F0] bg-white px-4 sm:px-6 lg:px-8 shadow-xs">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="lg:hidden text-[#202936] hover:bg-[#EEF1F5] rounded-xl"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
            >
              <Menu className="size-5 text-[#202936]" />
            </Button>

            <div className="flex min-w-0 items-center gap-2.5">
              <div className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-[#123B5A]/10 text-[#123B5A] sm:flex">
                <Building2 className="size-4" />
              </div>
              <span className="truncate text-[15px] font-bold text-[#202936]">
                {institutionName}
              </span>
              <Badge
                variant="outline"
                className="hidden rounded-full border-[#F5A000]/40 bg-amber-50 font-sans text-[11px] font-bold text-[#F5A000] sm:inline-flex"
              >
                Active Teacher
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
                className="h-9 gap-1.5 border-[#E5E9EF] bg-white text-[13px] font-semibold text-[#202936] rounded-xl hover:bg-[#EEF1F5]/50 focus:ring-[#F5A000]"
              >
                <Calendar className="size-3.5 text-[#788391]" />
                <span className="hidden text-[#788391] md:inline">
                  AY
                </span>
                <SelectValue placeholder="Academic Year" />
              </SelectTrigger>
              <SelectContent align="end" className="rounded-xl border-[#E5E9EF] bg-white">
                {academicYears.map((year) => (
                  <SelectItem key={year} value={year} className="text-[13px] font-medium text-[#202936] focus:bg-[#EEF1F5] focus:text-[#202936]">
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Notification Bell / Dropdown */}
            {notificationElement ? (
              notificationElement
            ) : (
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
                className="relative rounded-xl border-[#E5E9EF] bg-white text-[#788391] hover:text-[#202936] hover:bg-[#EEF1F5]"
              >
                <Bell className="size-4" />
                {notificationCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#F5A000] px-1 text-[10px] font-bold text-white shadow-xs">
                    {notificationCount > 99 ? "99+" : notificationCount}
                  </span>
                )}
              </Button>
            )}

            {/* User Profile Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-9 gap-2 rounded-xl px-2 hover:bg-[#EEF1F5]"
                >
                  <Avatar size="sm" className="ring-1 ring-[#E5E9EF]">
                    {user.avatarUrl && (
                      <AvatarImage src={user.avatarUrl} alt={user.name} />
                    )}
                    <AvatarFallback className="bg-[#123B5A] text-white font-bold text-xs">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left md:block">
                    <p className="text-[13px] leading-tight font-bold text-[#202936]">
                      {user.name}
                    </p>
                    {user.role && (
                      <p className="text-[11px] leading-tight text-[#788391]">
                        {user.role}
                      </p>
                    )}
                  </div>
                  <ChevronDown className="hidden size-3.5 text-[#788391] md:block" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl border-[#E5E9EF] bg-white shadow-md">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm font-bold text-[#202936]">
                      {user.name}
                    </p>
                    {user.email && (
                      <p className="truncate text-xs text-[#788391]">
                        {user.email}
                      </p>
                    )}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-[#E5E9EF]" />
                {profileHref ? (
                  <DropdownMenuItem asChild className="focus:bg-[#EEF1F5] focus:text-[#202936]">
                    <Link href={profileHref}>
                      <User className="size-4 text-[#788391]" />
                      My Profile
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="focus:bg-[#EEF1F5] focus:text-[#202936]">
                    <User className="size-4 text-[#788391]" />
                    My Profile
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem className="focus:bg-[#EEF1F5] focus:text-[#202936]">
                  <Settings className="size-4 text-[#788391]" />
                  Preferences
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[#E5E9EF]" />
                <DropdownMenuItem variant="destructive" onClick={onSignOut}>
                  <LogOut className="size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Main Content Area (#EEF1F5 canvas) */}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-6 lg:p-8 space-y-6">
          {children}
        </main>
      </div>
    </div>
  )
}
