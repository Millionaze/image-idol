import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/AppLayout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Warmup from "@/pages/Warmup";
import Accounts from "@/pages/Accounts";
import Campaigns from "@/pages/Campaigns";
import InboxPage from "@/pages/Inbox";
import Settings from "@/pages/Settings";
import Analytics from "@/pages/Analytics";
import Unibox from "@/pages/Unibox";
import Contacts from "@/pages/Contacts";
import NotFound from "@/pages/NotFound";
import ListCleaner from "@/pages/tools/ListCleaner";
import CopyWriter from "@/pages/tools/CopyWriter";
import SubjectTester from "@/pages/tools/SubjectTester";
import SendPlanner from "@/pages/tools/SendPlanner";
import AuditReport from "@/pages/tools/AuditReport";
import Spintax from "@/pages/tools/Spintax";
import WorkflowsDebug from "@/pages/admin/WorkflowsDebug";
import Workflows from "@/pages/Workflows";
import Pipeline from "@/pages/Pipeline";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/warmup" element={<Warmup />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/campaigns" element={<Campaigns />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/unibox" element={<Unibox />} />
              <Route path="/inbox" element={<InboxPage />} />
              <Route path="/contacts" element={<Contacts />} />
              <Route path="/workflows" element={<Workflows />} />
              <Route path="/workflows/:id" element={<Workflows />} />
              <Route path="/pipeline" element={<Pipeline />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/tools/list-cleaner" element={<ListCleaner />} />
              <Route path="/tools/copy-writer" element={<CopyWriter />} />
              <Route path="/tools/subject-tester" element={<SubjectTester />} />
              <Route path="/tools/send-planner" element={<SendPlanner />} />
              <Route path="/tools/audit-report" element={<AuditReport />} />
              <Route path="/tools/spintax" element={<Spintax />} />
              <Route path="/admin/workflows-debug" element={<WorkflowsDebug />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
