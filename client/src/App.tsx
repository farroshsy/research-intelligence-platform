import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Changes from "./pages/Changes";
import Home from "./pages/Home";
import Guide from "./pages/Guide";
import Intelligence from "./pages/Intelligence";
import Missions from "./pages/Missions";
import NotificationPreferences from "./pages/NotificationPreferences";
import Notifications from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import Operations from "./pages/Operations";
import Reports from "./pages/Reports";
import Sources from "./pages/Sources";

function Router() { return <DashboardLayout><Switch><Route path="/" component={Home} /><Route path="/guide" component={Guide} /><Route path="/missions" component={Missions} /><Route path="/sources" component={Sources} /><Route path="/changes" component={Changes} /><Route path="/intelligence" component={Intelligence} /><Route path="/operations" component={Operations} /><Route path="/reports" component={Reports} /><Route path="/notifications" component={Notifications} /><Route path="/notification-preferences" component={NotificationPreferences} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></DashboardLayout>; }
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="system" switchable><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
