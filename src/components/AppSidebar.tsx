import { Home, Package, Settings, LogOut, UsersRound, MessageSquare, Webhook, MessageCircle, Link2, Wallet, Shield, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useAllPageAccess } from "@/hooks/usePageAccessControl";

const allMenuItems = [
  { title: "Meu Perfil", url: "/profile", icon: User }, // Moved to first position and updated
  { title: "Revenda", url: "/revenda", icon: UsersRound },
  { title: "Planos", url: "/planos", icon: Package },
  { title: "Carteira", url: "/carteira", icon: Wallet },
  { title: "Templates", url: "/templates", icon: MessageSquare },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
  { title: "Webhooks", url: "/webhooks", icon: Webhook },
  { title: "Acerto Certo", url: "/settings/acerto-certo-integration", icon: Link2 },
  // Removed "Configurações" as it's now "Meu Perfil"
];

export function AppSidebar() {
  const { signOut, user, userRole } = useAuth();
  const { data: allowedPages = [], isLoading } = useAllPageAccess(userRole);

  // Filter menu items based on user role and dynamic permissions
  const getMenuItems = () => {
    // Admin sempre vê tudo + controle de páginas
    if (userRole === 'admin') {
      return [
        ...allMenuItems,
        { title: "Controle de Páginas", url: "/controlepages", icon: Shield },
      ];
    }
    
    // Para master e reseller, filtrar baseado nas permissões do banco
    if (userRole === 'master' || userRole === 'reseller') {
      const allowedUrls = allowedPages.map((p) => p.page_url);
      
      // Meu Perfil sempre disponível
      const alwaysAvailable = ['/', '/profile']; // Updated to /profile
      
      return allMenuItems.filter((item) => 
        alwaysAvailable.includes(item.url) || allowedUrls.includes(item.url)
      );
    }
    
    return [];
  };

  const visibleMenuItems = getMenuItems();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="text-lg font-bold text-primary-foreground">RS</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-sidebar-foreground">Painel Revenda</h2>
            <p className="text-xs text-muted-foreground">Acerto Certo</p>
            <p className="text-xs text-muted-foreground">1.0.0.0.0</p> {/* Versão adicionada aqui */}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Menu Principal</SidebarGroupLabel>
          <SidebarMenu>
            {visibleMenuItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className={({ isActive }) =>
                      isActive
                        ? "bg-sidebar-accent text-sidebar-primary font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50"
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {user?.email?.substring(0, 2).toUpperCase() || "AC"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.user_metadata?.full_name || "Usuário"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            className="h-8 w-8 text-muted-foreground hover:text-sidebar-foreground"
            onClick={signOut}
            title="Sair"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}