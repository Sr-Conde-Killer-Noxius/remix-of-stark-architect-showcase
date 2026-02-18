import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";

// Lazy-loaded pages
const Index = lazy(() => import("./pages/Index"));
const SobreCreditos = lazy(() => import("./pages/SobreCreditos"));
const Planos = lazy(() => import("./pages/Planos"));
const Profile = lazy(() => import("./pages/Profile"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Revendas = lazy(() => import("./pages/Revendas"));
const Carteira = lazy(() => import("./pages/Carteira"));
const Templates = lazy(() => import("./pages/Templates"));
const Webhooks = lazy(() => import("./pages/Webhooks"));
const WhatsAppConnection = lazy(() => import("./pages/WhatsAppConnection"));
const AcertoCertoIntegration = lazy(() => import("./pages/settings/AcertoCertoIntegration"));
const ControlPages = lazy(() => import("./pages/ControlPages"));
const Auth = lazy(() => import("./pages/Auth"));
const NotFound = lazy(() => import("./pages/NotFound"));

const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route
                path="/*"
                element={
                  <ProtectedRoute>
                    <SidebarProvider>
                      <div className="flex min-h-screen w-full">
                        <AppSidebar />
                        <div className="flex-1 min-w-0">
                          <Suspense fallback={<PageLoader />}>
                            <Routes>
                              <Route path="/" element={<Index />} />
                              <Route path="/planos" element={<Planos />} />
                              <Route path="/users" element={<Clientes />} />
                              <Route path="/revendas" element={<Revendas />} />
                              <Route path="/carteira" element={<Carteira />} />
                              <Route path="/templates" element={<Templates />} />
                              <Route path="/whatsapp" element={<WhatsAppConnection />} />
                              <Route path="/webhooks" element={<Webhooks />} />
                              <Route path="/settings/acerto-certo-integration" element={<AcertoCertoIntegration />} />
                              <Route path="/profile" element={<Profile />} />
                              <Route path="/controlepages" element={<ControlPages />} />
                              <Route path="/sobre-creditos" element={<SobreCreditos />} />
                              <Route path="*" element={<NotFound />} />
                            </Routes>
                          </Suspense>
                        </div>
                      </div>
                    </SidebarProvider>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;