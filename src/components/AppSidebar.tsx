import { Home, Package, Settings, LogOut, UsersRound, MessageSquare, Webhook, MessageCircle, Link2, Wallet, Shield, User, HelpCircle } from "lucide-react";
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
  { title: "Revendas", url: "/revendas", icon: UsersRound },
  { title: "Clientes", url: "/users", icon: UsersRound },
  { title: "Planos", url: "/planos", icon: Package },
  { title: "Carteira", url: "/carteira", icon: Wallet },
  { title: "Templates", url: "/templates", icon: MessageSquare },
  { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
  { title: "Webhooks", url: "/webhooks", icon: Webhook },
  { title: "Acerto Certo", url: "/settings/acerto-certo-integration", icon: Link2 },
  { title: "Sobre Créditos", url: "/sobre-creditos", icon: HelpCircle },
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
    
    if (userRole === 'master' || userRole === 'reseller' || userRole === 'cliente') {
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
      <SidebarHeader className="border-b border-sidebar-border/40 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg gradient-primary shadow-[0_0_15px_hsla(210,100%,56%,0.3)]">
            <span className="text-lg font-bold text-white">AC</span>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-sidebar-accent-foreground tracking-tight">Painel de Controle</h2>
            <p className="text-xs text-muted-foreground">Acerto Certo</p>
            <p className="text-[10px] text-muted-foreground/60 font-mono">v1.0.2.0.0</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">Menu Principal</SidebarGroupLabel>
          <SidebarMenu>
            {visibleMenuItems.map((item) => (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild>
                  <NavLink
                    to={item.url}
                    end={item.url === "/"}
                    className={({ isActive }) =>
                      isActive
                        ? "bg-primary/15 text-primary font-medium border-l-2 border-primary shadow-[inset_0_0_12px_hsla(210,100%,56%,0.08)]"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground transition-all duration-200"
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

      <SidebarMenu className="py-2 mb-2">
        <SidebarMenuItem>
          <SidebarMenuButton onClick={signOut} className="text-sidebar-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200">
            <LogOut className="h-4 w-4" />
            <span>Sair</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>

      <SidebarFooter className="border-t border-sidebar-border/40 p-4">
        <div className="text-center text-muted-foreground/60 text-[10px] space-y-1">
          <p>Desenvolvido por</p>
          <a 
            href="https://digitalsouloficial.vercel.app/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-primary hover:underline text-xs"
          >
            Digital Soul Solutions
          </a>
          <p className="font-mono">CNPJ: 58.870.696/0001-97</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
