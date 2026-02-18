import { useState, useEffect, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Coins, Plus, TrendingDown, TrendingUp, Repeat2, UserCog, ShoppingCart, Infinity } from "lucide-react";
import { format } from "date-fns";
import { BuyCreditsDialog } from "@/components/BuyCreditsDialog";
import { FilterableSortableTable, ColumnDef } from "@/components/FilterableSortableTable";

interface Transaction {
  id: string;
  transaction_type: string;
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
  performed_by: string;
  related_user_id: string | null;
  user_id: string;
  master_profile?: { full_name: string } | null;
  admin_profile?: { full_name: string } | null;
  target_user_profile?: { full_name: string } | null;
  performed_by_role?: string | null;
}

interface MasterUser {
  user_id: string;
  full_name: string;
}

interface MasterUserDetail {
  user_id: string;
  full_name: string;
  credit_balance: number;
  is_unlimited: boolean;
  last_login_at: string | null;
  role: string;
  created_at: string | null;
}

export default function Carteira() {
  const { userRole, user } = useAuth();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCreditsDialogOpen, setAddCreditsDialogOpen] = useState(false);
  const [removeCreditsDialogOpen, setRemoveCreditsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [masterUsers, setMasterUsers] = useState<MasterUser[]>([]);
  const [masterCreatedUsers, setMasterCreatedUsers] = useState<MasterUser[]>([]);
  const [selectedMasterId, setSelectedMasterId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [selectedRemoveMasterId, setSelectedRemoveMasterId] = useState("");
  const [removeCreditAmount, setRemoveCreditAmount] = useState("");
  const { toast } = useToast();

  const [masterUsersWithDetails, setMasterUsersWithDetails] = useState<MasterUserDetail[]>([]);
  const [loadingMasterUsers, setLoadingMasterUsers] = useState(true);

  // Buy credits (Mercado Pago)
  const [buyCreditsOpen, setBuyCreditsOpen] = useState(false);
  const [superiorMpConfig, setSuperiorMpConfig] = useState<{ unit_price: number; is_active: boolean } | null>(null);

  const loadCreditBalance = async () => {
    if (!user) return;
    try {
      if (userRole === 'admin') {
        setCreditBalance(null);
        setIsUnlimited(true);
        return;
      }
      const { data, error } = await supabase.from('user_credits').select('balance, is_unlimited').eq('user_id', user.id).maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      setIsUnlimited(data?.is_unlimited || false);
      if (data?.is_unlimited) { setCreditBalance(null); } else { setCreditBalance(data?.balance || 0); }
    } catch (error: any) {
      console.error('Error loading credit balance:', error);
      toast({ title: "Erro ao carregar saldo", description: error.message, variant: "destructive" });
    }
  };

  const loadTransactions = async () => {
    if (!user) return;
    try {
      setLoading(true);
      let query = supabase.from('credit_transactions').select('*').order('created_at', { ascending: false }).limit(100);
      if (userRole !== 'admin') {
        const { data: createdMastersProfiles, error: createdMastersError } = await supabase.from('profiles').select('user_id').eq('created_by', user.id);
        if (createdMastersError) throw createdMastersError;
        const createdMasterIds = createdMastersProfiles?.map(p => p.user_id) || [];
        const relevantUserIds = [...new Set([user.id, ...createdMasterIds])];
        query = supabase.from('credit_transactions').select('*')
          .or(`user_id.in.(${relevantUserIds.join(',')}),and(performed_by.eq.${user.id},related_user_id.in.(${createdMasterIds.join(',')}))`)
          .order('created_at', { ascending: false }).limit(100);
      }
      const { data: transactionsData, error: transactionsError } = await query;
      if (transactionsError) throw transactionsError;

      const allInvolvedIds = new Set<string>();
      transactionsData?.forEach(t => {
        allInvolvedIds.add(t.user_id);
        if (t.performed_by) allInvolvedIds.add(t.performed_by);
        if (t.related_user_id) allInvolvedIds.add(t.related_user_id);
      });
      const uniqueInvolvedIds = Array.from(allInvolvedIds);
      const { data: profilesData } = await supabase.from('profiles').select('user_id, full_name').in('user_id', uniqueInvolvedIds);
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]));
      const { data: rolesData } = await supabase.from('user_roles').select('user_id, role').in('user_id', uniqueInvolvedIds);
      const roleMap = new Map(rolesData?.map(r => [r.user_id, r.role]));
      
      const transactionsWithProfiles = transactionsData.map(t => ({
        ...t,
        master_profile: { full_name: profileMap.get(t.user_id) || 'N/A' },
        admin_profile: t.performed_by ? { full_name: profileMap.get(t.performed_by) || 'N/A' } : null,
        target_user_profile: t.related_user_id ? { full_name: profileMap.get(t.related_user_id) || 'N/A' } : null,
        performed_by_role: t.performed_by ? roleMap.get(t.performed_by) : null,
      }));
      setTransactions(transactionsWithProfiles);
    } catch (error: any) {
      console.error('Error loading transactions:', error);
      toast({ title: "Erro ao carregar histórico", description: error.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const loadMasterUsers = async () => {
    if (userRole !== 'admin') return;
    try {
      const { data: rolesData } = await supabase.from('user_roles').select('user_id, role').in('role', ['master', 'reseller']);
      if (!rolesData?.length) { setMasterUsers([]); return; }
      const userIds = rolesData.map(r => r.user_id);
      const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds).order('full_name', { ascending: true });
      setMasterUsers((profiles || []).map(p => ({ user_id: p.user_id, full_name: p.full_name || "N/A" })));
    } catch (error: any) { console.error('Error loading master/reseller users:', error); }
  };

  const loadMasterCreatedUsers = async () => {
    if ((userRole !== 'master' && userRole !== 'reseller') || !user) return;
    try {
      const { data: profiles, error: profilesError } = await supabase.from('profiles').select('user_id, full_name').eq('created_by', user.id).order('full_name', { ascending: true });
      if (profilesError) throw profilesError;
      if (!profiles?.length) { setMasterCreatedUsers([]); return; }
      const userIds = profiles.map(p => p.user_id);
      const { data: rolesData } = await supabase.from('user_roles').select('user_id, role').in('user_id', userIds).in('role', ['master', 'reseller']);
      const roleSet = new Set(rolesData?.map(r => r.user_id) || []);
      setMasterCreatedUsers(profiles.filter(p => roleSet.has(p.user_id)).map(p => ({ user_id: p.user_id, full_name: p.full_name || "N/A" })));
    } catch (error: any) { console.error('Error loading created users:', error); }
  };

  const loadMasterUsersWithDetails = async () => {
    if (!user || (userRole !== 'admin' && userRole !== 'master' && userRole !== 'reseller')) { setLoadingMasterUsers(false); return; }
    try {
      setLoadingMasterUsers(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Não autenticado");
      const { data: result, error } = await supabase.functions.invoke("get-master-user-details", { headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` } });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      setMasterUsersWithDetails(result.masters || []);
    } catch (error: any) {
      console.error('Error loading users with details:', error);
      toast({ title: "Erro ao carregar usuários", description: error.message, variant: "destructive" });
      setMasterUsersWithDetails([]);
    } finally { setLoadingMasterUsers(false); }
  };

  const loadSuperiorMpConfig = async () => {
    if (!user || userRole === 'admin') return;
    try {
      const { data: profile } = await supabase.from('profiles').select('created_by').eq('user_id', user.id).maybeSingle();
      if (!profile?.created_by) return;
      const { data: mpConfig } = await supabase.from('mercado_pago_configs').select('unit_price, is_active').eq('user_id', profile.created_by).eq('is_active', true).maybeSingle();
      setSuperiorMpConfig(mpConfig);
    } catch (error) { console.error('Error checking superior MP config:', error); }
  };

  useEffect(() => {
    loadCreditBalance();
    loadTransactions();
    loadSuperiorMpConfig();
    if (userRole === 'admin') { loadMasterUsers(); } else if (userRole === 'master' || userRole === 'reseller') { loadMasterCreatedUsers(); }
    if (userRole === 'admin' || userRole === 'master' || userRole === 'reseller') { loadMasterUsersWithDetails(); }
  }, [userRole, user]);

  const handleAddCredits = async () => {
    if (!selectedMasterId || !creditAmount) { toast({ title: "Campos obrigatórios", description: "Selecione um master e informe a quantidade de créditos", variant: "destructive" }); return; }
    try {
      setSubmitting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Não autenticado");
      let result, error;
      if (userRole === 'admin') {
        ({ data: result, error } = await supabase.functions.invoke("manage-credits", { body: { targetUserId: selectedMasterId, amount: parseInt(creditAmount) }, headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` } }));
      } else if (userRole === 'master' || userRole === 'reseller') {
        if (creditBalance === null || creditBalance < parseInt(creditAmount)) { toast({ title: "Créditos insuficientes", description: `Você tem ${creditBalance || 0} créditos, mas precisa de ${creditAmount}.`, variant: "destructive" }); setSubmitting(false); return; }
        ({ data: result, error } = await supabase.functions.invoke("transfer-credits-master-to-master", { body: { targetUserId: selectedMasterId, amount: parseInt(creditAmount) }, headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` } }));
      } else { throw new Error("Ação não permitida para sua função."); }
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: "Créditos adicionados com sucesso!", description: `${creditAmount} crédito(s) adicionado(s) com sucesso.` });
      setAddCreditsDialogOpen(false); setSelectedMasterId(""); setCreditAmount("");
      loadCreditBalance(); loadTransactions(); loadMasterUsersWithDetails();
    } catch (error: any) {
      console.error("Error adding credits:", error);
      toast({ title: "Erro ao adicionar créditos", description: error.message || "Ocorreu um erro ao adicionar os créditos", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleRemoveCredits = async () => {
    if (!selectedRemoveMasterId || !removeCreditAmount) { toast({ title: "Campos obrigatórios", description: "Selecione um master e informe a quantidade de créditos", variant: "destructive" }); return; }
    try {
      setSubmitting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Não autenticado");
      let result, error;
      if (userRole === 'admin') {
        ({ data: result, error } = await supabase.functions.invoke("manage-credits", { body: { targetUserId: selectedRemoveMasterId, amount: -parseInt(removeCreditAmount) }, headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` } }));
      } else {
        ({ data: result, error } = await supabase.functions.invoke("transfer-credits-master-to-master", { body: { targetUserId: selectedRemoveMasterId, amount: -parseInt(removeCreditAmount) }, headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` } }));
      }
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: "Créditos removidos com sucesso!", description: `${removeCreditAmount} crédito(s) removido(s) de ${result.targetUser}` });
      setRemoveCreditsDialogOpen(false); setSelectedRemoveMasterId(""); setRemoveCreditAmount("");
      loadCreditBalance(); loadTransactions(); loadMasterUsersWithDetails();
    } catch (error: any) {
      console.error("Error adding credits:", error);
      toast({ title: "Erro ao adicionar créditos", description: error.message || "Ocorreu um erro ao adicionar os créditos", variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const handleToggleUnlimited = async (targetUserId: string, setUnlimitedValue: boolean) => {
    try {
      setSubmitting(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Não autenticado");
      const { data: result, error } = await supabase.functions.invoke("manage-credits", { body: { targetUserId, setUnlimited: setUnlimitedValue }, headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` } });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);
      toast({ title: setUnlimitedValue ? "Créditos definidos como Ilimitado!" : "Créditos Ilimitado removido!", description: `${result.targetUser} agora tem créditos ${setUnlimitedValue ? 'ilimitados' : 'limitados'}.` });
      loadMasterUsersWithDetails(); loadTransactions();
    } catch (error: any) {
      console.error("Error toggling unlimited:", error);
      toast({ title: "Erro ao alterar créditos", description: error.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const managedCreditsHistory = useMemo(() => transactions.filter(t => userRole === 'admin' && t.performed_by_role === 'admin'), [transactions, userRole]);
  const masterToMasterTransactions = useMemo(() => transactions.filter(t => t.transaction_type === 'credit_spent' && (t.description.startsWith('Transferência para Master') || t.description.startsWith('Transferência para Revenda'))), [transactions]);
  const myCreditedTransactions = useMemo(() => transactions.filter(t => t.transaction_type === 'credit_added' && t.user_id === user?.id), [transactions, user]);
  const spentTransactions = useMemo(() => transactions.filter(t => t.transaction_type === 'credit_spent'), [transactions]);

  const usersColumns: ColumnDef<MasterUserDetail>[] = useMemo(() => {
    const cols: ColumnDef<MasterUserDetail>[] = [
      { key: 'full_name', header: 'Nome', accessor: r => r.full_name, render: r => <span className="font-medium">{r.full_name}</span> },
      { key: 'role', header: 'Tipo', accessor: r => r.role, filterType: 'select', filterOptions: [{ label: 'Master', value: 'master' }, { label: 'Revenda', value: 'reseller' }], render: r => <Badge variant={r.role === 'master' ? 'default' : 'secondary'}>{r.role === 'master' ? 'Master' : 'Revenda'}</Badge> },
      { key: 'credit_balance', header: 'Créditos', accessor: r => r.is_unlimited ? Infinity : r.credit_balance, align: 'right', render: r => <Badge variant="outline" className="font-mono">{r.is_unlimited ? '∞ Ilimitado' : r.credit_balance}</Badge> },
      { key: 'created_at', header: 'Data Criação', accessor: r => r.created_at || '', render: r => r.created_at ? format(new Date(r.created_at), 'dd/MM/yyyy') : 'N/A' },
      { key: 'last_login_at', header: 'Último Login', accessor: r => r.last_login_at || '', render: r => r.last_login_at ? format(new Date(r.last_login_at), 'dd/MM/yyyy HH:mm') : 'Nunca logou' },
    ];
    if (userRole === 'admin') {
      cols.push({
        key: 'actions', header: 'Ações', accessor: () => '', sortable: false, filterable: false, align: 'right',
        render: r => (
          <Button variant={r.is_unlimited ? 'default' : 'outline'} size="sm" onClick={() => handleToggleUnlimited(r.user_id, !r.is_unlimited)} disabled={submitting} title={r.is_unlimited ? 'Remover ilimitado' : 'Definir como ilimitado'}>
            <Infinity className="h-4 w-4" />
          </Button>
        ),
      });
    }
    return cols;
  }, [userRole, submitting]);

  const adminHistoryColumns: ColumnDef<Transaction>[] = useMemo(() => [
    { key: 'created_at', header: 'Data', accessor: r => r.created_at, render: r => format(new Date(r.created_at), 'dd/MM/yyyy HH:mm') },
    { key: 'admin', header: 'Administrador', accessor: r => r.admin_profile?.full_name || 'N/A', render: r => <span className="font-medium">{r.admin_profile?.full_name || 'N/A'}</span> },
    { key: 'description', header: 'Ação/Descrição', accessor: r => {
      const performerName = r.admin_profile?.full_name || 'Admin';
      const targetUserName = r.master_profile?.full_name || r.user_id;
      if (r.transaction_type === 'credit_added') return `${performerName} adicionou ${r.amount} crédito(s) para ${targetUserName}`;
      if (r.transaction_type === 'credit_spent') return `${performerName} removeu ${Math.abs(r.amount)} crédito(s) de ${targetUserName}`;
      return r.description;
    }},
    { key: 'amount', header: 'Quantidade', accessor: r => r.amount, align: 'right', render: r => <Badge variant={r.amount > 0 ? "success" : "destructive"}>{r.amount > 0 ? `+${r.amount}` : r.amount}</Badge> },
    { key: 'balance_after', header: 'Saldo Após', accessor: r => r.balance_after, align: 'right', render: r => <span className="font-medium">{r.balance_after}</span> },
  ], []);

  const masterTransferColumns: ColumnDef<Transaction>[] = useMemo(() => [
    { key: 'created_at', header: 'Data', accessor: r => r.created_at, render: r => format(new Date(r.created_at), 'dd/MM/yyyy HH:mm') },
    { key: 'sender', header: 'Master Remetente', accessor: r => r.master_profile?.full_name || 'N/A', render: r => <span className="font-medium">{r.master_profile?.full_name || 'N/A'}</span> },
    { key: 'receiver', header: 'Master Destinatário', accessor: r => r.target_user_profile?.full_name || 'N/A', render: r => <span className="font-medium">{r.target_user_profile?.full_name || 'N/A'}</span> },
    { key: 'amount', header: 'Quantidade', accessor: r => Math.abs(r.amount), align: 'right', render: r => <Badge variant="destructive">{Math.abs(r.amount)}</Badge> },
    { key: 'balance_after', header: 'Saldo Remetente Após', accessor: r => r.balance_after, align: 'right', render: r => <span className="font-medium">{r.balance_after}</span> },
  ], []);

  const creditedColumns: ColumnDef<Transaction>[] = useMemo(() => [
    { key: 'created_at', header: 'Data', accessor: r => r.created_at, render: r => format(new Date(r.created_at), 'dd/MM/yyyy HH:mm') },
    { key: 'description', header: 'Descrição', accessor: r => r.description },
    { key: 'amount', header: 'Quantidade', accessor: r => r.amount, align: 'right', render: r => <Badge variant={r.amount > 0 ? "success" : "destructive"}>{r.amount > 0 ? `+${r.amount}` : r.amount}</Badge> },
    { key: 'balance_after', header: 'Saldo Após', accessor: r => r.balance_after, align: 'right', render: r => <span className="font-medium">{r.balance_after}</span> },
  ], []);

  const spentColumns: ColumnDef<Transaction>[] = useMemo(() => {
    const cols: ColumnDef<Transaction>[] = [
      { key: 'created_at', header: 'Data', accessor: r => r.created_at, render: r => format(new Date(r.created_at), 'dd/MM/yyyy HH:mm') },
    ];
    if (userRole === 'admin') {
      cols.push({ key: 'master', header: 'Master', accessor: r => r.master_profile?.full_name || 'N/A', render: r => <span className="text-muted-foreground">{r.master_profile?.full_name || 'N/A'}</span> });
    }
    cols.push(
      { key: 'description', header: 'Ação/Descrição', accessor: r => r.description },
      { key: 'amount', header: 'Quantidade', accessor: r => r.amount, align: 'right', render: r => <Badge variant="destructive">{r.amount}</Badge> },
      { key: 'balance_after', header: 'Saldo Após', accessor: r => r.balance_after, align: 'right', render: r => <span className="font-medium">{r.balance_after}</span> },
    );
    return cols;
  }, [userRole]);

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Carteira de Créditos" />

      <main className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Saldo Card */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-background">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-6 w-6 text-primary" />
              Saldo Atual
            </CardTitle>
            <CardDescription>
              {userRole === 'admin' ? 'Como administrador, você tem créditos ilimitados' : isUnlimited ? 'Seus créditos foram definidos como ilimitados' : 'Seu saldo disponível para criar e renovar usuários'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-bold text-primary">
                {(userRole === 'admin' || isUnlimited) ? '∞' : creditBalance ?? 0}
              </span>
              <span className="text-lg sm:text-xl text-muted-foreground">
                {(userRole === 'admin' || isUnlimited) ? 'Ilimitado' : 'créditos'}
              </span>
            </div>
            {(userRole === 'admin' || userRole === 'master' || userRole === 'reseller') && (
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button onClick={() => setAddCreditsDialogOpen(true)} className="w-full sm:w-auto">
                  <Plus className="mr-2 h-4 w-4" /> Adicionar Créditos
                </Button>
                <Button onClick={() => setRemoveCreditsDialogOpen(true)} variant="destructive" className="w-full sm:w-auto">
                  <Coins className="mr-2 h-4 w-4" /> Remover Créditos
                </Button>
                {superiorMpConfig && (
                  <Button onClick={() => setBuyCreditsOpen(true)} variant="outline" className="w-full sm:w-auto border-primary/50 text-primary hover:bg-primary/10">
                    <ShoppingCart className="mr-2 h-4 w-4" /> Comprar Créditos
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Seção Usuários Masters e Revendas */}
        {(userRole === 'admin' || userRole === 'master' || userRole === 'reseller') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" />
                Usuários Masters e Revendas
              </CardTitle>
              <CardDescription>
                {userRole === 'admin' ? 'Visão geral de todos os usuários com nível Master e Revenda no sistema.' : 'Visão geral de todos os usuários com nível Master e Revenda abaixo de você.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FilterableSortableTable
                data={masterUsersWithDetails}
                columns={usersColumns}
                loading={loadingMasterUsers}
                emptyMessage="Nenhum usuário Master ou Revenda encontrado"
                keyExtractor={r => r.user_id}
                pageSize={10}
              />
            </CardContent>
          </Card>
        )}

        {/* Histórico de Créditos Gerenciados por Administradores */}
        {userRole === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-primary" />
                Histórico de Créditos Gerenciados por Administradores
              </CardTitle>
              <CardDescription>Registro de todas as adições e remoções de créditos feitas por administradores</CardDescription>
            </CardHeader>
            <CardContent>
              <FilterableSortableTable
                data={managedCreditsHistory}
                columns={adminHistoryColumns}
                loading={loading}
                emptyMessage="Nenhuma transação de crédito gerenciada registrada"
                keyExtractor={r => r.id}
                pageSize={10}
              />
            </CardContent>
          </Card>
        )}

        {/* Histórico de Créditos Gerenciados por Masters */}
        {userRole === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat2 className="h-5 w-5 text-primary" />
                Histórico de Créditos Gerenciados por Masters
              </CardTitle>
              <CardDescription>Registro de todas as transferências de créditos entre usuários Master</CardDescription>
            </CardHeader>
            <CardContent>
              <FilterableSortableTable
                data={masterToMasterTransactions}
                columns={masterTransferColumns}
                loading={loading}
                emptyMessage="Nenhuma transferência de crédito entre Masters registrada"
                keyExtractor={r => r.id}
                pageSize={10}
              />
            </CardContent>
          </Card>
        )}

        {/* Créditos Adquiridos */}
        {(userRole === 'master' || userRole === 'reseller') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-success" />
                Créditos Adquiridos (Seu Saldo)
              </CardTitle>
              <CardDescription>Histórico de créditos adicionados ao seu saldo por administradores ou transferidos para você</CardDescription>
            </CardHeader>
            <CardContent>
              <FilterableSortableTable
                data={myCreditedTransactions}
                columns={creditedColumns}
                loading={loading}
                emptyMessage="Nenhum crédito adquirido ainda"
                keyExtractor={r => r.id}
                pageSize={10}
              />
            </CardContent>
          </Card>
        )}

        {/* Créditos Gastos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-warning" />
              Créditos Gastos
            </CardTitle>
            <CardDescription>
              {userRole === 'admin' ? 'Histórico de gastos de todos os masters' : 'Histórico de créditos utilizados em criação, renovação ou transferência'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FilterableSortableTable
              data={spentTransactions}
              columns={spentColumns}
              loading={loading}
              emptyMessage="Nenhum crédito gasto ainda"
              keyExtractor={r => r.id}
              pageSize={10}
            />
          </CardContent>
        </Card>
      </main>

      {/* Add Credits Dialog */}
      <Dialog open={addCreditsDialogOpen} onOpenChange={setAddCreditsDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{userRole === 'admin' ? 'Adicionar Créditos' : 'Transferir Créditos'}</DialogTitle>
            <DialogDescription>{userRole === 'admin' ? 'Adicione créditos a um usuário master ou revenda' : 'Transfira créditos do seu saldo para um usuário que você criou'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="master">Usuário</Label>
              <Select value={selectedMasterId} onValueChange={setSelectedMasterId} disabled={submitting}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                <SelectContent>
                  {(userRole === 'admin' ? masterUsers : masterCreatedUsers).map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>{m.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Quantidade de Créditos</Label>
              <Input id="amount" type="number" min="1" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} placeholder="Ex: 10" className="w-full" disabled={submitting} />
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setAddCreditsDialogOpen(false)} disabled={submitting} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleAddCredits} disabled={submitting || !selectedMasterId || !creditAmount}>
              {submitting ? "Processando..." : (userRole === 'admin' ? "Adicionar Créditos" : "Transferir Créditos")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Credits Dialog */}
      <Dialog open={removeCreditsDialogOpen} onOpenChange={setRemoveCreditsDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Remover Créditos</DialogTitle>
            <DialogDescription>Remova créditos de um usuário Master ou Revenda</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="remove-master">Usuário</Label>
              <Select value={selectedRemoveMasterId} onValueChange={setSelectedRemoveMasterId} disabled={submitting}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                <SelectContent>
                  {(userRole === 'admin' ? masterUsers : masterCreatedUsers).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="remove-amount">Quantidade de Créditos</Label>
              <Input id="remove-amount" type="number" min="1" value={removeCreditAmount} onChange={(e) => setRemoveCreditAmount(e.target.value)} placeholder="Ex: 5" className="w-full" disabled={submitting} />
            </div>
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRemoveCreditsDialogOpen(false)} disabled={submitting} className="w-full sm:w-auto">Cancelar</Button>
            <Button onClick={handleRemoveCredits} disabled={submitting || !selectedRemoveMasterId || !removeCreditAmount} variant="destructive" className="w-full sm:w-auto">
              {submitting ? "Removendo..." : "Remover Créditos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Buy Credits Dialog */}
      {superiorMpConfig && (
        <BuyCreditsDialog
          open={buyCreditsOpen}
          onOpenChange={setBuyCreditsOpen}
          onSuccess={() => { loadCreditBalance(); loadTransactions(); }}
          unitPrice={Number(superiorMpConfig.unit_price)}
        />
      )}
    </div>
  );
}
