import { useAuth, useUser, useClerk } from "@clerk/react";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Coins,
  LogOut,
  PiggyBank,
  Shield,
  Star,
  TrendingUp,
  Wallet,
  Home,
  RefreshCw,
  ArrowUpCircle,
  Landmark,
  Tags,
  ShieldCheck,
  UserCircle,
  BriefcaseBusiness,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const navItems = [
  { href: "/", icon: Home, label: "대시보드" },
  { href: "/ledger", icon: BookOpen, label: "월별 가계부" },
  { href: "/fixed-expenses", icon: Wallet, label: "고정지출" },
  { href: "/stocks", icon: TrendingUp, label: "주식 포트폴리오" },
  { href: "/savings", icon: PiggyBank, label: "저축 및 현금성" },
  { href: "/pension", icon: Shield, label: "연금" },
  { href: "/other-assets", icon: Coins, label: "기타 자산" },
  { href: "/subscriptions", icon: RefreshCw, label: "구독결제" },
  { href: "/side-income", icon: ArrowUpCircle, label: "부수입" },
  { href: "/installments", icon: Landmark, label: "대출/할부" },
  { href: "/insurance", icon: ShieldCheck, label: "보험" },
];

const recordItems = [
  { href: "/real-estate", icon: Building2, label: "부동산" },
  { href: "/blog-campaigns", icon: Star, label: "블로그 체험단" },
  { href: "/business-income", icon: BriefcaseBusiness, label: "사업소득" },
];

const businessSubItems = [
  { href: "/labor-costs", icon: Users, label: "인건비" },
];

const settingItems = [
  { href: "/cards", icon: CreditCard, label: "보유카드/계좌" },
  { href: "/categories", icon: Tags, label: "카테고리 관리" },
  { href: "/profile", icon: UserCircle, label: "내 정보" },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { isLoaded } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [collapsed, setCollapsed] = useState(false);
  const businessExpanded = location === "/business-income" || businessSubItems.some(i => location === i.href);

  const renderSection = (label: string, items: typeof navItems) => (
    <div className="pt-2">
      <div className="px-2.5 pb-1" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        {!collapsed && (
          <p className="text-xs font-semibold pt-2 pb-0.5" style={{ opacity: 0.4, letterSpacing: "0.05em" }}>
            {label}
          </p>
        )}
      </div>
      {items.map((item) => {
        const isActive = location === item.href;
        const isBusinessIncome = item.href === "/business-income";
        return (
          <div key={item.href}>
            <Link href={item.href}>
              <div
                className={cn(
                  "flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 text-sm font-medium",
                  collapsed ? "justify-center" : ""
                )}
                style={{
                  backgroundColor: isActive ? "var(--sidebar-accent)" : "transparent",
                  color: isActive ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
                  opacity: isActive ? 1 : 0.72,
                }}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>
            </Link>
            {isBusinessIncome && businessExpanded && !collapsed && (
              <div className="ml-3 pl-3 border-l border-border/60">
                {businessSubItems.map(sub => {
                  const isSubActive = location === sub.href;
                  return (
                    <Link key={sub.href} href={sub.href}>
                      <div
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all duration-150 text-xs font-medium"
                        style={{
                          backgroundColor: isSubActive ? "var(--sidebar-accent)" : "transparent",
                          color: isSubActive ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
                          opacity: isSubActive ? 1 : 0.65,
                        }}
                      >
                        <sub.icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className="truncate">{sub.label}</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col transition-all duration-300 ease-in-out flex-shrink-0",
          collapsed ? "w-[60px]" : "w-[220px]"
        )}
        style={{
          backgroundColor: "var(--sidebar)",
          color: "var(--sidebar-foreground)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        {/* Logo */}
        <div
          className={cn(
            "flex items-center h-14 px-3 flex-shrink-0",
            collapsed ? "justify-center" : "justify-between"
          )}
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="font-bold text-sm truncate"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Monelio
              </span>
            </div>
          )}
          {collapsed && (
            <span className="font-bold text-sm" style={{ fontFamily: "'Playfair Display', serif" }}>M</span>
          )}
          {!collapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1 rounded-md transition-colors flex-shrink-0"
              style={{ color: "var(--sidebar-foreground)", opacity: 0.6 }}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 text-sm font-medium",
                    collapsed ? "justify-center" : ""
                  )}
                  style={{
                    backgroundColor: isActive ? "var(--sidebar-accent)" : "transparent",
                    color: isActive ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
                    opacity: isActive ? 1 : 0.72,
                  }}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </div>
              </Link>
            );
          })}
          {renderSection("기록", recordItems)}
          {renderSection("설정", settingItems)}
        </nav>

        {/* Bottom */}
        <div
          className="p-2 space-y-1 flex-shrink-0"
          style={{ borderTop: "1px solid var(--sidebar-border)" }}
        >
          {collapsed ? (
            <button
              onClick={() => setCollapsed(false)}
              className="w-full flex items-center justify-center p-2 rounded-lg transition-colors"
              style={{ color: "var(--sidebar-foreground)", opacity: 0.6 }}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <>
              <div className="flex items-center gap-2.5 px-2.5 py-1.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    backgroundColor: "var(--sidebar-primary)",
                    color: "var(--sidebar-primary-foreground)",
                  }}
                >
                  {user?.firstName?.[0] ?? user?.emailAddresses?.[0]?.emailAddress?.[0] ?? "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{user?.firstName ?? "사용자"}</p>
                  <p className="text-xs truncate" style={{ opacity: 0.5 }}>
                    {user?.emailAddresses?.[0]?.emailAddress ?? ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => signOut()}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-xs"
                style={{ color: "var(--sidebar-foreground)", opacity: 0.6 }}
              >
                <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
                <span>로그아웃</span>
              </button>
            </>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
