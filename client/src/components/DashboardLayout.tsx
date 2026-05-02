import { useAuthSession } from "@/contexts/AuthSessionContext";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Calculator,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Coins,
  LogOut,
  Menu,
  PiggyBank,
  Shield,
  Star,
  TrendingUp,
  Wallet,
  Home,
  HeartHandshake,
  RefreshCw,
  ArrowUpCircle,
  Landmark,
  Tags,
  ShieldCheck,
  UserCircle,
  BriefcaseBusiness,
  Users,
  X,
  ClipboardCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";

const navItems = [
  { href: "/", icon: Home, label: "대시보드" },
  { href: "/ledger", icon: BookOpen, label: "월별 가계부" },
  { href: "/payment-calendar", icon: CalendarDays, label: "결제 예정" },
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
  { href: "/wedding-budget", icon: HeartHandshake, label: "결혼예산" },
  { href: "/business-income", icon: BriefcaseBusiness, label: "사업소득" },
];

const realEstateSubItems = [
  { href: "/real-estate/fund-plan", icon: Calculator, label: "가용 자금 계획서" },
  { href: "/real-estate/final-budget", icon: ClipboardCheck, label: "최종예산확정서" },
];

const businessSubItems = [
  { href: "/labor-costs", icon: Users, label: "인건비" },
];

const debtSubItems = [
  { href: "/installments", icon: CreditCard, label: "할부" },
  { href: "/loans", icon: Landmark, label: "대출" },
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
  const [location, setLocation] = useLocation();
  const { session, user, isReady, signOut } = useAuthSession();
  const isSignedIn = !!session;
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const realEstateExpanded = location === "/real-estate" || realEstateSubItems.some(i => location === i.href);
  const businessExpanded = location === "/business-income" || businessSubItems.some(i => location === i.href);
  const debtExpanded = location === "/installments" || debtSubItems.some(i => location === i.href);

  // 페이지 이동 시 모바일 메뉴 닫기
  useEffect(() => { setMobileOpen(false); }, [location]);

  useEffect(() => {
    if (isReady && !isSignedIn) {
      setLocation("/sign-in", { replace: true });
    }
  }, [isReady, isSignedIn, setLocation]);

  const handleSignOut = async () => {
    await signOut();
    setLocation("/sign-in", { replace: true });
  };

  const renderNavItem = (item: typeof navItems[number], opts?: { collapsed?: boolean; onClick?: () => void }) => {
    const isActive = location === item.href;
    const isCollapsed = opts?.collapsed ?? false;
    const isRealEstate = item.href === "/real-estate";
    const isBusinessIncome = item.href === "/business-income";
    const isDebt = item.href === "/installments";
    const itemActive = isDebt ? debtExpanded : isRealEstate ? realEstateExpanded : isActive;
    return (
      <div key={item.href}>
        <Link href={item.href} onClick={opts?.onClick}>
          <div
            className={cn(
              "flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-150 text-sm font-medium",
              isCollapsed ? "justify-center" : ""
            )}
            style={{
              backgroundColor: itemActive ? "var(--sidebar-accent)" : "transparent",
              color: itemActive ? "var(--sidebar-primary)" : "var(--sidebar-foreground)",
              opacity: itemActive ? 1 : 0.72,
            }}
            title={isCollapsed ? item.label : undefined}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {!isCollapsed && <span className="truncate">{item.label}</span>}
          </div>
        </Link>
        {isRealEstate && realEstateExpanded && !isCollapsed && (
          <div className="ml-3 pl-3 border-l border-border/60">
            {realEstateSubItems.map(sub => {
              const isSubActive = location === sub.href;
              return (
                <Link key={sub.href} href={sub.href} onClick={opts?.onClick}>
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
        {isBusinessIncome && businessExpanded && !isCollapsed && (
          <div className="ml-3 pl-3 border-l border-border/60">
            {businessSubItems.map(sub => {
              const isSubActive = location === sub.href;
              return (
                <Link key={sub.href} href={sub.href} onClick={opts?.onClick}>
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
        {isDebt && debtExpanded && !isCollapsed && (
          <div className="ml-3 pl-3 border-l border-border/60">
            {debtSubItems.map(sub => {
              const isSubActive = location === sub.href;
              return (
                <Link key={sub.href} href={sub.href} onClick={opts?.onClick}>
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
  };

  const renderSection = (label: string, items: typeof navItems, opts?: { collapsed?: boolean; onClick?: () => void }) => (
    <div className="pt-2">
      <div className="px-2.5 pb-1" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
        {!opts?.collapsed && (
          <p className="text-xs font-semibold pt-2 pb-0.5" style={{ opacity: 0.4, letterSpacing: "0.05em" }}>
            {label}
          </p>
        )}
      </div>
      {items.map(item => renderNavItem(item, opts))}
    </div>
  );

  const renderBottom = (opts?: { onClick?: () => void }) => (
    <div className="p-2 space-y-1 flex-shrink-0" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
      <div className="flex items-center gap-2.5 px-2.5 py-1.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
          style={{ backgroundColor: "var(--sidebar-primary)", color: "var(--sidebar-primary-foreground)" }}
        >
          {(user?.user_metadata?.full_name as string | undefined)?.[0] ?? user?.email?.[0] ?? "U"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium truncate">
            {(user?.user_metadata?.full_name as string | undefined)?.trim() || user?.email?.split("@")[0] || "사용자"}
          </p>
          <p className="text-xs truncate" style={{ opacity: 0.5 }}>
            {user?.email ?? ""}
          </p>
        </div>
      </div>
      <button
        onClick={handleSignOut}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors text-xs"
        style={{ color: "var(--sidebar-foreground)", opacity: 0.6 }}
      >
        <LogOut className="w-3.5 h-3.5 flex-shrink-0" />
        <span>로그아웃</span>
      </button>
    </div>
  );

  if (!isReady || !isSignedIn) {
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

      {/* ── 모바일 오버레이 드로어 ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside
            className="absolute left-0 top-0 bottom-0 w-72 flex flex-col overflow-hidden"
            style={{ backgroundColor: "var(--sidebar)", color: "var(--sidebar-foreground)" }}
          >
            <div
              className="flex items-center justify-between h-14 px-4 flex-shrink-0"
              style={{ borderBottom: "1px solid var(--sidebar-border)" }}
            >
              <span className="font-bold text-sm" style={{ fontFamily: "'Playfair Display', serif" }}>Monelio</span>
              <button onClick={() => setMobileOpen(false)} className="p-1 rounded-md" style={{ color: "var(--sidebar-foreground)", opacity: 0.6 }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
              {navItems.map(item => renderNavItem(item, { onClick: () => setMobileOpen(false) }))}
              {renderSection("기록", recordItems, { onClick: () => setMobileOpen(false) })}
              {renderSection("설정", settingItems, { onClick: () => setMobileOpen(false) })}
            </nav>
            {renderBottom()}
          </aside>
        </div>
      )}

      {/* ── 데스크탑 사이드바 ── */}
      <aside
        className={cn(
          "hidden lg:flex flex-col transition-all duration-300 ease-in-out flex-shrink-0",
          collapsed ? "w-[60px]" : "w-[220px]"
        )}
        style={{
          backgroundColor: "var(--sidebar)",
          color: "var(--sidebar-foreground)",
          borderRight: "1px solid var(--sidebar-border)",
        }}
      >
        <div
          className={cn("flex items-center h-14 px-3 flex-shrink-0", collapsed ? "justify-center" : "justify-between")}
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-sm truncate" style={{ fontFamily: "'Playfair Display', serif" }}>Monelio</span>
            </div>
          )}
          {collapsed && <span className="font-bold text-sm" style={{ fontFamily: "'Playfair Display', serif" }}>M</span>}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="p-1 rounded-md transition-colors flex-shrink-0" style={{ color: "var(--sidebar-foreground)", opacity: 0.6 }}>
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          {navItems.map(item => renderNavItem(item, { collapsed }))}
          {renderSection("기록", recordItems, { collapsed })}
          {renderSection("설정", settingItems, { collapsed })}
        </nav>

        <div className="p-2 space-y-1 flex-shrink-0" style={{ borderTop: "1px solid var(--sidebar-border)" }}>
          {collapsed ? (
            <>
              <button
                onClick={() => setCollapsed(false)}
                className="w-full flex items-center justify-center p-2 rounded-lg transition-colors"
                style={{ color: "var(--sidebar-foreground)", opacity: 0.6 }}
                title="사이드바 펼치기"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center justify-center p-2 rounded-lg transition-colors"
                style={{ color: "var(--sidebar-foreground)", opacity: 0.6 }}
                title="로그아웃"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : renderBottom()}
        </div>
      </aside>

      {/* ── 메인 콘텐츠 ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* 모바일 상단 헤더 */}
        <header
          className="lg:hidden flex items-center justify-between h-14 px-4 flex-shrink-0 bg-background"
          style={{ borderBottom: "1px solid var(--sidebar-border)" }}
        >
          <button onClick={() => setMobileOpen(true)} className="p-1.5 rounded-md -ml-1" style={{ color: "var(--sidebar-foreground)" }}>
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-bold text-sm" style={{ fontFamily: "'Playfair Display', serif" }}>Monelio</span>
          <div className="w-8" />
        </header>

        <main className="flex-1 overflow-y-auto bg-background">
          <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 md:space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
