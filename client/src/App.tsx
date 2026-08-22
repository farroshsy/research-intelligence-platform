import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Changes from "./pages/Changes";
import Home from "./pages/Home";
import Intelligence from "./pages/Intelligence";
import NotFound from "./pages/NotFound";
import Operations from "./pages/Operations";
import Reports from "./pages/Reports";
import Sources from "./pages/Sources";

function Router() { return <DashboardLayout><Switch><Route path="/" component={Home} /><Route path="/sources" component={Sources} /><Route path="/changes" component={Changes} /><Route path="/intelligence" component={Intelligence} /><Route path="/operations" component={Operations} /><Route path="/reports" component={Reports} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></DashboardLayout>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="system" switchable><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
