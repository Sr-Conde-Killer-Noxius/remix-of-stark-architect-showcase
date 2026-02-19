import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Edit, MoreVertical, Bell, ListChecks, Check, RefreshCw, CalendarDays, ChevronLeft, ChevronRight, Search } from "lucide-react";
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
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";

const clienteSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
});

const editClienteSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(10, "Telefone inválido"),
  password: z.string().optional(),
  planId: z.string().optional(),
  expiryDate: z.string().optional(),
});

type ClienteFormData = z.infer<typeof clienteSchema>;
type EditClienteFormData = z.infer<typeof editClienteSchema>;

interface Plano {
  id: string;
  nome: string;
  valor: number;
}

interface ClienteProfile {
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

interface ClienteWithRole extends ClienteProfile {
  role: string;
}

export default function Clientes() {
  const { userRole } = useAuth();
  const [clientes, setClientes] = useState<ClienteWithRole[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<ClienteWithRole | null>(null);
  const [selectedPlanValue, setSelectedPlanValue] = useState<number>(0);
  const [potentialCreators, setPotentialCreators] = useState<PotentialCreator[]>([]);
  const [changingCreator, setChangingCreator] = useState(false);
  const { toast } = useToast();

  const [creditExpiryDialogOpen, setCreditExpiryDialogOpen] = useState(false);
  const [selectedClienteForCreditExpiry, setSelectedClienteForCreditExpiry] = useState<ClienteWithRole | null>(null);
  const [newCreditExpiryDate, setNewCreditExpiryDate] = useState<Date | undefined>(undefined);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const itemsPerPage = 15;

  const form = useForm<ClienteFormData>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
    },
  });

  const editForm = useForm<EditClienteFormData>({
    resolver: zodResolver(editClienteSchema),
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

  const loadClientes = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      let profilesQuery = supabase
        .from("profiles")
        .select("*, planos(id, nome, valor)")
        .order("created_at", { ascending: false });

      if (userRole === 'master' || userRole === 'reseller') {
        profilesQuery = profilesQuery.eq("created_by", user.id);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;
      if (!profiles?.length) { setClientes([]); return; }

      // Batch fetch all roles in one query
      const userIds = profiles.map(p => p.user_id);
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const roleMap = new Map(rolesData?.map(r => [r.user_id, r.role]) || []);

      // Batch fetch all creator names in one query
      const creatorIds = [...new Set(profiles
        .filter(p => p.created_by && p.created_by !== p.user_id)
        .map(p => p.created_by!))];
      const creatorMap = new Map<string, string>();
      if (creatorIds.length > 0) {
        const { data: creatorsData } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", creatorIds);
        creatorsData?.forEach(c => creatorMap.set(c.user_id, c.full_name || "N/A"));
      }

      const clientesWithRoles: ClienteWithRole[] = profiles
        .filter(profile => (roleMap.get(profile.user_id) || "cliente") === 'cliente')
        .map(profile => {
          const creatorName = profile.created_by && profile.created_by !== profile.user_id
            ? creatorMap.get(profile.created_by) || null
            : null;
          return {
            ...profile,
            role: 'cliente',
            creator: creatorName ? [{ full_name: creatorName }] : null,
          };
        });

      setClientes(clientesWithRoles);
    } catch (error: any) {
      console.error("Error loading clientes:", error);
      toast({
        title: "Erro ao carregar clientes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadPotentialCreators = async () => {
    if (userRole !== 'admin') return;

    try {
      const [{ data: profiles, error: profilesError }, { data: rolesData }] = await Promise.all([
        supabase.from("profiles").select("user_id, full_name").order("full_name", { ascending: true }),
        supabase.from("user_roles").select("user_id, role").in("role", ["admin", "master", "reseller"]),
      ]);

      if (profilesError) throw profilesError;

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      const creatorsWithRoles: PotentialCreator[] = (rolesData || []).map(r => ({
        user_id: r.user_id,
        full_name: profileMap.get(r.user_id) || "N/A",
        role: r.role,
      }));

      setPotentialCreators(creatorsWithRoles);
    } catch (error: any) {
      console.error("Error loading potential creators:", error);
    }
  };

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [renewingCredit, setRenewingCredit] = useState(false);
  const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  const [userCredits, setUserCredits] = useState<number | null>(null);

  const loadUserCredits = async () => {
    if (userRole === 'cliente') return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (userRole === 'admin') {
        setUserCredits(null);
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

  useEffect(() => {
    loadPlanos();
    loadClientes();
    if (userRole === 'admin') {
      loadPotentialCreators();
    }
    loadUserCredits();
  }, [userRole]);

  const onSubmit = async (data: ClienteFormData) => {
    try {
      setSubmitting(true);

      if ((userRole === 'master' || userRole === 'reseller') && (userCredits === null || userCredits < 1)) {
        toast({
          title: "Créditos insuficientes",
          description: "Você precisa de pelo menos 1 crédito para criar um cliente.",
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
            resellerRole: "cliente", // Always create as cliente
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
        title: "Cliente criado com sucesso!",
        description: `${data.fullName} foi adicionado ao sistema.`,
      });

      setDialogOpen(false);
      form.reset();
      loadClientes();
      loadUserCredits();
    } catch (error: any) {
      console.error("Error creating cliente:", error);
      
      let errorMessage = "Ocorreu um erro ao criar o cliente";
      
      if (error.message?.includes("already been registered") || 
          error.message?.includes("email_exists")) {
        errorMessage = "Este e-mail já está cadastrado no sistema";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro ao criar cliente",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onTestSubmit = async (data: ClienteFormData) => {
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
            resellerRole: "cliente",
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

      const currentDate = format(new Date(), "yyyy-MM-dd");

      toast({
        title: "Cliente teste criado com sucesso!",
        description: `${data.fullName} foi adicionado ao sistema com vencimento em ${currentDate}.`,
      });

      setTestDialogOpen(false);
      form.reset();
      loadClientes();
    } catch (error: any) {
      console.error("Error creating test cliente:", error);
      
      let errorMessage = "Ocorreu um erro ao criar o cliente teste";
      
      if (error.message?.includes("already been registered") || 
          error.message?.includes("email_exists")) {
        errorMessage = "Este e-mail já está cadastrado no sistema";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro ao criar cliente teste",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onEdit = async (data: EditClienteFormData) => {
    if (!selectedCliente) return;

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
            userId: selectedCliente.user_id,
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
        title: "Cliente atualizado com sucesso!",
        description: `${data.fullName} foi atualizado.`,
      });

      setEditDialogOpen(false);
      editForm.reset();
      loadClientes();
    } catch (error: any) {
      console.error("Error updating cliente:", error);
      toast({
        title: "Erro ao atualizar cliente",
        description: error.message || "Ocorreu um erro ao atualizar o cliente",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!selectedCliente) return;

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
            userId: selectedCliente.user_id,
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
        title: "Cliente excluído com sucesso!",
        description: `${selectedCliente.full_name} foi removido do sistema.`,
      });

      setDeleteDialogOpen(false);
      setSelectedCliente(null);
      loadClientes();
    } catch (error: any) {
      console.error("Error deleting cliente:", error);
      toast({
        title: "Erro ao excluir cliente",
        description: error.message || "Ocorreu um erro ao excluir o cliente",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (cliente: ClienteWithRole) => {
    setSelectedCliente(cliente);
    editForm.reset({
      fullName: cliente.full_name,
      email: cliente.email,
      phone: cliente.phone || "",
      password: "",
      planId: cliente.plan_id || "",
      expiryDate: cliente.expiry_date ? new Date(cliente.expiry_date).toISOString().split('T')[0] : "",
    });
    if (cliente.planos) {
      setSelectedPlanValue(cliente.planos.valor);
    } else {
      setSelectedPlanValue(0);
    }
    setEditDialogOpen(true);
  };

  const handleDelete = (cliente: ClienteWithRole) => {
    setSelectedCliente(cliente);
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
        description: "O cliente foi reatribuído.",
      });

      loadClientes();
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

  const updateClienteStatus = async (userId: string, status: 'active' | 'inactive' | 'suspended') => {
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

      toast({
        title: "Status atualizado com sucesso!",
        description: `O status foi alterado para ${status === 'active' ? 'Ativo' : status === 'inactive' ? 'Inativo' : 'Suspenso'}.`,
      });

      setClientes(prevClientes =>
        prevClientes.map(cliente =>
          cliente.user_id === userId
            ? { ...cliente, status: status }
            : cliente
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

  const handleRenewCredit = (cliente: ClienteWithRole) => {
    setSelectedCliente(cliente);
    setRenewDialogOpen(true);
  };

  const onRenewCredit = async () => {
    if (!selectedCliente) return;

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
            targetUserId: selectedCliente.user_id,
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
        title: "Cliente renovado com sucesso!",
        description: `Adicionado 1 mês de atividade para ${selectedCliente.full_name}.`,
      });

      setClientes(prevClientes =>
        prevClientes.map(cliente =>
          cliente.user_id === selectedCliente.user_id
            ? {
                ...cliente,
                credit_expiry_date: result.newExpiryDate,
                status: 'active',
              }
            : cliente
        )
      );

      setRenewDialogOpen(false);
      setSelectedCliente(null);
      loadUserCredits();
    } catch (error: any) {
      console.error("Error renewing credit:", error);
      toast({
        title: "Erro ao renovar cliente",
        description: error.message || "Ocorreu um erro ao renovar o cliente",
        variant: "destructive",
      });
    } finally {
      setRenewingCredit(false);
    }
  };

  const canRenewCredit = userRole === 'admin' || ((userRole === 'master' || userRole === 'reseller') && (userCredits || 0) >= 1);

  const handleOpenCreditExpiryDialog = (cliente: ClienteWithRole) => {
    setSelectedClienteForCreditExpiry(cliente);
    setNewCreditExpiryDate(cliente.credit_expiry_date ? new Date(cliente.credit_expiry_date) : undefined);
    setCreditExpiryDialogOpen(true);
  };

  const onUpdateCreditExpiry = async () => {
    if (!selectedClienteForCreditExpiry || !newCreditExpiryDate) {
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

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiryDateOnly = new Date(newCreditExpiryDate);
      expiryDateOnly.setHours(0, 0, 0, 0);

      const newStatus = expiryDateOnly >= today ? 'active' : 'inactive';

      const { data: result, error } = await supabase.functions.invoke(
        "update-reseller-user",
        {
          body: {
            userId: selectedClienteForCreditExpiry.user_id,
            creditExpiryDate: newCreditExpiryDate.toISOString(),
            status: newStatus,
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
        description: `O vencimento do crédito para ${selectedClienteForCreditExpiry.full_name} foi atualizado para ${format(newCreditExpiryDate, "dd/MM/yyyy")} e o status para ${newStatus === 'active' ? 'Ativo' : 'Inativo'}.`,
      });

      setClientes(prevClientes =>
        prevClientes.map(cliente =>
          cliente.user_id === selectedClienteForCreditExpiry.user_id
            ? {
                ...cliente,
                credit_expiry_date: newCreditExpiryDate.toISOString(),
                status: newStatus,
              }
            : cliente
        )
      );

      setCreditExpiryDialogOpen(false);
      setSelectedClienteForCreditExpiry(null);
      setNewCreditExpiryDate(undefined);
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

  const filteredClientes = useMemo(() => {
    if (!searchTerm) return clientes;
    const term = searchTerm.toLowerCase();
    return clientes.filter(c =>
      c.full_name?.toLowerCase().includes(term) ||
      c.email?.toLowerCase().includes(term) ||
      c.phone?.toLowerCase().includes(term)
    );
  }, [clientes, searchTerm]);

  const totalPages = Math.max(1, Math.ceil(filteredClientes.length / itemsPerPage));
  const paginatedClientes = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredClientes.slice(start, start + itemsPerPage);
  }, [filteredClientes, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Gerenciar Clientes" />

      <main className="container mx-auto p-4 sm:p-6">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Controle de Clientes</h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Gerencie os clientes do sistema
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => setTestDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Cliente Teste
            </Button>
            <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Novo Cliente
            </Button>
          </div>
        </div>

        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 max-w-sm"
          />
        </div>

        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <Table className="min-w-max">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Nome</TableHead>
                  <TableHead className="whitespace-nowrap">E-mail</TableHead>
                  <TableHead className="whitespace-nowrap">Telefone</TableHead>
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
                    <TableCell colSpan={userRole === 'admin' ? 10 : 9} className="text-center py-8">
                      <div className="flex justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : filteredClientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={userRole === 'admin' ? 10 : 9} className="text-center py-8 text-muted-foreground">
                      {searchTerm ? "Nenhum cliente encontrado com esse filtro" : "Nenhum cliente encontrado"}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClientes.map((cliente) => (
                    <TableRow key={cliente.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {cliente.full_name || "N/A"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{cliente.email || "N/A"}</TableCell>
                      <TableCell className="whitespace-nowrap">{cliente.phone || "N/A"}</TableCell>
                      {userRole === 'admin' && (
                        <TableCell className="whitespace-nowrap">
                          <Select
                            value={cliente.created_by || ""}
                            onValueChange={(value) => updateCreator(cliente.user_id, value)}
                            disabled={changingCreator}
                          >
                            <SelectTrigger className="w-[180px]">
                              <SelectValue>
                                {!cliente.created_by || cliente.created_by === cliente.user_id 
                                  ? "Ausente" 
                                  : cliente.creator?.[0]?.full_name || "Ausente"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {potentialCreators.map((creator) => (
                                <SelectItem key={creator.user_id} value={creator.user_id}>
                                  {creator.full_name} ({creator.role === 'admin' ? 'Admin' : creator.role === 'master' ? 'Master' : 'Revenda'})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      )}
                      <TableCell className="whitespace-nowrap">{cliente.planos?.nome || "N/A"}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {cliente.planos?.valor 
                          ? formatCurrency(cliente.planos.valor)
                          : "N/A"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {cliente.expiry_date 
                          ? new Date(cliente.expiry_date).toLocaleDateString("pt-BR")
                          : "N/A"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {cliente.credit_expiry_date 
                          ? new Date(cliente.credit_expiry_date).toLocaleDateString("pt-BR")
                          : "N/A"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{getStatusBadge(cliente.status)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-popover">
                            <DropdownMenuItem onClick={() => handleEdit(cliente)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDelete(cliente)}
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
                                  onSelect={() => updateClienteStatus(cliente.user_id, 'active')}
                                  disabled={updatingStatus}
                                >
                                  {cliente.status === 'active' && <Check className="mr-2 h-4 w-4" />}
                                  {cliente.status !== 'active' && <span className="mr-6" />}
                                  Ativo
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onSelect={() => updateClienteStatus(cliente.user_id, 'inactive')}
                                  disabled={updatingStatus}
                                >
                                  {cliente.status === 'inactive' && <Check className="mr-2 h-4 w-4" />}
                                  {cliente.status !== 'inactive' && <span className="mr-6" />}
                                  Inativo
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                  onSelect={() => updateClienteStatus(cliente.user_id, 'suspended')}
                                  disabled={updatingStatus}
                                >
                                  {cliente.status === 'suspended' && <Check className="mr-2 h-4 w-4" />}
                                  {cliente.status !== 'suspended' && <span className="mr-6" />}
                                  Suspenso
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            {userRole === 'admin' && (
                              <DropdownMenuItem onClick={() => handleOpenCreditExpiryDialog(cliente)}>
                                <CalendarDays className="mr-2 h-4 w-4" />
                                Alterar Vencimento do Crédito
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => handleRenewCredit(cliente)}
                              disabled={!canRenewCredit}
                            >
                              <RefreshCw className="mr-2 h-4 w-4" />
                              Renovar Cliente
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                              setSelectedCliente(cliente);
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
          </div>
        </div>

        {/* Pagination */}
        {filteredClientes.length > itemsPerPage && (
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {((currentPage - 1) * itemsPerPage) + 1}-{Math.min(currentPage * itemsPerPage, filteredClientes.length)} de {filteredClientes.length}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próximo
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </main>

      {/* Create Test Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Cliente Teste</DialogTitle>
            <DialogDescription>
              Crie um novo cliente de teste com vencimento de crédito na data atual
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
                {submitting ? "Criando..." : "Criar Cliente Teste"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Cliente</DialogTitle>
            <DialogDescription>
              Crie um novo cliente no sistema
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

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
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
                {submitting ? "Criando..." : "Criar Cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Cliente</DialogTitle>
            <DialogDescription>
              Atualize as informações do cliente
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Nome Completo</Label>
              <Input
                id="edit-fullName"
                {...editForm.register("fullName")}
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
                className="w-full"
              />
              {editForm.formState.errors.email && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefone</Label>
              <Input
                id="edit-phone"
                {...editForm.register("phone")}
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
                placeholder="Deixe em branco para manter"
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-planId">Plano</Label>
              <Select
                value={editForm.watch("planId") || ""}
                onValueChange={(value) => {
                  editForm.setValue("planId", value);
                  const selectedPlano = planos.find((p) => p.id === value);
                  setSelectedPlanValue(selectedPlano?.valor || 0);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um plano" />
                </SelectTrigger>
                <SelectContent>
                  {planos.map((plano) => (
                    <SelectItem key={plano.id} value={plano.id}>
                      {plano.nome} - {formatCurrency(plano.valor)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPlanValue > 0 && (
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm text-muted-foreground">
                  Valor do plano: <strong>{formatCurrency(selectedPlanValue)}</strong>
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-expiryDate">Data de Vencimento</Label>
              <Input
                id="edit-expiryDate"
                type="date"
                {...editForm.register("expiryDate")}
                className="w-full"
              />
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o cliente{" "}
              <strong>{selectedCliente?.full_name}</strong>? Esta ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Renew Credit Dialog */}
      <AlertDialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renovar Cliente</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja renovar o cliente{" "}
              <strong>{selectedCliente?.full_name}</strong>? Isso adicionará 1 mês
              ao vencimento do crédito.
              {(userRole === 'master' || userRole === 'reseller') && (
                <span className="block mt-2 text-primary">
                  Custo: 1 crédito (Saldo atual: {userCredits})
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renewingCredit}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onRenewCredit}
              disabled={renewingCredit || !canRenewCredit}
            >
              {renewingCredit ? "Renovando..." : "Renovar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Credit Expiry Dialog */}
      <Dialog open={creditExpiryDialogOpen} onOpenChange={setCreditExpiryDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Alterar Vencimento do Crédito</DialogTitle>
            <DialogDescription>
              Selecione a nova data de vencimento do crédito para{" "}
              <strong>{selectedClienteForCreditExpiry?.full_name}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Calendar
              mode="single"
              selected={newCreditExpiryDate}
              onSelect={setNewCreditExpiryDate}
              initialFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreditExpiryDialogOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button onClick={onUpdateCreditExpiry} disabled={submitting || !newCreditExpiryDate}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Notification Dialog */}
      {selectedCliente && (
        <NotificationDialog
          open={notificationDialogOpen}
          onOpenChange={setNotificationDialogOpen}
          recipient={{
            id: selectedCliente.user_id,
            name: selectedCliente.full_name,
            phone: selectedCliente.phone,
            plan_name: selectedCliente.planos?.nome,
            plan_value: selectedCliente.planos?.valor,
            expiry_date: selectedCliente.expiry_date || undefined,
          }}
        />
      )}
    </div>
  );
}
