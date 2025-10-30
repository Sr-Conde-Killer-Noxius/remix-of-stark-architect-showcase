import { Home, Package, Settings, LogOut, UsersRound, MessageSquare, Webhook, MessageCircle, Link2, Wallet, Shield, User } from "lucide-react";
import { NavLink } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
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
  { title: "Meu Perfil", url: "/profile", icon: User },
  { title: "Revenda", url: "/revenda", icon: UsersRound },
  { title: "Planos", url: "/planos", icon: Package },
  { title: "Carteira", url: "/carteira", icon: Wallet },
  { title: "Templates", url: "/templates", icon: MessageSquare },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
  { title: "Webhooks", url: "/webhooks", icon: Webhook },
  { title: "Acerto Certo", url: "/settings/acerto-certo-integration", icon: Link2 },
];

export function AppSidebar() {
  const { signOut, user, userRole } = useAuth();
  const { data: allowedPages = [], isLoading } = useAllPageAccess(userRole);

  const getMenuItems = () => {
    if (userRole === 'admin') {
      return [
        ...allMenuItems,
        { title: "Controle de Páginas", url: "/controlepages", icon: Shield },
      ];
    }
    
    if (userRole === 'master' || userRole === 'reseller') {
      const allowedUrls = allowedPages.map((p) => p.page_url);
      
      const alwaysAvailable = ['/', '/profile'];
      
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
            <p className="text-xs text-muted-foreground">1.0.0.1.0</p>
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

      {/* Separador visual antes do botão Sair */}
      {/*<div className="h-px bg-sidebar-border mx-4" />

      {/* Botão Sair - Movido para fora do SidebarContent */}
      <SidebarMenu className="py-2 mb-2"> {/* Adicionado py-2 e mb-2 para espaçamento */}
        <SidebarMenuItem>
          <SidebarMenuButton onClick={signOut} className="text-sidebar-foreground hover:bg-sidebar-accent/50">
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="text-center text-muted-foreground text-xs space-y-1">
          <p>Desenvolvido por</p>
          <a 
            href="https://digitalsouloficial.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-primary hover:underline"
          >
            Digital Soul Solutions
          </a>
          <p>CNPJ: 58.870.696/0001-97</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}