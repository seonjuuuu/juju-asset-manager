import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import SignInPage from "@/pages/SignIn";
import SignUpPage from "@/pages/SignUp";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthSessionProvider } from "./contexts/AuthSessionContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import DashboardLayout from "./components/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Ledger from "./pages/Ledger";
import PaymentCalendar from "./pages/PaymentCalendar";
import FixedExpenses from "./pages/FixedExpenses";
import StockPortfolio from "./pages/StockPortfolio";
import Savings from "./pages/Savings";
import Pension from "./pages/Pension";
import OtherAssets from "./pages/OtherAssets";
import RealEstate from "./pages/RealEstate";
import RealEstateFundPlan from "./pages/RealEstateFundPlan";
import RealEstateFinalBudget from "./pages/RealEstateFinalBudget";
import BlogCampaigns from "./pages/BlogCampaigns";
import WeddingBudget from "./pages/WeddingBudget";
import Cards from "./pages/Cards";
import Subscriptions from "./pages/Subscriptions";
import SideIncome from "./pages/SideIncome";
import Installments from "./pages/Installments";
import Loans from "./pages/Loans";
import Insurance from "./pages/Insurance";
import BusinessIncome from "./pages/BusinessIncome";
import LaborCosts from "./pages/LaborCosts";
import Categories from "./pages/Categories";
import Profile from "./pages/Profile";
import FeatureRequests from "./pages/FeatureRequests";

function Router() {
  return (
    <Switch>
      <Route path="/sign-in" component={SignInPage} />
      <Route path="/sign-in/:rest*" component={SignInPage} />
      <Route path="/sign-up" component={SignUpPage} />
      <Route path="/sign-up/:rest*" component={SignUpPage} />
      <Route>
        <DashboardLayout>
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/ledger" component={Ledger} />
            <Route path="/payment-calendar" component={PaymentCalendar} />
            <Route path="/fixed-expenses" component={FixedExpenses} />
            <Route path="/stocks" component={StockPortfolio} />
            <Route path="/savings" component={Savings} />
            <Route path="/pension" component={Pension} />
            <Route path="/other-assets" component={OtherAssets} />
            <Route path="/real-estate" component={RealEstate} />
            <Route path="/real-estate/fund-plan" component={RealEstateFundPlan} />
            <Route path="/real-estate/final-budget" component={RealEstateFinalBudget} />
            <Route path="/blog-campaigns" component={BlogCampaigns} />
            <Route path="/wedding-budget" component={WeddingBudget} />
            <Route path="/cards" component={Cards} />
            <Route path="/subscriptions" component={Subscriptions} />
            <Route path="/side-income" component={SideIncome} />
            <Route path="/installments" component={Installments} />
            <Route path="/loans" component={Loans} />
            <Route path="/insurance" component={Insurance} />
            <Route path="/business-income" component={BusinessIncome} />
            <Route path="/labor-costs" component={LaborCosts} />
            <Route path="/categories" component={Categories} />
            <Route path="/feature-requests" component={FeatureRequests} />
            <Route path="/profile" component={Profile} />
            <Route path="/404" component={NotFound} />
            <Route component={NotFound} />
          </Switch>
        </DashboardLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthSessionProvider>
        <ThemeProvider defaultTheme="light">
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </ThemeProvider>
      </AuthSessionProvider>
    </ErrorBoundary>
  );
}

export default App;
