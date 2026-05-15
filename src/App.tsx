import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Admin from "./pages/Admin.tsx";
import About from "./pages/About.tsx";
import Profile from "./pages/Profile.tsx";
import DraftDetail from "./pages/DraftDetail.tsx";
import UserProfile from "./pages/UserProfile.tsx";
import Notifications from "./pages/Notifications.tsx";
import Bookmarks from "./pages/Bookmarks.tsx";
import Search from "./pages/Search.tsx";
import Settings from "./pages/Settings.tsx";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/hooks/useTheme";
import { useFont } from "@/hooks/useFont";
import { ComposeProvider, useCompose } from "@/hooks/useCompose";
import ComposeModal from "@/components/feed/ComposeModal";

/** Applies saved font preference on every load. */
function FontInit() { useFont(); return null; }

/** Renders the global compose modal — floats on any page. */
function ComposePortal() {
  const { isOpen, savedDraft, close, publish } = useCompose();
  if (!isOpen) return null;
  return (
    <ComposeModal
      onPublish={publish}
      onClose={close}
      initialBody={savedDraft?.body}
      initialTitle={savedDraft?.title}
    />
  );
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <ThemeProvider>
          <FontInit />
          <AuthProvider>
            <ComposeProvider>
              <Routes>
                {/* Core */}
                <Route path="/"             element={<Index />} />
                <Route path="/auth"         element={<Auth />} />
                <Route path="/onboarding"   element={<Onboarding />} />

                {/* App sections */}
                <Route path="/notifications" element={<Notifications />} />
                <Route path="/bookmarks"     element={<Bookmarks />} />
                <Route path="/search"        element={<Search />} />
                <Route path="/settings"      element={<Settings />} />

                {/* Individual draft */}
                <Route path="/drafts/:id"   element={<DraftDetail />} />

                {/* Admin / misc */}
                <Route path="/admin"        element={<Admin />} />
                <Route path="/about"        element={<About />} />

                {/* Edit own profile */}
                <Route path="/profile"      element={<Profile />} />

                {/* Public user profiles — MUST be last named route */}
                <Route path="/:handle"      element={<UserProfile />} />

                <Route path="*"             element={<NotFound />} />
              </Routes>

              {/* Global compose modal — floats above any page */}
              <ComposePortal />
            </ComposeProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
