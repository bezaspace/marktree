import { useState, useEffect, useCallback } from "react";

interface NotificationItem {
  id: string;
  userId: string;
  type: "comment" | "mention" | "document_shared" | "version_restored";
  content: string;
  read: boolean;
  relatedDocumentId: string | null;
  relatedCommentId: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/notifications?limit=20", { credentials: "include" });
    if (res.ok) {
      setNotifications(await res.json());
    }
    setLoading(false);
  }, []);

  const fetchUnreadCount = useCallback(async () => {
    const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setUnreadCount(data.count);
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // poll every 30s
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  useEffect(() => {
    if (open) {
      fetchNotifications();
      fetchUnreadCount();
    }
  }, [open, fetchNotifications, fetchUnreadCount]);

  async function markAsRead(id: string) {
    await fetch(`/api/notifications/${id}/read`, {
      method: "POST",
      credentials: "include",
    });
    fetchNotifications();
    fetchUnreadCount();
  }

  async function markAllAsRead() {
    await fetch("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
    });
    fetchNotifications();
    fetchUnreadCount();
  }

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded hover:bg-gray-100 transition-colors"
        title="Notifications"
      >
        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-1 w-80 bg-white border rounded-lg shadow-lg z-50 overflow-hidden">
            <div className="px-4 py-2 border-b flex items-center justify-between bg-gray-50">
              <h3 className="font-semibold text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading ? (
                <p className="text-gray-500 text-sm text-center py-4">Loading...</p>
              ) : notifications.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-6">No notifications</p>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={`px-4 py-2.5 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer text-sm ${
                      n.read ? "opacity-60" : "bg-blue-50/30"
                    }`}
                    onClick={() => !n.read && markAsRead(n.id)}
                  >
                    <div className="flex items-start gap-2">
                      <div
                        className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${
                          n.read ? "bg-gray-300" : "bg-blue-500"
                        }`}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-gray-700 text-xs leading-relaxed">{n.content}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(n.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
