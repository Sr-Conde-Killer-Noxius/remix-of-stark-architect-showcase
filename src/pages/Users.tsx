import { useState, useEffect } from "react";
import { Plus, Trash2, Edit, MoreVertical, Bell, ListChecks, Check, UserCog, RefreshCw, Shield, CalendarDays } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { NotificationDialog } from "@/components/NotificationDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,

} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Calendar } from "@/components/ui/calendar"; // Importar Calendar
import { format } from "date-fns"; // Importar format

const resellerSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  resellerRole: z.enum(["admin", "master", "reseller"], {
    required_error: "Selecione um nível",
  }),
});

const editResellerSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(10, "Telefone inválido"),
  password: z.string().optional(),
  planId: z.string().optional(),
  expiryDate: z.string().optional(),
});

type ResellerFormData = z.infer<typeof resellerSchema>;
type EditResellerFormData = z.infer<typeof editResellerSchema>;

interface Plano {
  id: string;
  nome: string;
  valor: number;
}

interface ResellerProfile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string;
  created_at: string;
  created_by: string;
  plan_id: string | null;
  expiry_date: string | null;
  credit_expiry_date: string | null;
  status: string;
  planos?: Plano | null;
  creator?: Array<{
    full_name: string;
  }> | null;
}

interface PotentialCreator {
  user_id: string;
  full_name: string;
  role: string;
}

interface ResellerRole {
  role: string;
}

interface ResellerWithRole extends ResellerProfile {
  role: string;
}

export default function Users() {
  const { userRole } = useAuth();
  const [resellers, setResellers] = useState<ResellerWithRole[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReseller, setSelectedReseller] = useState<ResellerWithRole | null>(null);
  const [selectedPlanValue, setSelectedPlanValue] = useState<number>(0);
  const [potentialCreators, setPotentialCreators] = useState<PotentialCreator[]>([]);
  const [changingCreator, setChangingCreator] = useState(false);
  const [selectedResellerForCreatorChange, setSelectedResellerForCreatorChange] = useState<ResellerWithRole | null>(null);
  const { toast } = useToast();

  // Estados para o novo diálogo de vencimento de crédito
  const [creditExpiryDialogOpen, setCreditExpiryDialogOpen] = useState(false);
  const [selectedResellerForCreditExpiry, setSelectedResellerForCreditExpiry] = useState<ResellerWithRole | null>(null);
  const [newCreditExpiryDate, setNewCreditExpiryDate] = useState<Date | undefined>(undefined);

  const form = useForm<ResellerFormData>({
    resolver: zodResolver(resellerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      resellerRole: "reseller",
    },
  });

  const editForm = useForm<EditResellerFormData>({
    resolver: zodResolver(editResellerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      planId: "",
      expiryDate: "",
    },
  });

  const loadPlanos = async () => {
    try {
      const { data, error } = await supabase
        .from("planos")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw error;
      setPlanos(data || []);
    } catch (error: any) {
      console.error("Error loading planos:", error);
      toast({
        title: "Erro ao carregar planos",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadResellers = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Admin can see all profiles, Master only sees their created users
      let profilesQuery = supabase
        .from("profiles")
        .select("*, planos(id, nome, valor)")
        .order("created_at", { ascending: false });

      // Only filter by created_by for master users
      // Admin users will see all profiles (no filter)
      if (userRole === 'master') {
        profilesQuery = profilesQuery.eq("created_by", user.id);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;

      if (profilesError) throw profilesError;

      const resellersWithRoles: ResellerWithRole[] = [];
      
      for (const profile of profiles || []) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.user_id)
          .maybeSingle();
        
        // Get creator name if created_by exists
        let creatorName = null;
        if (profile.created_by && profile.created_by !== profile.user_id) {
          const { data: creatorData } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("user_id", profile.created_by)
            .maybeSingle();
          
          if (creatorData) {
            creatorName = creatorData.full_name;
          }
        }
        
        resellersWithRoles.push({
          ...profile,
          role: roleData?.role || "reseller",
          creator: creatorName ? [{ full_name: creatorName }] : null,
        });
      }

      setResellers(resellersWithRoles);
    } catch (error: any) {
      console.error("Error loading resellers:", error);
      toast({
        title: "Erro ao carregar revendedores",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPotentialCreators = async () => {
    if (userRole !== 'admin') return; // Only admin can change creators

    try {
      // Load all users with admin or master role
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .order("full_name", { ascending: true });

      if (profilesError) throw profilesError;

      const creatorsWithRoles: PotentialCreator[] = [];
      
      for (const profile of profiles || []) {
        const { data: roleData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.user_id)
          .maybeSingle();
        
        const role = roleData?.role || "reseller";
        
        // Only include admin or master users
        if (role === 'admin' || role === 'master') {
          creatorsWithRoles.push({
            user_id: profile.user_id,
            full_name: profile.full_name || "N/A",
            role,
          });
        }
      }

      setPotentialCreators(creatorsWithRoles);
    } catch (error: any) {
      console.error("Error loading potential creators:", error);
    }
  };

  useEffect(() => {
    loadPlanos();
    loadResellers();
    if (userRole === 'admin') {
      loadPotentialCreators();
    }
    loadUserCredits();
  }, [userRole]);

  const loadUserCredits = async () => {
    if (userRole === 'reseller') return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (userRole === 'admin') {
        setUserCredits(null); // null = ilimitado
        return;
      }

      const { data, error } = await supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setUserCredits(data?.balance || 0);
    } catch (error: any) {
      console.error('Error loading user credits:', error);
    }
  };

  const onSubmit = async (data: ResellerFormData) => {
    try {
      setSubmitting(true);

      // Check credits before creating (client-side validation)
      if (userRole === 'master' && (userCredits === null || userCredits < 1)) {
        toast({
          title: "Créditos insuficientes",
          description: "Você precisa de pelo menos 1 crédito para criar um usuário.",
          variant: "destructive",
        });
        setSubmitting(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke(
        "create-reseller-user",
        {
          body: {
            email: data.email,
            password: data.password,
            fullName: data.fullName,
            resellerRole: data.resellerRole,
          },
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Revendedor criado com sucesso!",
        description: `${data.fullName} foi adicionado ao sistema.`,
      });

      setDialogOpen(false);
      form.reset();
      loadResellers();
      loadUserCredits(); // Refresh credit balance
    } catch (error: any) {
      console.error("Error creating reseller:", error);
      
      let errorMessage = "Ocorreu um erro ao criar o revendedor";
      
      if (error.message?.includes("already been registered") || 
          error.message?.includes("email_exists")) {
        errorMessage = "Este e-mail já está cadastrado no sistema";
      } else if (error.message?.includes("Only master users")) {
        errorMessage = "Apenas usuários master podem Criar Usuários";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro ao Criar Usuário",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onTestSubmit = async (data: ResellerFormData) => {
    try {
      setSubmitting(true);

      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke(
        "create-test-reseller-user",
        {
          body: {
            email: data.email,
            password: data.password,
            fullName: data.fullName,
            resellerRole: data.resellerRole,
          },
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      // Get current date for display
      const currentDate = format(new Date(), "yyyy-MM-dd");

      toast({
        title: "Revendedor teste criado com sucesso!",
        description: `${data.fullName} foi adicionado ao sistema com vencimento em ${currentDate}.`,
      });

      setTestDialogOpen(false);
      form.reset();
      loadResellers();
    } catch (error: any) {
      console.error("Error creating test reseller:", error);
      
      let errorMessage = "Ocorreu um erro ao criar o revendedor teste";
      
      if (error.message?.includes("already been registered") || 
          error.message?.includes("email_exists")) {
        errorMessage = "Este e-mail já está cadastrado no sistema";
      } else if (error.message?.includes("Only master users")) {
        errorMessage = "Apenas usuários master podem Criar Usuários";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro ao criar Usuário teste",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onEdit = async (data: EditResellerFormData) => {
    if (!selectedReseller) return;

    try {
      setSubmitting(true);

      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke(
        "update-reseller-user",
        {
          body: {
            userId: selectedReseller.user_id,
            email: data.email,
            fullName: data.fullName,
            phone: data.phone,
            password: data.password || undefined,
            planId: data.planId || undefined,
            expiryDate: data.expiryDate || undefined,
          },
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Revendedor atualizado com sucesso!",
        description: `${data.fullName} foi atualizado.`,
      });

      setEditDialogOpen(false);
      editForm.reset();
      loadResellers();
    } catch (error: any) {
      console.error("Error updating reseller:", error);
      toast({
        title: "Erro ao atualizar revendedor",
        description: error.message || "Ocorreu um erro ao atualizar o revendedor",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!selectedReseller) return;

    try {
      setSubmitting(true);

      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke(
        "delete-reseller-user",
        {
          body: {
            userId: selectedReseller.user_id,
          },
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Revendedor excluído com sucesso!",
        description: `${selectedReseller.full_name} foi removido do sistema.`,
      });

      setDeleteDialogOpen(false);
      setSelectedReseller(null);
      loadResellers();
    } catch (error: any) {
      console.error("Error deleting reseller:", error);
      toast({
        title: "Erro ao excluir revendedor",
        description: error.message || "Ocorreu um erro ao excluir o revendedor",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (reseller: ResellerWithRole) => {
    setSelectedReseller(reseller);
    editForm.reset({
      fullName: reseller.full_name,
      email: reseller.email,
      phone: reseller.phone || "",
      password: "",
      planId: reseller.plan_id || "",
      expiryDate: reseller.expiry_date ? new Date(reseller.expiry_date).toISOString().split('T')[0] : "",
    });
    if (reseller.planos) {
      setSelectedPlanValue(reseller.planos.valor);
    } else {
      setSelectedPlanValue(0);
    }
    setEditDialogOpen(true);
  };

  const handleDelete = (reseller: ResellerWithRole) => {
    setSelectedReseller(reseller);
    setDeleteDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      active: "default",
      inactive: "secondary",
      suspended: "destructive",
    };
    
    const labels: Record<string, string> = {
      active: "Ativo",
      inactive: "Inativo",
      suspended: "Suspenso",
    };

    return (
      <Badge variant={variants[status] || "secondary"}>
        {labels[status] || status}
      </Badge>
    );
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [renewingCredit, setRenewingCredit] = useState(false);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [userCredits, setUserCredits] = useState<number | null>(null);
  const [updatingRole, setUpdatingRole] = useState(false);

  const updateCreator = async (userId: string, newCreatorId: string) => {
    try {
      setChangingCreator(true);

      const { error } = await supabase
        .from("profiles")
        .update({ created_by: newCreatorId })
        .eq("user_id", userId);

      if (error) throw error;

      toast({
        title: "Criador atualizado com sucesso!",
        description: "O usuário foi reatribuído.",
      });

      loadResellers();
    } catch (error: any) {
      console.error("Error updating creator:", error);
      toast({
        title: "Erro ao atualizar criador",
        description: error.message || "Ocorreu um erro ao atualizar o criador",
        variant: "destructive",
      });
    } finally {
      setChangingCreator(false);
    }
  };

  const updateResellerStatus = async (userId: string, status: 'active' | 'inactive' | 'suspended') => {
    try {
      setUpdatingStatus(true);

      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke(
        "update-reseller-user",
        {
          body: {
            userId,
            status,
          },
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      const roleLabels: Record<string, string> = {
        admin: "Admin",
        master: "Master",
        reseller: "Revendedor"
      };

      toast({
        title: "Status atualizado com sucesso!",
        description: `O status foi alterado para ${status === 'active' ? 'Ativo' : status === 'inactive' ? 'Inativo' : 'Suspenso'}.`,
      });

      // Atualizar o estado local para refletir a mudança de status
      setResellers(prevResellers =>
        prevResellers.map(reseller =>
          reseller.user_id === userId
            ? { ...reseller, status: status }
            : reseller
        )
      );

    } catch (error: any) {
      console.error("Error updating status:", error);
      toast({
        title: "Erro ao atualizar status",
        description: error.message || "Ocorreu um erro ao atualizar o status",
        variant: "destructive",
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleRenewCredit = (reseller: ResellerWithRole) => {
    setSelectedReseller(reseller);
    setRenewDialogOpen(true);
  };

  const onRenewCredit = async () => {
    if (!selectedReseller) return;

    try {
      setRenewingCredit(true);

      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke(
        "renew-reseller-credit",
        {
          body: {
            targetUserId: selectedReseller.user_id,
          },
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Usuário renovado com sucesso!",
        description: `Adicionado 1 mês de atividade para ${selectedReseller.full_name}.`,
      });

      // Atualizar o estado local para refletir a nova data de vencimento do crédito e status
      setResellers(prevResellers =>
        prevResellers.map(reseller =>
          reseller.user_id === selectedReseller.user_id
            ? {
                ...reseller,
                credit_expiry_date: result.newExpiryDate,
                status: 'active', // A renovação sempre define o status como ativo
              }
            : reseller
        )
      );

      setRenewDialogOpen(false);
      setSelectedReseller(null);
      loadUserCredits(); // Recarregar saldo de créditos do usuário logado
    } catch (error: any) {
      console.error("Error renewing credit:", error);
      toast({
        title: "Erro ao renovar usuário",
        description: error.message || "Ocorreu um erro ao renovar o usuário",
        variant: "destructive",
      });
    } finally {
      setRenewingCredit(false);
    }
  };

  const canRenewCredit = userRole === 'admin' || (userRole === 'master' && (userCredits || 0) >= 1);

  const updateResellerRole = async (userId: string, newRole: 'admin' | 'master' | 'reseller') => {
    try {
      setUpdatingRole(true);

      const { data: sessionData } = await supabase.auth.getSession();
      
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke(
        "update-reseller-user",
        {
          body: {
            userId,
            role: newRole,
          },
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      const roleLabels: Record<string, string> = {
        admin: "Admin",
        master: "Master",
        reseller: "Revendedor"
      };

      toast({
        title: "Nível atualizado com sucesso!",
        description: `O nível foi alterado para ${roleLabels[newRole]}.`,
      });

      // Atualizar o estado local para refletir a mudança de nível
      setResellers(prevResellers =>
        prevResellers.map(reseller =>
          reseller.user_id === userId
            ? { ...reseller, role: newRole }
            : reseller
        )
      );

    } catch (error: any) {
      console.error("Error updating role:", error);
      toast({
        title: "Erro ao atualizar nível",
        description: error.message || "Ocorreu um erro ao atualizar o nível",
        variant: "destructive",
      });
    } finally {
      setUpdatingRole(false);
    }
  };

  // Funções para o novo diálogo de vencimento de crédito
  const handleOpenCreditExpiryDialog = (reseller: ResellerWithRole) => {
    setSelectedResellerForCreditExpiry(reseller);
    setNewCreditExpiryDate(reseller.credit_expiry_date ? new Date(reseller.credit_expiry_date) : undefined);
    setCreditExpiryDialogOpen(true);
  };

  const onUpdateCreditExpiry = async () => {
    if (!selectedResellerForCreditExpiry || !newCreditExpiryDate) {
      toast({
        title: "Data inválida",
        description: "Por favor, selecione uma data de vencimento válida.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubmitting(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      // Determine new status based on newCreditExpiryDate
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize today to start of day
      const expiryDateOnly = new Date(newCreditExpiryDate);
      expiryDateOnly.setHours(0, 0, 0, 0); // Normalize expiry date to start of day

      const newStatus = expiryDateOnly >= today ? 'active' : 'inactive';

      const { data: result, error } = await supabase.functions.invoke(
        "update-reseller-user",
        {
          body: {
            userId: selectedResellerForCreditExpiry.user_id,
            creditExpiryDate: newCreditExpiryDate.toISOString(),
            status: newStatus, // Pass the calculated status
          },
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;
      if (result?.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Vencimento do Crédito atualizado!",
        description: `O vencimento do crédito para ${selectedResellerForCreditExpiry.full_name} foi atualizado para ${format(newCreditExpiryDate, "dd/MM/yyyy")} e o status para ${newStatus === 'active' ? 'Ativo' : 'Inativo'}.`,
      });

      // Atualizar o estado local para refletir a mudança imediatamente
      setResellers(prevResellers =>
        prevResellers.map(reseller =>
          reseller.user_id === selectedResellerForCreditExpiry.user_id
            ? {
                ...reseller,
                credit_expiry_date: newCreditExpiryDate.toISOString(),
                status: newStatus,
              }
            : reseller
        )
      );

      setCreditExpiryDialogOpen(false);
      setSelectedResellerForCreditExpiry(null);
      setNewCreditExpiryDate(undefined);
      // Não é mais necessário chamar loadResellers() aqui para a atualização imediata da UI.
      // loadResellers(); // Removido para evitar recarregar a página inteira
    } catch (error: any) {
      console.error("Error updating credit expiry date:", error);
      toast({
        title: "Erro ao atualizar vencimento do crédito",
        description: error.message || "Ocorreu um erro ao atualizar o vencimento do crédito",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Gerenciar Revendedores e Usuários" />

      <main className="container mx-auto p-4 sm:p-6"> {/* Ajustado padding */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0"> {/* Ajustado para empilhar em telas pequenas */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Revendedores</h2> {/* Ajustado tamanho da fonte */}
            <p className="text-sm sm:text-base text-muted-foreground"> {/* Ajustado tamanho da fonte */}
              Gerencie os Usuários e Revendedores do sistema
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => setTestDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Usuário Teste
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Novo Usuário
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto"> {/* Adicionado para responsividade da tabela */}
            <Table className="min-w-max"> {/* Adicionado min-w-max aqui */}
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Nome</TableHead>
                  <TableHead className="whitespace-nowrap">E-mail</TableHead>
                  <TableHead className="whitespace-nowrap">Telefone</TableHead>
                  <TableHead className="whitespace-nowrap">Nível</TableHead>
                  {userRole === 'admin' && <TableHead className="whitespace-nowrap">Abaixo de</TableHead>}
                  <TableHead className="whitespace-nowrap">Plano</TableHead>
                  <TableHead className="whitespace-nowrap">Valor</TableHead>
                  <TableHead className="whitespace-nowrap">Vencimento</TableHead>
                  <TableHead className="whitespace-nowrap">Vencimento do Crédito</TableHead>
                  <TableHead className="whitespace-nowrap">Status</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={userRole === 'admin' ? 11 : 10} className="text-center py-8">
                      <div className="flex justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : resellers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={userRole === 'admin' ? 11 : 10} className="text-center py-8 text-muted-foreground">
                      Nenhum revendedor encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  resellers.map((reseller) => (
                    <TableRow key={reseller.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {reseller.full_name || "N/A"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{reseller.email || "N/A"}</TableCell>
                      <TableCell className="whitespace-nowrap">{reseller.phone || "N/A"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Badge
                          variant={
                            reseller.role === "admin"
                              ? "default"
                              : reseller.role === "master"
                              ? "secondary"
                              : "outline"
                          }
                        >
                          {reseller.role === "admin"
                            ? "Admin"
                            : reseller.role === "master"
                            ? "Master"
                            : "Revendedor"}
                        </Badge>
                      </TableCell>
                      {userRole === 'admin' && (
                        <TableCell className="whitespace-nowrap">
                          <Select
                            value={reseller.created_by || ""}
                            onValueChange={(value) => updateCreator(reseller.user_id, value)}
                            disabled={changingCreator}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue>
                                {!reseller.created_by || reseller.created_by === reseller.user_id 
                                  ? "Ausente" 
                                  : reseller.creator?.[0]?.full_name || "Ausente"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {potentialCreators.map((creator) => (
                                <SelectItem key={creator.user_id} value={creator.user_id}>
                                  {creator.full_name} ({creator.role === 'admin' ? 'Admin' : 'Master'})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap">{reseller.planos?.nome || "N/A"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {reseller.planos?.valor 
                          ? formatCurrency(reseller.planos.valor)
                          : "N/A"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {reseller.expiry_date 
                          ? new Date(reseller.expiry_date).toLocaleDateString("pt-BR")
                          : "N/A"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {reseller.credit_expiry_date 
                          ? new Date(reseller.credit_expiry_date).toLocaleDateString("pt-BR")
                          : "N/A"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{getStatusBadge(reseller.status)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => handleEdit(reseller)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDelete(reseller)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <ListChecks className="mr-2 h-4 w-4" />
                                Mudar Status
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="bg-popover">
                                <DropdownMenuItem 
                                  onClick={() => updateResellerStatus(reseller.user_id, 'active')}
                                  disabled={updatingStatus}
                                >
                                  {reseller.status === 'active' && <Check className="mr-2 h-4 w-4" />}
                                  {reseller.status !== 'active' && <span className="mr-6" />}
                                  Ativo
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => updateResellerStatus(reseller.user_id, 'inactive')}
                                  disabled={updatingStatus}
                                >
                                  {reseller.status === 'inactive' && <Check className="mr-2 h-4 w-4" />}
                                  {reseller.status !== 'inactive' && <span className="mr-6" />}
                                  Inativo
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => updateResellerStatus(reseller.user_id, 'suspended')}
                                  disabled={updatingStatus}
                                >
                                  {reseller.status === 'suspended' && <Check className="mr-2 h-4 w-4" />}
                                  {reseller.status !== 'suspended' && <span className="mr-6" />}
                                  Suspenso
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <Shield className="mr-2 h-4 w-4" />
                                Alterar Nível
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="bg-popover">
                                {userRole === 'admin' && (
                                  <DropdownMenuItem 
                                    onClick={() => updateResellerRole(reseller.user_id, 'admin')}
                                    disabled={updatingRole}
                                  >
                                    {reseller.role === 'admin' && <Check className="mr-2 h-4 w-4" />}
                                    {reseller.role !== 'admin' && <span className="mr-6" />}
                                    Admin
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem 
                                  onClick={() => updateResellerRole(reseller.user_id, 'master')}
                                  disabled={updatingRole}
                                >
                                  {reseller.role === 'master' && <Check className="mr-2 h-4 w-4" />}
                                  {reseller.role !== 'master' && <span className="mr-6" />}
                                  Master
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onClick={() => updateResellerRole(reseller.user_id, 'reseller')}
                                  disabled={updatingRole}
                                >
                                  {reseller.role === 'reseller' && <Check className="mr-2 h-4 w-4" />}
                                  {reseller.role !== 'reseller' && <span className="mr-6" />}
                                  Revendedor
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            {userRole === 'admin' && (
                              <DropdownMenuItem onClick={() => handleOpenCreditExpiryDialog(reseller)}>
                                <CalendarDays className="mr-2 h-4 w-4" />
                                Alterar Vencimento do Crédito
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleRenewCredit(reseller)}
                              disabled={!canRenewCredit}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Renovar Usuário
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedReseller(reseller);
                              setNotificationDialogOpen(true);
                            }}>
                              <Bell className="mr-2 h-4 w-4" />
                              Notificar
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div> {/* Fim do contêiner overflow-x-auto */}
        </div>
      </main>

      {/* Create Dialog - Usuário Teste */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Usuário Teste</DialogTitle>
            <DialogDescription>
              Crie um novo usuário de teste com vencimento de crédito na data atual
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onTestSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test-fullName">Nome Completo</Label>
              <Input
                id="test-fullName"
                {...form.register("fullName")}
                placeholder="João Silva"
                className="w-full"
              />
              {form.formState.errors.fullName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-email">E-mail</Label>
              <Input
                id="test-email"
                type="email"
                {...form.register("email")}
                placeholder="joao@exemplo.com"
                className="w-full"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-password">Senha</Label>
              <Input
                id="test-password"
                type="password"
                {...form.register("password")}
                placeholder="••••••••"
                className="w-full"
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="test-resellerRole">Nível</Label>
              <Select
                onValueChange={(value) =>
                  form.setValue("resellerRole", value as "admin" | "master" | "reseller")
                }
                defaultValue="reseller"
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o nível" />
                </SelectTrigger>
                <SelectContent>
                  {userRole === 'admin' && (
                    <SelectItem value="admin">Admin</SelectItem>
                  )}
                  <SelectItem value="master">Usuário Master</SelectItem>
                  <SelectItem value="reseller">Usuário</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.resellerRole && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.resellerRole.message}
                </p>
              )}
            </div>

            <div className="p-3 bg-muted rounded-md">
              <p className="text-sm text-muted-foreground">
                <strong>Vencimento do Crédito:</strong> {format(new Date(), "dd/MM/yyyy")} (Data atual)
              </p>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setTestDialogOpen(false)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? "Criando..." : "Criar Usuário Teste"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <DialogHeader>
            <DialogTitle>Novo Revendedor</DialogTitle>
            <DialogDescription>
              Crie um novo usuário revendedor no sistema
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input
                id="fullName"
                {...form.register("fullName")}
                placeholder="João Silva"
                className="w-full"
              />
              {form.formState.errors.fullName && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                placeholder="joao@exemplo.com"
                className="w-full"
              />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                {...form.register("password")}
                placeholder="••••••••"
                className="w-full"
              />
              {form.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="resellerRole">Nível</Label>
              <Select
                onValueChange={(value) =>
                  form.setValue("resellerRole", value as "admin" | "master" | "reseller")
                }
                defaultValue="reseller"
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione o nível" />
                </SelectTrigger>
                <SelectContent>
                  {userRole === 'admin' && (
                    <SelectItem value="admin">Admin</SelectItem>
                  )}
                  <SelectItem value="master">Usuário Master</SelectItem>
                  <SelectItem value="reseller">Usuário</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.resellerRole && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.resellerRole.message}
                </p>
              )}
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2"> {/* Empilhado em telas pequenas */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? "Criando..." : "Criar Usuário"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <DialogHeader>
            <DialogTitle>Editar Revendedor</DialogTitle>
            <DialogDescription>
              Atualize as informações do revendedor
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Nome Completo</Label>
              <Input
                id="edit-fullName"
                {...editForm.register("fullName")}
                placeholder="João Silva"
                className="w-full"
              />
              {editForm.formState.errors.fullName && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.fullName.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input
                id="edit-email"
                type="email"
                {...editForm.register("email")}
                placeholder="joao@exemplo.com"
                className="w-full"
              />
              {editForm.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefone *</Label>
              <Input
                id="edit-phone"
                type="tel"
                {...editForm.register("phone")}
                placeholder="(XX) XXXXX-XXXX"
                className="w-full"
              />
              {editForm.formState.errors.phone && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.phone.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-password">Nova Senha (opcional)</Label>
              <Input
                id="edit-password"
                type="password"
                {...editForm.register("password")}
                placeholder="••••••••"
                className="w-full"
              />
              {editForm.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.password.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-plan">Plano</Label>
              <Select
                onValueChange={(value) => {
                  editForm.setValue("planId", value);
                  const plano = planos.find(p => p.id === value);
                  setSelectedPlanValue(plano?.valor || 0);
                }}
                value={editForm.watch("planId")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent>
                  {planos.map((plano) => (
                    <SelectItem key={plano.id} value={plano.id}>
                      {plano.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-planValue">Valor do Plano</Label>
              <Input
                id="edit-planValue"
                value={formatCurrency(selectedPlanValue)}
                disabled
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-expiryDate">Data de Vencimento</Label>
              <Input
                id="edit-expiryDate"
                type="date"
                {...editForm.register("expiryDate")}
                className="w-full"
              />
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2"> {/* Empilhado em telas pequenas */}
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                {submitting ? "Salvando..." : "Salvar Alterações"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o revendedor {selectedReseller?.full_name}? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2"> {/* Empilhado em telas pequenas */}
            <AlertDialogCancel disabled={submitting} className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto"
            >
              {submitting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Renew Credit Dialog */}
      <AlertDialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <AlertDialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <AlertDialogHeader>
            <AlertDialogTitle>Renovar Usuário</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja renovar o usuário {selectedReseller?.full_name}?
              <br /><br />
              Isso irá:
              <ul className="list-disc list-inside mt-2">
                <li>Adicionar 30 dias ao vencimento do crédito</li>
                <li>Custar 1 crédito do seu saldo</li>
                {userRole === 'master' && (
                  <li>Seu saldo atual: {userCredits} crédito(s)</li>
                )}
              </ul>
              <br />
              Data atual de vencimento do crédito: {selectedReseller?.credit_expiry_date 
                ? new Date(selectedReseller.credit_expiry_date).toLocaleDateString("pt-BR")
                : "Não definido"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2"> {/* Empilhado em telas pequenas */}
            <AlertDialogCancel disabled={renewingCredit} className="w-full sm:w-auto">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRenewCredit}
              disabled={renewingCredit}
              className="w-full sm:w-auto"
            >
              {renewingCredit ? "Renovando..." : "Renovar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Alterar Vencimento do Crédito Dialog (Admin only) */}
      <Dialog open={creditExpiryDialogOpen} onOpenChange={setCreditExpiryDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Alterar Vencimento do Crédito</DialogTitle>
            <DialogDescription>
              Selecione a nova data de vencimento do crédito para{" "}
              <strong>{selectedResellerForCreditExpiry?.full_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="flex flex-col items-center space-y-4">
              <Label htmlFor="newCreditExpiryDate" className="text-center">
                Nova Data de Vencimento
              </Label>
              <Calendar
                mode="single"
                selected={newCreditExpiryDate}
                onSelect={setNewCreditExpiryDate}
                initialFocus
              />
              {newCreditExpiryDate && (
                <p className="text-sm text-muted-foreground">
                  Data selecionada: {format(newCreditExpiryDate, "dd/MM/yyyy")}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreditExpiryDialogOpen(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={onUpdateCreditExpiry}
              disabled={submitting || !newCreditExpiryDate}
              className="w-full sm:w-auto"
            >
              {submitting ? "Salvando..." : "Salvar Data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Dialog */}
      {selectedReseller && (
        <NotificationDialog
          open={notificationDialogOpen}
          onOpenChange={setNotificationDialogOpen}
          recipient={{
            id: selectedReseller.id,
            name: selectedReseller.full_name || "",
            phone: selectedReseller.phone,
            plan_name: selectedReseller.planos?.nome,
            plan_value: selectedReseller.planos?.valor,
            expiry_date: selectedReseller.expiry_date || undefined,
          }}
        />
      )}
    </div>
  );
}