import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

export interface PageAccessControl {
  id: string;
  page_key: string;
  page_title: string;
  page_url: string;
  role: "master" | "reseller" | "cliente";
  is_enabled: boolean;
}

// Hook para verificar se o usuário tem acesso a uma página específica
export function usePageAccess(userRole: string | null, pageUrl: string) {
  return useQuery({
    queryKey: ["page-access", userRole, pageUrl],
    queryFn: async () => {
      // Admin sempre tem acesso
      if (userRole === "admin") return true;
      
      if (!userRole || (userRole !== "master" && userRole !== "reseller" && userRole !== "cliente")) {
        return false;
      }

      const { data, error } = await supabase
        .from("page_access_control")
        .select("is_enabled")
        .eq("role", userRole)
        .eq("page_url", pageUrl)
        .maybeSingle();

      if (error) {
        console.error("Error checking page access:", error);
        return false;
      }

      return data?.is_enabled ?? false;
    },
    enabled: !!userRole && (userRole === "admin" || userRole === "master" || userRole === "reseller" || userRole === "cliente"),
    staleTime: 5 * 60 * 1000, // 5 minutos
    retry: false,
  });
}

// Hook para obter todas as permissões de uma role
export function useAllPageAccess(userRole: string | null) {
  return useQuery({
    queryKey: ["all-page-access", userRole],
    queryFn: async () => {
      // Admin sempre tem acesso a tudo
      if (userRole === "admin") return [];
      
      if (!userRole || (userRole !== "master" && userRole !== "reseller" && userRole !== "cliente")) {
        return [];
      }

      const { data, error } = await supabase
        .from("page_access_control")
        .select("*")
        .eq("role", userRole)
        .eq("is_enabled", true)
        .order("page_title");

      if (error) {
        console.error("Error fetching page access:", error);
        return [];
      }

      return (data as PageAccessControl[]) ?? [];
    },
    enabled: !!userRole && (userRole === "admin" || userRole === "master" || userRole === "reseller" || userRole === "cliente"),
    staleTime: 5 * 60 * 1000, // 5 minutos
    retry: false,
  });
}

// Hook para admin carregar todas as configurações de acesso
export function useAllPageAccessConfig() {
  return useQuery({
    queryKey: ["all-page-access-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_access_control")
        .select("*")
        .order("page_title");

      if (error) {
        console.error("Error fetching page access config:", error);
        throw error;
      }

      return (data as PageAccessControl[]) ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

// Hook para admin atualizar permissões
export function useUpdatePageAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates: { id: string; is_enabled: boolean }[]) => {
      const promises = updates.map(({ id, is_enabled }) =>
        supabase
          .from("page_access_control")
          .update({ is_enabled })
          .eq("id", id)
      );

      const results = await Promise.all(promises);
      
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        throw new Error("Erro ao atualizar algumas permissões");
      }

      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["page-access"] });
      queryClient.invalidateQueries({ queryKey: ["all-page-access"] });
      queryClient.invalidateQueries({ queryKey: ["all-page-access-config"] });
      
      toast({
        title: "Sucesso",
        description: "Configurações de acesso atualizadas com sucesso",
      });
    },
    onError: (error) => {
      console.error("Error updating page access:", error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar configurações de acesso",
        variant: "destructive",
      });
    },
  });
}
