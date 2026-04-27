import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  BookOpen,
  Building2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Coins,
  LogIn,
  LogOut,
  PiggyBank,
  Shield,
  Star,
  TrendingUp,
  Wallet,
  Home,
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
  { href: "/real-estate", icon: Building2, label: "부동산" },
  { href: "/blog-campaigns", icon: Star, label: "블로그 체험단" },
  { href: "/cards", icon: CreditCard, label: "보유카드" },
];

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">로딩 중...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-6 max-w-sm mx-auto px-6">
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663399785344/NNNgtb3Z4keER7ESAY7Eaj/monelio-logo-gold-66xeFmKPQdsqm8Tgcg76ZU.webp" alt="Monelio" className="w-12 h-12 object-contain" />
            </div>
            <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "'Playfair Display', serif" }}>
              Monelio
            </h1>
            <p className="text-sm text-muted-foreground">
              개인 재무를 한눈에 관리하세요
            </p>
          </div>
          <a
            href={getLoginUrl()}
            className="flex items-center justify-center gap-2 w-full py-3 px-6 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
          >
            <LogIn className="w-4 h-4" />
            로그인하여 시작하기
          </a>
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
              <img
                src="https://d2xsxph8kpxj0f.cloudfront.net/310519663399785344/NNNgtb3Z4keER7ESAY7Eaj/monelio-logo-gold-66xeFmKPQdsqm8Tgcg76ZU.webp"
                alt="Monelio"
                className="w-8 h-8 object-contain flex-shrink-0"
                
              />
              <span
                className="font-bold text-sm truncate"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                Monelio
              </span>
            </div>
          )}
          {collapsed && (
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663399785344/NNNgtb3Z4keER7ESAY7Eaj/monelio-logo-gold-66xeFmKPQdsqm8Tgcg76ZU.webp"
              alt="M"
              className="w-8 h-8 object-contain"
              
            />
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
                    color: isActive
                      ? "var(--sidebar-primary)"
                      : "var(--sidebar-foreground)",
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
                  {user?.name?.[0] ?? "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{user?.name ?? "사용자"}</p>
                  <p className="text-xs truncate" style={{ opacity: 0.5 }}>
                    {user?.email ?? ""}
                  </p>
                </div>
              </div>
              <button
                onClick={() => logout()}
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
        {children}
      </main>
    </div>
  );
}
