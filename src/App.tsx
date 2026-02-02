import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Planos from "./pages/Planos";
import Profile from "./pages/Profile";
import Clientes from "./pages/Clientes";
import Revendas from "./pages/Revendas";
import Carteira from "./pages/Carteira";
import Templates from "./pages/Templates";
import Webhooks from "./pages/Webhooks";
import WhatsAppConnection from "./pages/WhatsAppConnection";
import AcertoCertoIntegration from "./pages/settings/AcertoCertoIntegration";
import ControlPages from "./pages/ControlPages";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <SidebarProvider>
                    <div className="flex min-h-screen w-full">
                      <AppSidebar />
                      <div className="flex-1 min-w-0"> {/* Adicionado min-w-0 aqui */}
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
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </div>
                    </div>
                  </SidebarProvider>
                </ProtectedRoute>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;