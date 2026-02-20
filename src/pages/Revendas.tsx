import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Edit, MoreVertical, Bell, Check, UserCog, Shield, Users, TrendingUp, AlertCircle, Snowflake, Crown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { NotificationDialog } from "@/components/NotificationDialog";
import { FilterableSortableTable, type ColumnDef } from "@/components/FilterableSortableTable";
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
  DropdownMenuPortal,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const resellerSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter no mínimo 6 caracteres"),
  resellerRole: z.enum(["master", "reseller"], {
    required_error: "Selecione um nível",
  }),
});

const editResellerSchema = z.object({
  fullName: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  email: z.string().email("E-mail inválido"),
  phone: z.string().min(10, "Telefone inválido"),
  password: z.string().optional(),
  // [18/02/2026] planId e expiryDate removidos da UI de revendas — colunas exclusivas de role 'cliente'.
  // Manter campos comentados até segunda ordem.
  // planId: z.string().optional(),
  // expiryDate: z.string().optional(),
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

interface ResellerWithRole extends ResellerProfile {
  role: string;
}

export default function Revendas() {
  const { userRole } = useAuth();
  const [resellers, setResellers] = useState<ResellerWithRole[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [notificationDialogOpen, setNotificationDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedReseller, setSelectedReseller] = useState<ResellerWithRole | null>(null);
  const [potentialCreators, setPotentialCreators] = useState<PotentialCreator[]>([]);
  const [changingCreator, setChangingCreator] = useState(false);
  const [updatingRole, setUpdatingRole] = useState(false);
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  // [18/02/2026] States de status, renovação e vencimento de crédito removidos — exclusivos de role 'cliente'. Manter comentados até segunda ordem.
  // const [updatingStatus, setUpdatingStatus] = useState(false);
  // const [renewingCredit, setRenewingCredit] = useState(false);
  // const [renewDialogOpen, setRenewDialogOpen] = useState(false);
  // const [userCredits, setUserCredits] = useState<number | null>(null);
  // const [creditExpiryDialogOpen, setCreditExpiryDialogOpen] = useState(false);
  // const [selectedResellerForCreditExpiry, setSelectedResellerForCreditExpiry] = useState<ResellerWithRole | null>(null);
  // const [newCreditExpiryDate, setNewCreditExpiryDate] = useState<Date | undefined>(undefined);
  
  const { toast } = useToast();

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
      // [18/02/2026] planId e expiryDate removidos — exclusivos de role 'cliente'.
      // planId: "",
      // expiryDate: "",
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
    }
  };

  const loadResellers = async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      let profilesQuery = supabase
        .from("profiles")
        .select("*, planos(id, nome, valor)")
        .order("created_at", { ascending: false });

      if (userRole === 'master') {
        profilesQuery = profilesQuery.eq("created_by", user.id);
      }

      const { data: profiles, error: profilesError } = await profilesQuery;
      if (profilesError) throw profilesError;
      if (!profiles?.length) { setResellers([]); return; }

      const userIds = profiles.map(p => p.user_id);
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);
      const roleMap = new Map(rolesData?.map(r => [r.user_id, r.role]) || []);

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

      const resellersWithRoles: ResellerWithRole[] = profiles
        .filter(profile => {
          const role = roleMap.get(profile.user_id) || "cliente";
          return role === 'master' || role === 'reseller';
        })
        .map(profile => {
          const role = roleMap.get(profile.user_id) || "cliente";
          const creatorName = profile.created_by && profile.created_by !== profile.user_id
            ? creatorMap.get(profile.created_by) || null
            : null;
          return {
            ...profile,
            role,
            creator: creatorName ? [{ full_name: creatorName }] : null,
          };
        });

      setResellers(resellersWithRoles);
    } catch (error: any) {
      console.error("Error loading resellers:", error);
      toast({
        title: "Erro ao carregar revendas",
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
        supabase.from("user_roles").select("user_id, role").in("role", ["admin", "master"]),
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

  // [18/02/2026] loadUserCredits removido — créditos são gerenciados exclusivamente na página de clientes. Manter comentado até segunda ordem.
  // const loadUserCredits = async () => { ... };

  useEffect(() => {
    loadPlanos();
    loadResellers();
    if (userRole === 'admin') {
      loadPotentialCreators();
    }
    // [18/02/2026] loadUserCredits removido — créditos gerenciados na página de clientes.
    // loadUserCredits();
  }, [userRole]);

  const onSubmit = async (data: ResellerFormData) => {
    try {
      setSubmitting(true);

      // [18/02/2026] Verificação de créditos removida — exclusiva de role 'cliente'. Manter comentado até segunda ordem.
      // if (userRole === 'master' && (userCredits === null || userCredits < 1)) { ... }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Não autenticado");

      const { data: result, error } = await supabase.functions.invoke(
        "create-reseller-user",
        {
          body: {
            email: data.email,
            password: data.password,
            fullName: data.fullName,
            resellerRole: data.resellerRole,
          },
          headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` }
        }
      );

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      toast({
        title: "Revenda criada com sucesso!",
        description: `${data.fullName} foi adicionado ao sistema.`,
      });

      setDialogOpen(false);
      form.reset();
      loadResellers();
    } catch (error: any) {
      console.error("Error creating reseller:", error);
      
      let errorMessage = "Ocorreu um erro ao criar a revenda";
      if (error.message?.includes("already been registered") || error.message?.includes("email_exists")) {
        errorMessage = "Este e-mail já está cadastrado no sistema";
      } else if (error.message?.includes("Only master users")) {
        errorMessage = "Apenas usuários master podem criar revendas";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({ title: "Erro ao criar revenda", description: errorMessage, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const onEdit = async (data: EditResellerFormData) => {
    if (!selectedReseller) return;

    try {
      setSubmitting(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Não autenticado");

      const { data: result, error } = await supabase.functions.invoke(
        "update-reseller-user",
        {
          body: {
            userId: selectedReseller.user_id,
            email: data.email,
            fullName: data.fullName,
            phone: data.phone,
            password: data.password || undefined,
            // [18/02/2026] planId e expiryDate removidos — exclusivos de role 'cliente'.
            // planId: data.planId || undefined,
            // expiryDate: data.expiryDate || undefined,
          },
          headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` }
        }
      );

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      toast({ title: "Revenda atualizada com sucesso!", description: `${data.fullName} foi atualizado.` });
      setEditDialogOpen(false);
      editForm.reset();
      loadResellers();
    } catch (error: any) {
      console.error("Error updating reseller:", error);
      toast({ title: "Erro ao atualizar revenda", description: error.message || "Ocorreu um erro ao atualizar a revenda", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!selectedReseller) return;

    try {
      setSubmitting(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Não autenticado");

      const { data: result, error } = await supabase.functions.invoke(
        "delete-reseller-user",
        {
          body: { userId: selectedReseller.user_id },
          headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` }
        }
      );

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      toast({ title: "Revenda excluída com sucesso!", description: `${selectedReseller.full_name} foi removido do sistema.` });
      setDeleteDialogOpen(false);
      setSelectedReseller(null);
      loadResellers();
    } catch (error: any) {
      console.error("Error deleting reseller:", error);
      toast({ title: "Erro ao excluir revenda", description: error.message || "Ocorreu um erro ao excluir a revenda", variant: "destructive" });
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
      // [18/02/2026] planId e expiryDate removidos — exclusivos de role 'cliente'.
      // planId: reseller.plan_id || "",
      // expiryDate: reseller.expiry_date ? new Date(reseller.expiry_date).toISOString().split('T')[0] : "",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (reseller: ResellerWithRole) => {
    setSelectedReseller(reseller);
    setDeleteDialogOpen(true);
  };

  const updateCreator = async (userId: string, newCreatorId: string) => {
    try {
      setChangingCreator(true);

      const { error } = await supabase
        .from("profiles")
        .update({ created_by: newCreatorId })
        .eq("user_id", userId);

      if (error) throw error;

      toast({ title: "Criador atualizado com sucesso!", description: "O usuário foi reatribuído." });
      loadResellers();
    } catch (error: any) {
      console.error("Error updating creator:", error);
      toast({ title: "Erro ao atualizar criador", description: error.message || "Ocorreu um erro ao atualizar o criador", variant: "destructive" });
    } finally {
      setChangingCreator(false);
    }
  };

  // [18/02/2026] updateResellerStatus, handleRenewCredit, onRenewCredit e canRenewCredit removidos da UI de revendas.
  // Status e renovação são exclusivos de role 'cliente'. Manter comentados até segunda ordem.
  // const updateResellerStatus = async (userId: string, status: 'active' | 'inactive' | 'suspended') => { ... };
  // const handleRenewCredit = (reseller: ResellerWithRole) => { setSelectedReseller(reseller); setRenewDialogOpen(true); };
  // const onRenewCredit = async () => { ... };
  // const canRenewCredit = userRole === 'admin' || (userRole === 'master' && (userCredits || 0) >= 1);

  // [18/02/2026] handleOpenCreditExpiryDialog e onUpdateCreditExpiry removidos — exclusivos de role 'cliente'. Manter comentados até segunda ordem.
  // const handleOpenCreditExpiryDialog = (reseller: ResellerWithRole) => { ... };
  // const onUpdateCreditExpiry = async () => { ... };

  const updateResellerRole = async (userId: string, newRole: 'master' | 'reseller') => {
    try {
      setUpdatingRole(true);

      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Não autenticado");

      const { data: result, error } = await supabase.functions.invoke(
        "update-reseller-user",
        {
          body: { userId, role: newRole },
          headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` }
        }
      );

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      const roleLabels: Record<string, string> = { master: "Master", reseller: "Revenda", cliente: "Cliente" };
      toast({ title: "Nível atualizado com sucesso!", description: `O nível foi alterado para ${roleLabels[newRole]}.` });

      setResellers(prevResellers =>
        prevResellers.map(reseller =>
          reseller.user_id === userId ? { ...reseller, role: newRole } : reseller
        )
      );
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast({ title: "Erro ao atualizar nível", description: error.message || "Ocorreu um erro ao atualizar o nível", variant: "destructive" });
    } finally {
      setUpdatingRole(false);
    }
  };

  const resellerColumns: ColumnDef<ResellerWithRole>[] = useMemo(() => {
    const cols: ColumnDef<ResellerWithRole>[] = [
      {
        key: 'full_name', header: 'Nome', accessor: r => r.full_name || 'N/A',
        render: r => <span className="font-medium">{r.full_name || 'N/A'}</span>,
      },
      { key: 'email', header: 'E-mail', accessor: r => r.email || 'N/A' },
      { key: 'phone', header: 'Telefone', accessor: r => r.phone || 'N/A' },
      {
        key: 'role', header: 'Nível', accessor: r => r.role,
        filterType: 'select', filterOptions: [{ label: 'Master', value: 'master' }, { label: 'Revenda', value: 'reseller' }],
        render: r => <Badge variant={r.role === 'master' ? 'secondary' : 'outline'}>{r.role === 'master' ? 'Master' : 'Revenda'}</Badge>,
      },
    ];

    if (userRole === 'admin') {
      cols.push({
        key: 'created_by', header: 'Abaixo de',
        accessor: r => (!r.created_by || r.created_by === r.user_id) ? 'Ausente' : (r.creator?.[0]?.full_name || 'Ausente'),
        sortable: false,
        render: r => (
          <Select value={r.created_by || ""} onValueChange={(value) => updateCreator(r.user_id, value)} disabled={changingCreator}>
            <SelectTrigger className="w-[180px]">
              <SelectValue>
                {!r.created_by || r.created_by === r.user_id ? "Ausente" : r.creator?.[0]?.full_name || "Ausente"}
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
        ),
      });
    }

    // [18/02/2026] Colunas Plano, Valor, Vencimento, Venc. Crédito e Status removidas da tabela de revendas.
    // Essas colunas são exclusivas de role 'cliente'. Manter comentadas até segunda ordem.
    // cols.push(
    //   { key: 'plano', header: 'Plano', accessor: r => r.planos?.nome || 'N/A' },
    //   { key: 'valor', header: 'Valor', accessor: r => r.planos?.valor || 0, render: r => r.planos?.valor ? formatCurrency(r.planos.valor) : 'N/A' },
    //   { key: 'expiry_date', header: 'Vencimento', accessor: r => r.expiry_date || '', render: r => r.expiry_date ? new Date(r.expiry_date).toLocaleDateString('pt-BR') : 'N/A' },
    //   { key: 'credit_expiry_date', header: 'Venc. Crédito', accessor: r => r.credit_expiry_date || '', render: r => r.credit_expiry_date ? new Date(r.credit_expiry_date).toLocaleDateString('pt-BR') : 'N/A' },
    //   { key: 'status', header: 'Status', ... filterType: 'select' ... },
    // );

    cols.push({
      key: 'actions', header: 'Ações', accessor: () => '', sortable: false, filterable: false, align: 'right' as const,
      render: r => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-popover">
            <DropdownMenuItem onClick={() => handleEdit(r)}>
              <Edit className="mr-2 h-4 w-4" /> Editar
            </DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={() => handleDelete(r)}>
              <Trash2 className="mr-2 h-4 w-4" /> Excluir
            </DropdownMenuItem>
            {/* [18/02/2026] "Alterar Status" removido — Status é exclusivo de role 'cliente'. Manter comentado até segunda ordem.
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Alterar Status</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onSelect={() => updateResellerStatus(r.user_id, 'active')}>Ativo</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => updateResellerStatus(r.user_id, 'inactive')}>Inativo</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => updateResellerStatus(r.user_id, 'suspended')}>Suspenso</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Shield className="mr-2 h-4 w-4" /> Alterar Nível</DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent className="bg-popover border border-border shadow-lg z-[100]">
                  <DropdownMenuItem onSelect={() => updateResellerRole(r.user_id, 'master')} disabled={updatingRole}>
                    {r.role === 'master' ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-6" />} Master
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => updateResellerRole(r.user_id, 'reseller')} disabled={updatingRole}>
                    {r.role === 'reseller' ? <Check className="mr-2 h-4 w-4" /> : <span className="mr-6" />} Revenda
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            {/* [18/02/2026] "Alterar Vencimento do Crédito" e "Renovar Revenda" removidos — exclusivos de role 'cliente'. Manter comentados até segunda ordem.
            {userRole === 'admin' && (
              <DropdownMenuItem onClick={() => handleOpenCreditExpiryDialog(r)}>Alterar Vencimento do Crédito</DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => handleRenewCredit(r)} disabled={!canRenewCredit}>Renovar Revenda</DropdownMenuItem>
            */}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => { setSelectedReseller(r); setNotificationDialogOpen(true); }}>
              <Bell className="mr-2 h-4 w-4" /> Notificar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    });

    return cols;
  }, [userRole, potentialCreators, changingCreator, updatingRole]);

  const stats = useMemo(() => {
    const total = resellers.length;
    const masters = resellers.filter(r => r.role === 'master').length;
    const revendas = resellers.filter(r => r.role === 'reseller').length;
    // [18/02/2026] Estatísticas de status removidas — Status é exclusivo de role 'cliente'. Manter comentadas até segunda ordem.
    // const ativos = resellers.filter(r => r.status === 'active').length;
    // const inativos = resellers.filter(r => r.status === 'inactive').length;
    // const suspensos = resellers.filter(r => r.status === 'suspended').length;
    return { total, masters, revendas };
  }, [resellers]);

  const filteredByCard = useMemo(() => {
    if (!cardFilter) return resellers;
    switch (cardFilter) {
      case 'masters': return resellers.filter(r => r.role === 'master');
      case 'revendas': return resellers.filter(r => r.role === 'reseller');
      // [18/02/2026] Filtros por status removidos — Status é exclusivo de role 'cliente'.
      // case 'ativos': return resellers.filter(r => r.status === 'active');
      // case 'inativos': return resellers.filter(r => r.status === 'inactive');
      // case 'suspensos': return resellers.filter(r => r.status === 'suspended');
      default: return resellers;
    }
  }, [resellers, cardFilter]);

  const filterCards = [
    { key: null, label: 'Total de Revendas', value: stats.total, icon: Users, color: 'text-primary' },
    // [18/02/2026] Cards de Ativos, Inativos e Suspensos removidos — Status é exclusivo de role 'cliente'. Manter comentados até segunda ordem.
    // { key: 'ativos', label: 'Ativos', value: stats.ativos, icon: TrendingUp, color: 'text-emerald-500' },
    // { key: 'inativos', label: 'Inativos', value: stats.inativos, icon: AlertCircle, color: 'text-red-500' },
    // { key: 'suspensos', label: 'Suspensos', value: stats.suspensos, icon: Snowflake, color: 'text-muted-foreground' },
    { key: 'masters', label: 'Masters', value: stats.masters, icon: Crown, color: 'text-yellow-500' },
    { key: 'revendas', label: 'Revendas', value: stats.revendas, icon: Users, color: 'text-cyan-500' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Gerenciar Revendas" />

      <main className="container mx-auto p-4 sm:p-6">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Controle de Revendas</h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              Gerencie os Masters e Revendas do sistema
            </p>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" />
              Nova Revenda
            </Button>
          </div>
        </div>

        {/* Filter Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {filterCards.map(card => {
            const isActive = cardFilter === card.key;
            const Icon = card.icon;
            return (
              <Card
                key={card.key ?? 'total'}
                className={`p-4 cursor-pointer transition-all duration-200 hover:scale-[1.02] ${
                  isActive
                    ? 'ring-2 ring-primary border-primary shadow-[0_0_15px_hsla(210,100%,56%,0.25)]'
                    : 'hover:border-primary/40'
                }`}
                onClick={() => setCardFilter(isActive ? null : card.key)}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground truncate">{card.label}</span>
                  <Icon className={`h-4 w-4 ${card.color} shrink-0`} />
                </div>
                <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              </Card>
            );
          })}
        </div>

        <FilterableSortableTable
          data={filteredByCard}
          columns={resellerColumns}
          loading={loading}
          emptyMessage="Nenhuma revenda encontrada"
          keyExtractor={r => r.id}
          pageSize={10}
        />
      </main>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Revenda</DialogTitle>
            <DialogDescription>Crie uma nova revenda ou master no sistema</DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome Completo</Label>
              <Input id="fullName" {...form.register("fullName")} placeholder="João Silva" className="w-full" />
              {form.formState.errors.fullName && <p className="text-sm text-destructive">{form.formState.errors.fullName.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input id="email" type="email" {...form.register("email")} placeholder="joao@exemplo.com" className="w-full" />
              {form.formState.errors.email && <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input id="password" type="password" {...form.register("password")} placeholder="••••••••" className="w-full" />
              {form.formState.errors.password && <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="resellerRole">Nível</Label>
              <Select onValueChange={(value) => form.setValue("resellerRole", value as "master" | "reseller")} defaultValue="reseller">
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione o nível" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="master">Master</SelectItem>
                  <SelectItem value="reseller">Revenda</SelectItem>
                </SelectContent>
              </Select>
              {form.formState.errors.resellerRole && <p className="text-sm text-destructive">{form.formState.errors.resellerRole.message}</p>}
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={submitting} className="w-full sm:w-auto">Cancelar</Button>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? "Criando..." : "Criar Revenda"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Revenda</DialogTitle>
            <DialogDescription>Atualize as informações da revenda</DialogDescription>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Nome Completo</Label>
              <Input id="edit-fullName" {...editForm.register("fullName")} className="w-full" />
              {editForm.formState.errors.fullName && <p className="text-sm text-destructive">{editForm.formState.errors.fullName.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-email">E-mail</Label>
              <Input id="edit-email" type="email" {...editForm.register("email")} className="w-full" />
              {editForm.formState.errors.email && <p className="text-sm text-destructive">{editForm.formState.errors.email.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-phone">Telefone</Label>
              <Input id="edit-phone" {...editForm.register("phone")} className="w-full" />
              {editForm.formState.errors.phone && <p className="text-sm text-destructive">{editForm.formState.errors.phone.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-password">Nova Senha (opcional)</Label>
              <Input id="edit-password" type="password" {...editForm.register("password")} placeholder="Deixe em branco para manter" className="w-full" />
            </div>

            {/* [18/02/2026] Campos Plano, Valor e Data de Vencimento removidos da UI de revendas.
                Esses campos são exclusivos de role 'cliente'. Manter comentados até segunda ordem.
            
            <div className="space-y-2">
              <Label htmlFor="edit-planId">Plano</Label>
              <Select value={editForm.watch("planId") || ""} onValueChange={(value) => { editForm.setValue("planId", value); }}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                <SelectContent>
                  {planos.map((plano) => (
                    <SelectItem key={plano.id} value={plano.id}>{plano.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-expiryDate">Data de Vencimento</Label>
              <Input id="edit-expiryDate" type="date" {...editForm.register("expiryDate")} className="w-full" />
            </div>
            */}

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)} disabled={submitting} className="w-full sm:w-auto">Cancelar</Button>
              <Button type="submit" disabled={submitting} className="w-full sm:w-auto">{submitting ? "Salvando..." : "Salvar Alterações"}</Button>
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
              Tem certeza que deseja excluir a revenda{" "}
              <strong>{selectedReseller?.full_name}</strong>? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} disabled={submitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {submitting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* [18/02/2026] Dialogs de Renovação de Revenda e Vencimento do Crédito removidos — exclusivos de role 'cliente'. Manter comentados até segunda ordem. */}
      {/*
      <AlertDialog open={renewDialogOpen} onOpenChange={setRenewDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renovar Revenda</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja renovar a revenda <strong>{selectedReseller?.full_name}</strong>?
              Isso adicionará 1 mês ao vencimento do crédito.
              {userRole === 'master' && <span className="block mt-2 text-primary">Custo: 1 crédito (Saldo atual: {userCredits})</span>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={renewingCredit}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onRenewCredit} disabled={renewingCredit || !canRenewCredit}>
              {renewingCredit ? "Renovando..." : "Renovar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={creditExpiryDialogOpen} onOpenChange={setCreditExpiryDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Alterar Vencimento do Crédito</DialogTitle>
            <DialogDescription>Selecione a nova data de vencimento do crédito para <strong>{selectedResellerForCreditExpiry?.full_name}</strong>.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <Calendar mode="single" selected={newCreditExpiryDate} onSelect={setNewCreditExpiryDate} initialFocus />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreditExpiryDialogOpen(false)} disabled={submitting}>Cancelar</Button>
            <Button onClick={onUpdateCreditExpiry} disabled={submitting || !newCreditExpiryDate}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      */}

      {selectedReseller && (
        <NotificationDialog
          open={notificationDialogOpen}
          onOpenChange={setNotificationDialogOpen}
          recipient={{
            id: selectedReseller.user_id,
            name: selectedReseller.full_name || "N/A",
            phone: selectedReseller.phone,
          }}
        />
      )}
    </div>
  );
}
