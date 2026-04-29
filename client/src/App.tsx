import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { SignIn, useAuth } from "@clerk/react";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Ledger from "./pages/Ledger";
import FixedExpenses from "./pages/FixedExpenses";
import StockPortfolio from "./pages/StockPortfolio";
import Savings from "./pages/Savings";
import Pension from "./pages/Pension";
import OtherAssets from "./pages/OtherAssets";
import RealEstate from "./pages/RealEstate";
import BlogCampaigns from "./pages/BlogCampaigns";
import Cards from "./pages/Cards";
import Subscriptions from "./pages/Subscriptions";
import SideIncome from "./pages/SideIncome";
import Installments from "./pages/Installments";
import Insurance from "./pages/Insurance";
import BusinessIncome from "./pages/BusinessIncome";
import Categories from "./pages/Categories";
import Profile from "./pages/Profile";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/ledger" component={Ledger} />
        <Route path="/fixed-expenses" component={FixedExpenses} />
        <Route path="/stocks" component={StockPortfolio} />
        <Route path="/savings" component={Savings} />
        <Route path="/pension" component={Pension} />
        <Route path="/other-assets" component={OtherAssets} />
        <Route path="/real-estate" component={RealEstate} />
        <Route path="/blog-campaigns" component={BlogCampaigns} />
        <Route path="/cards" component={Cards} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/side-income" component={SideIncome} />
        <Route path="/installments" component={Installments} />
        <Route path="/insurance" component={Insurance} />
        <Route path="/business-income" component={BusinessIncome} />
        <Route path="/categories" component={Categories} />
        <Route path="/profile" component={Profile} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function AuthGate() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <div className="flex items-center justify-center h-screen text-muted-foreground">로딩 중...</div>;
  if (!isSignedIn) return (
    <div className="flex items-center justify-center h-screen bg-background">
      <SignIn routing="hash" />
    </div>
  );
  return <Router />;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <AuthGate />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
