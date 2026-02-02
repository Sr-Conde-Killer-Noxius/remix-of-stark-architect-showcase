import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePageAccess } from "@/hooks/usePageAccessControl";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, userRole } = useAuth();
  const location = useLocation();
  const pathname = location.pathname;

  // Chamar usePageAccess incondicionalmente.
  // A query será desabilitada se userRole for 'admin' ou nulo/indefinido,
  // mas a ordem de chamada do hook permanece consistente.
  const { data: hasAccess, isLoading: checkingAccess } = usePageAccess(userRole, pathname);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admin sempre tem acesso a tudo
  if (userRole === 'admin') {
    return <>{children}</>;
  }
  
  // Se não for admin, e ainda estiver verificando o acesso, mostra carregando
  if (checkingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }
  
  // Páginas sempre disponíveis (não precisam estar na tabela de controle)
  const alwaysAllowed = ['/', '/profile'];
  
  // Se for master, reseller ou cliente
  if (userRole === 'master' || userRole === 'reseller' || userRole === 'cliente') {
    // Permitir páginas sempre disponíveis
    if (alwaysAllowed.includes(pathname)) {
      return <>{children}</>;
    }
    
    // Verificar permissão dinâmica
    if (hasAccess) {
      return <>{children}</>;
    }
    
    // Se não tem acesso, redirecionar
    return <Navigate to="/" replace />;
  }

  // Fallback para qualquer outro caso (deve ser coberto pelos acima, mas bom para segurança)
  return <>{children}</>;
}