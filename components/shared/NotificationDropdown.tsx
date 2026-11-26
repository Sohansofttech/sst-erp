"use client";

import React, { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck } from "lucide-react";
import { Badge } from "./Badge";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationDropdownProps {
  className?: string;
  buttonClassName?: string;
}

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
  className = "",
  buttonClassName = "",
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/shared/notifications");
      const json = await res.json();
      if (json.success && json.data) {
        setNotifications(json.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications();
    }
  };

  const markRead = async (id: string) => {
    try {
      await fetch("/api/shared/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationRecipientId: id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/shared/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error(err);
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const getCategoryBadge = (category: string) => {
    const cat = (category || "").toUpperCase();
    switch (cat) {
      case "FEE":
        return <Badge variant="warning" size="sm">Fee</Badge>;
      case "EXAMINATION":
      case "EXAM":
        return <Badge variant="error" size="sm">Exam</Badge>;
      case "ACADEMIC":
        return <Badge variant="info" size="sm">Academic</Badge>;
      case "EVENT":
        return <Badge variant="success" size="sm">Event</Badge>;
      default:
        return <Badge variant="brand" size="sm">Notice</Badge>;
    }
  };

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={handleToggle}
        className={
          buttonClassName ||
          "relative p-2 text-[#64748B] hover:text-[#1E293B] hover:bg-[#F1F5F9] rounded-lg transition-colors focus:outline-none cursor-pointer"
        }
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-controls="notification-dropdown-panel"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-[#DC2626] text-[10px] font-bold text-white ring-2 ring-white shadow-xs">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          id="notification-dropdown-panel"
          role="region"
          aria-label="Notifications List"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl bg-white shadow-xl border border-[#E2E8F0] z-50 overflow-hidden animate-in fade-in-50 duration-150"
        >
          <div className="px-4 py-3 border-b border-[#E2E8F0] bg-[#EEF1F5] flex items-center justify-between">
            <div>
              <h4 className="text-[14px] font-semibold text-[#1E293B]">
                Notifications
              </h4>
              <span className="text-[11px] text-[#64748B]">
                {unreadCount} unread
              </span>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="inline-flex items-center gap-1 text-[11px] text-[#123B5A] hover:text-[#0F2F48] font-semibold hover:underline cursor-pointer"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-[#E2E8F0]">
            {loading ? (
              <div className="p-6 text-center text-xs text-[#64748B]">
                Loading notifications...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-[#64748B]">
                No notifications to display.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 hover:bg-[#EEF1F5] transition-colors ${
                    !item.isRead ? "bg-[#FFFBEB]/40" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {getCategoryBadge(item.category)}
                        <span className="text-[13px] font-semibold text-[#202936] truncate">
                          {item.title}
                        </span>
                      </div>
                      <p className="text-xs text-[#788391] leading-relaxed break-words">
                        {item.message}
                      </p>
                      <span className="text-[11px] text-[#94A3B8] mt-1.5 block">
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {!item.isRead && (
                      <button
                        onClick={() => markRead(item.id)}
                        title="Mark as read"
                        className="p-1 text-[#788391] hover:text-[#16A34A] rounded transition-colors shrink-0 cursor-pointer"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
