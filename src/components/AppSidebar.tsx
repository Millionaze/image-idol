import { Flame, LayoutDashboard, Zap, Mail, Megaphone, Inbox, LogOut, Settings, BarChart3, Mail as MailIcon, Filter, PenLine, Target, CalendarDays, ClipboardCheck, Shuffle, Users } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";

const mainItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Warmup", url: "/warmup", icon: Zap },
  { title: "Accounts", url: "/accounts", icon: Mail },
  { title: "Campaigns", url: "/campaigns", icon: Megaphone },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Unibox", url: "/unibox", icon: Inbox },
  { title: "Inbox", url: "/inbox", icon: MailIcon },
  { title: "Contacts", url: "/contacts", icon: Users },
];

const toolItems = [
  { title: "List Cleaner", url: "/tools/list-cleaner", icon: Filter },
  { title: "Copy Writer", url: "/tools/copy-writer", icon: PenLine },
  { title: "Subject Tester", url: "/tools/subject-tester", icon: Target },
  { title: "Send Planner", url: "/tools/send-planner", icon: CalendarDays },
  { title: "Audit Report", url: "/tools/audit-report", icon: ClipboardCheck },
  { title: "Spintax", url: "/tools/spintax", icon: Shuffle },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { signOut } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const loadUnread = async () => {
      try {
        const { count } = await supabase
          .from("inbox_messages")
          .select("*", { count: "exact", head: true })
          .eq("is_read", false)
          .eq("is_warmup", false);
        setUnreadCount(count || 0);
      } catch { /* silent */ }
    };
    loadUnread();
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  const renderNavItem = (item: typeof mainItems[0]) => (
    <SidebarMenuItem key={item.title}>
      <SidebarMenuButton asChild>
        <NavLink
          to={item.url}
          end={item.url === "/"}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          activeClassName="bg-sidebar-accent text-primary font-medium"
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {!collapsed && (
            <span className="flex items-center gap-2">
              {item.title}
              {item.title === "Unibox" && unreadCount > 0 && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0 h-4 min-w-[18px] flex items-center justify-center">
                  {unreadCount}
                </Badge>
              )}
            </span>
          )}
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <div className="flex h-14 items-center gap-2 px-4 border-b border-sidebar-border">
        <Flame className="h-6 w-6 shrink-0 text-primary" />
        {!collapsed && (
          <span className="text-lg font-bold tracking-tight">
            Pixel<span className="text-primary"> Growth</span>
          </span>
        )}
      </div>
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <div className="px-4 py-2">
          <Separator className="bg-sidebar-border" />
        </div>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground px-3">
            Tools
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {toolItems.map(renderNavItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <NavLink
                to="/settings"
                className="flex items-center gap-3 text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors rounded-md px-3 py-2"
                activeClassName="bg-sidebar-accent text-primary font-medium"
              >
                <Settings className="h-4 w-4 shrink-0" />
                {!collapsed && <span>Settings</span>}
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={signOut} className="flex items-center gap-3 text-sm text-muted-foreground hover:text-foreground cursor-pointer">
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span>Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
