import { useState, useEffect, Fragment, useMemo } from "react";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Coins, Plus, TrendingDown, TrendingUp, Repeat2, UserCog, Loader2, Search, ArrowUpDown, Filter } from "lucide-react";
import { format } from "date-fns";

interface CreditData {
  balance: number;
}

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
  master_profile?: {
    full_name: string;
  } | null;
  admin_profile?: {
    full_name: string;
  } | null;
  target_user_profile?: { // Added for master-to-master transfers
    full_name: string;
  } | null;
  performed_by_role?: string | null; // Adicionado para armazenar o papel do usuário que realizou a ação
}

interface MasterUser {
  user_id: string;
  full_name: string;
}

interface MasterUserDetail {
  user_id: string;
  full_name: string;
  credit_balance: number;
  last_login_at: string | null;
  role: string;
  created_at: string | null;
}

type SortField = 'full_name' | 'credit_balance' | 'created_at';
type SortDirection = 'asc' | 'desc';

export default function Carteira() {
  const { userRole, user } = useAuth();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCreditsDialogOpen, setAddCreditsDialogOpen] = useState(false);
  const [removeCreditsDialogOpen, setRemoveCreditsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [masterUsers, setMasterUsers] = useState<MasterUser[]>([]); // For admin to select any master
  const [masterCreatedUsers, setMasterCreatedUsers] = useState<MasterUser[]>([]); // For master to select their created masters
  const [selectedMasterId, setSelectedMasterId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [selectedRemoveMasterId, setSelectedRemoveMasterId] = useState("");
  const [removeCreditAmount, setRemoveCreditAmount] = useState("");
  const { toast } = useToast();

  const [masterUsersWithDetails, setMasterUsersWithDetails] = useState<MasterUserDetail[]>([]);
  const [loadingMasterUsers, setLoadingMasterUsers] = useState(true);
  
  // Filters and sorting state
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("full_name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const loadCreditBalance = async () => {
    if (!user) return;

    try {
      if (userRole === 'admin') {
        setCreditBalance(null); // null = ilimitado
        return;
      }

      // Both master and reseller can see their credits
      const { data, error } = await supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setCreditBalance(data?.balance || 0);
    } catch (error: any) {
      console.error('Error loading credit balance:', error);
      toast({
        title: "Erro ao carregar saldo",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const loadTransactions = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      let query = supabase
        .from('credit_transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (userRole !== 'admin') {
        const { data: createdMastersProfiles, error: createdMastersError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('created_by', user.id);

        if (createdMastersError) throw createdMastersError;
        const createdMasterIds = createdMastersProfiles?.map(p => p.user_id) || [];

        const relevantUserIds = [...new Set([user.id, ...createdMasterIds])];

        query = supabase
          .from('credit_transactions')
          .select('*')
          .or(`user_id.in.(${relevantUserIds.join(',')}),and(performed_by.eq.${user.id},related_user_id.in.(${createdMasterIds.join(',')}))`)
          .order('created_at', { ascending: false })
          .limit(100);
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

      // Fetch profiles for these IDs
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', uniqueInvolvedIds);

      if (profilesError) throw profilesError;
      const profileMap = new Map(profilesData?.map(p => [p.user_id, p.full_name]));

      // Fetch user roles for these IDs
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('user_id', uniqueInvolvedIds);

      if (rolesError) throw rolesError;
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
      toast({
        title: "Erro ao carregar histórico",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadMasterUsers = async () => {
    if (userRole !== 'admin') return;

    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .order('full_name', { ascending: true });

      if (profilesError) throw profilesError;

      const usersWithRoles: MasterUser[] = [];
      
      for (const profile of profiles || []) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', profile.user_id)
          .maybeSingle();
        
        // Include both master and reseller users
        if (roleData?.role === 'master' || roleData?.role === 'reseller') {
          usersWithRoles.push({
            user_id: profile.user_id,
            full_name: profile.full_name || "N/A",
          });
        }
      }

      setMasterUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error loading master/reseller users:', error);
    }
  };

  const loadMasterCreatedUsers = async () => {
    // Both master and reseller can transfer credits to users they created
    if ((userRole !== 'master' && userRole !== 'reseller') || !user) return;

    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .eq('created_by', user.id)
        .order('full_name', { ascending: true });

      if (profilesError) throw profilesError;

      const createdUsers: MasterUser[] = [];
      for (const profile of profiles || []) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', profile.user_id)
          .maybeSingle();
        
        // Include master and reseller users (those who can receive credits)
        if (roleData?.role === 'master' || roleData?.role === 'reseller') {
          createdUsers.push({
            user_id: profile.user_id,
            full_name: profile.full_name || "N/A",
          });
        }
      }
      setMasterCreatedUsers(createdUsers);
    } catch (error: any) {
      console.error('Error loading created users:', error);
    }
  };

  const loadMasterUsersWithDetails = async () => {
    if (!user || (userRole !== 'admin' && userRole !== 'master' && userRole !== 'reseller')) {
      setLoadingMasterUsers(false);
      return;
    }
    try {
      setLoadingMasterUsers(true);
      
      if (userRole === 'admin') {
        // Admin: use edge function to get all masters/resellers
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) throw new Error("Não autenticado");

        const { data: result, error } = await supabase.functions.invoke(
          "get-master-user-details",
          { headers: { 'Authorization': `Bearer ${sessionData.session.access_token}` } }
        );
        if (error) throw error;
        if (result?.error) throw new Error(result.error);
        setMasterUsersWithDetails(result.masters || []);
      } else {
        // Master/Reseller: load subordinates (created_by = user.id) with master/reseller role
        const { data: profiles, error: profilesError } = await supabase
          .from('profiles')
          .select('user_id, full_name, created_at')
          .eq('created_by', user.id)
          .order('full_name', { ascending: true });

        if (profilesError) throw profilesError;

        const details: MasterUserDetail[] = [];
        for (const profile of profiles || []) {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', profile.user_id)
            .maybeSingle();

          if (roleData?.role === 'master' || roleData?.role === 'reseller') {
            const { data: creditData } = await supabase
              .from('user_credits')
              .select('balance')
              .eq('user_id', profile.user_id)
              .maybeSingle();

            details.push({
              user_id: profile.user_id,
              full_name: profile.full_name || 'N/A',
              credit_balance: creditData?.balance || 0,
              last_login_at: null,
              role: roleData.role,
              created_at: profile.created_at,
            });
          }
        }
        setMasterUsersWithDetails(details);
      }
    } catch (error: any) {
      console.error('Error loading users with details:', error);
      toast({
        title: "Erro ao carregar usuários",
        description: error.message,
        variant: "destructive",
      });
      setMasterUsersWithDetails([]);
    } finally {
      setLoadingMasterUsers(false);
    }
  };

  useEffect(() => {
    loadCreditBalance();
    loadTransactions();
    if (userRole === 'admin') {
      loadMasterUsers();
    } else if (userRole === 'master' || userRole === 'reseller') {
      loadMasterCreatedUsers();
    }
    if (userRole === 'admin' || userRole === 'master' || userRole === 'reseller') {
      loadMasterUsersWithDetails();
    }
  }, [userRole, user]);

  const handleAddCredits = async () => {
    if (!selectedMasterId || !creditAmount) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione um master e informe a quantidade de créditos",
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

      let result, error;

      if (userRole === 'admin') {
        ({ data: result, error } = await supabase.functions.invoke(
          "manage-credits",
          {
            body: {
              targetUserId: selectedMasterId,
              amount: parseInt(creditAmount),
            },
            headers: {
              'Authorization': `Bearer ${sessionData.session.access_token}`
            }
          }
        ));
      } else if (userRole === 'master') {
        // Client-side check for master's own balance before invoking Edge Function
        if (creditBalance === null || creditBalance < parseInt(creditAmount)) {
          toast({
            title: "Créditos insuficientes",
            description: `Você tem ${creditBalance || 0} créditos, mas precisa de ${creditAmount}.`,
            variant: "destructive",
          });
          setSubmitting(false);
          return;
        }

        ({ data: result, error } = await supabase.functions.invoke(
          "transfer-credits-master-to-master",
          {
            body: {
              targetUserId: selectedMasterId,
              amount: parseInt(creditAmount),
            },
            headers: {
              'Authorization': `Bearer ${sessionData.session.access_token}`
            }
          }
        ));
      } else {
        throw new Error("Ação não permitida para sua função.");
      }

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Créditos adicionados com sucesso!",
        description: `${creditAmount} crédito(s) adicionado(s) com sucesso.`, // Alterado aqui
      });

      setAddCreditsDialogOpen(false);
      setSelectedMasterId("");
      setCreditAmount("");
      loadCreditBalance();
      loadTransactions();
      if (userRole === 'admin') {
        loadMasterUsersWithDetails(); // Refresh master user details
      }
    } catch (error: any) {
      console.error("Error adding credits:", error);
      toast({
        title: "Erro ao adicionar créditos",
        description: error.message || "Ocorreu um erro ao adicionar os créditos",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveCredits = async () => {
    if (!selectedRemoveMasterId || !removeCreditAmount) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione um master e informe a quantidade de créditos",
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

      let result, error;

      if (userRole === 'admin') {
        ({ data: result, error } = await supabase.functions.invoke(
          "manage-credits",
          {
            body: {
              targetUserId: selectedRemoveMasterId,
              amount: -parseInt(removeCreditAmount),
            },
            headers: {
              'Authorization': `Bearer ${sessionData.session.access_token}`
            }
          }
        ));
      } else {
        ({ data: result, error } = await supabase.functions.invoke(
          "transfer-credits-master-to-master",
          {
            body: {
              targetUserId: selectedRemoveMasterId,
              amount: -parseInt(removeCreditAmount),
            },
            headers: {
              'Authorization': `Bearer ${sessionData.session.access_token}`
            }
          }
        ));
      }

      if (error) throw error;

      if (result?.error) {
        throw new Error(result.error);
      }

      toast({
        title: "Créditos removidos com sucesso!",
        description: `${removeCreditAmount} crédito(s) removido(s) de ${result.targetUser}`,
      });

      setRemoveCreditsDialogOpen(false);
      setSelectedRemoveMasterId("");
      setRemoveCreditAmount("");
      loadCreditBalance();
      loadTransactions();
      if (userRole === 'admin') {
        loadMasterUsersWithDetails(); // Refresh master user details
      }
    } catch (error: any) {
      console.error("Error adding credits:", error);
      toast({
        title: "Erro ao adicionar créditos",
        description: error.message || "Ocorreu um erro ao adicionar os créditos",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const creditedTransactions = transactions.filter(t => t.transaction_type === 'credit_added');
  const spentTransactions = transactions.filter(t => t.transaction_type === 'credit_spent');
  
  // Filter for transactions performed by an admin
  const managedCreditsHistory = transactions.filter(t => {
    if (userRole === 'admin') {
      return t.performed_by_role === 'admin';
    }
    return false;
  });

  // New filter for master-to-master transfers
  const masterToMasterTransactions = transactions.filter(t => 
    t.transaction_type === 'credit_spent' && (t.description.startsWith('Transferência para Master') || t.description.startsWith('Transferência para Revenda'))
  );

  // Toggle sort direction or change field
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Filtered and sorted users
  const filteredAndSortedUsers = useMemo(() => {
    let filtered = masterUsersWithDetails;

    // Apply search filter
    if (searchQuery.trim()) {
      filtered = filtered.filter(u => 
        u.full_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply role filter
    if (roleFilter !== 'all') {
      filtered = filtered.filter(u => u.role === roleFilter);
    }

    // Apply sorting
    return [...filtered].sort((a, b) => {
      let comparison = 0;
      
      if (sortField === 'full_name') {
        comparison = a.full_name.localeCompare(b.full_name);
      } else if (sortField === 'credit_balance') {
        comparison = a.credit_balance - b.credit_balance;
      } else if (sortField === 'created_at') {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        comparison = dateA - dateB;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [masterUsersWithDetails, searchQuery, roleFilter, sortField, sortDirection]);

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
              {userRole === 'admin' 
                ? 'Como administrador, você tem créditos ilimitados'
                : 'Seu saldo disponível para criar e renovar usuários'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl sm:text-5xl font-bold text-primary">
                {userRole === 'admin' ? '∞' : creditBalance ?? 0}
              </span>
              <span className="text-lg sm:text-xl text-muted-foreground">
                {userRole === 'admin' ? 'Ilimitado' : 'créditos'}
              </span>
            </div>
            {(userRole === 'admin' || userRole === 'master' || userRole === 'reseller') && (
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button 
                  onClick={() => setAddCreditsDialogOpen(true)}
                  className="w-full sm:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Créditos
                </Button>
                <Button 
                  onClick={() => setRemoveCreditsDialogOpen(true)}
                  variant="destructive"
                  className="w-full sm:w-auto"
                >
                  <Coins className="mr-2 h-4 w-4" />
                  Remover Créditos
                </Button>
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
                {userRole === 'admin'
                  ? 'Visão geral de todos os usuários com nível Master e Revenda no sistema.'
                  : 'Visão geral de todos os usuários com nível Master e Revenda abaixo de você.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters and Search */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={roleFilter} onValueChange={setRoleFilter}>
                    <SelectTrigger className="w-[140px]">
                      <Filter className="mr-2 h-4 w-4" />
                      <SelectValue placeholder="Filtrar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="master">Master</SelectItem>
                      <SelectItem value="reseller">Revenda</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border overflow-x-auto">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 px-2 -ml-2 font-medium hover:bg-accent"
                          onClick={() => handleSort('full_name')}
                        >
                          Nome
                          <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="whitespace-nowrap">Tipo</TableHead>
                      <TableHead className="text-right whitespace-nowrap">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 px-2 font-medium hover:bg-accent"
                          onClick={() => handleSort('credit_balance')}
                        >
                          Créditos
                          <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="whitespace-nowrap">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 px-2 -ml-2 font-medium hover:bg-accent"
                          onClick={() => handleSort('created_at')}
                        >
                          Data Criação
                          <ArrowUpDown className="ml-1 h-3 w-3" />
                        </Button>
                      </TableHead>
                      <TableHead className="whitespace-nowrap">Último Login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingMasterUsers ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <div className="flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : filteredAndSortedUsers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          {searchQuery || roleFilter !== 'all' 
                            ? 'Nenhum usuário encontrado com os filtros aplicados' 
                            : 'Nenhum usuário Master ou Revenda encontrado'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredAndSortedUsers.map((user) => (
                        <TableRow key={user.user_id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {user.full_name}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Badge variant={user.role === 'master' ? 'default' : 'secondary'}>
                              {user.role === 'master' ? 'Master' : 'Revenda'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Badge variant="outline" className="font-mono">
                              {user.credit_balance}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {user.created_at
                              ? format(new Date(user.created_at), 'dd/MM/yyyy')
                              : 'N/A'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {user.last_login_at
                              ? format(new Date(user.last_login_at), 'dd/MM/yyyy HH:mm')
                              : 'Nunca logou'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Results count */}
              {!loadingMasterUsers && (
                <p className="text-sm text-muted-foreground">
                  Exibindo {filteredAndSortedUsers.length} de {masterUsersWithDetails.length} usuários
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Histórico de Créditos Gerenciados por Administradores (Admin only) */}
        {userRole === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-blue-600" />
                Histórico de Créditos Gerenciados por Administradores
              </CardTitle>
              <CardDescription>
                Registro de todas as adições e remoções de créditos feitas por administradores
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead className="whitespace-nowrap">Administrador</TableHead>
                      <TableHead className="whitespace-nowrap">Ação/Descrição</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Quantidade</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Saldo Após</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <div className="flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : managedCreditsHistory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhuma transação de crédito gerenciada registrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      managedCreditsHistory.map((transaction) => {
                        const isAddition = transaction.amount > 0;
                        const targetUserName = transaction.master_profile?.full_name || transaction.user_id;
                        
                        let descriptionText = transaction.description;
                        const performerName = transaction.admin_profile?.full_name || 'Admin';

                        if (transaction.transaction_type === 'credit_added') {
                          descriptionText = `${performerName} adicionou ${transaction.amount} crédito(s) para ${targetUserName}`;
                        } else if (transaction.transaction_type === 'credit_spent') {
                          descriptionText = `${performerName} removeu ${Math.abs(transaction.amount)} crédito(s) de ${targetUserName}`;
                        }

                        return (
                          <TableRow key={transaction.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {transaction.admin_profile?.full_name || 'N/A'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{descriptionText}</TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                              <Badge variant={isAddition ? "default" : "destructive"} className={isAddition ? "bg-green-600" : ""}>
                                {isAddition ? `+${transaction.amount}` : transaction.amount}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-medium whitespace-nowrap">
                              {transaction.balance_after}
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Histórico de Créditos Gerenciados por Masters (Admin only) */}
        {userRole === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Repeat2 className="h-5 w-5 text-purple-600" />
                Histórico de Créditos Gerenciados por Masters
              </CardTitle>
              <CardDescription>
                Registro de todas as transferências de créditos entre usuários Master
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead className="whitespace-nowrap">Master Remetente</TableHead>
                      <TableHead className="whitespace-nowrap">Master Destinatário</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Quantidade</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Saldo Remetente Após</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <div className="flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : masterToMasterTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhuma transferência de crédito entre Masters registrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      masterToMasterTransactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {transaction.master_profile?.full_name || 'N/A'}
                          </TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {transaction.target_user_profile?.full_name || 'N/A'}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Badge variant="destructive">
                              {Math.abs(transaction.amount)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap">
                            {transaction.balance_after}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Créditos Adquiridos (for Masters and Resellers) */}
        {(userRole === 'master' || userRole === 'reseller') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Créditos Adquiridos (Seu Saldo)
              </CardTitle>
              <CardDescription>
                Histórico de créditos adicionados ao seu saldo por administradores ou transferidos para você
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead className="whitespace-nowrap">Descrição</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Quantidade</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Saldo Após</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <div className="flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : creditedTransactions.filter(t => t.user_id === user?.id).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum crédito adquirido ainda
                        </TableCell>
                      </TableRow>
                    ) : (
                      creditedTransactions.filter(t => t.user_id === user?.id).map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm')}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {transaction.description}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Badge 
                              variant={transaction.amount > 0 ? "default" : "destructive"} 
                              className={transaction.amount > 0 ? "bg-green-600" : ""}
                            >
                              {transaction.amount > 0 ? `+${transaction.amount}` : transaction.amount}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium whitespace-nowrap">
                            {transaction.balance_after}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Créditos Gastos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-orange-600" />
              Créditos Gastos
            </CardTitle>
            <CardDescription>
              {userRole === 'admin' 
                ? 'Histórico de gastos de todos os masters'
                : 'Histórico de créditos utilizados em criação, renovação ou transferência'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    {userRole === 'admin' && <TableHead className="whitespace-nowrap">Master</TableHead>}
                    <TableHead className="whitespace-nowrap">Ação/Descrição</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Quantidade</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Saldo Após</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={userRole === 'admin' ? 5 : 4} className="text-center py-8">
                        <div className="flex justify-center">
                          <Loader2 className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                          </div>
                      </TableCell>
                    </TableRow>
                  ) : spentTransactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={userRole === 'admin' ? 5 : 4} className="text-center py-8 text-muted-foreground">
                        Nenhum crédito gasto ainda
                      </TableCell>
                    </TableRow>
                  ) : (
                    spentTransactions.map((transaction) => (
                      <TableRow key={transaction.id}>
                        <TableCell className="whitespace-nowrap">
                          {format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm')}
                        </TableCell>
                        {userRole === 'admin' && (
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {transaction.master_profile?.full_name || 'N/A'}
                          </TableCell>
                        )}
                        <TableCell className="whitespace-nowrap">{transaction.description}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          <Badge variant="destructive">
                            {transaction.amount}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap">
                          {transaction.balance_after}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Add Credits Dialog (Admin and Master) */}
      <Dialog open={addCreditsDialogOpen} onOpenChange={setAddCreditsDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {userRole === 'admin' ? 'Adicionar Créditos' : 'Transferir Créditos'}
            </DialogTitle>
            <DialogDescription>
              {userRole === 'admin'
                ? 'Adicione créditos a um usuário master ou revenda'
                : 'Transfira créditos do seu saldo para um usuário que você criou'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="master">Usuário</Label>
              <Select 
                value={selectedMasterId} 
                onValueChange={setSelectedMasterId}
                disabled={submitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {userRole === 'admin' ? 
                    masterUsers.map((master) => (
                      <SelectItem key={master.user_id} value={master.user_id}>
                        {master.full_name}
                      </SelectItem>
                    ))
                   : 
                    masterCreatedUsers.map((createdUser) => (
                      <SelectItem key={createdUser.user_id} value={createdUser.user_id}>
                        {createdUser.full_name}
                      </SelectItem>
                    ))
                  }
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="amount">Quantidade de Créditos</Label>
              <Input
                id="amount"
                type="number"
                min="1"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="Ex: 10"
                className="w-full"
                disabled={submitting}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAddCreditsDialogOpen(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
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
            <DialogDescription>
              Remova créditos de um usuário Master ou Revenda
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="remove-master">Usuário</Label>
              <Select value={selectedRemoveMasterId} onValueChange={setSelectedRemoveMasterId} disabled={submitting}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {(userRole === 'admin' ? masterUsers : masterCreatedUsers).map((u) => (
                    <SelectItem key={u.user_id} value={u.user_id}>
                      {u.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="remove-amount">Quantidade de Créditos</Label>
              <Input
                id="remove-amount"
                type="number"
                min="1"
                value={removeCreditAmount}
                onChange={(e) => setRemoveCreditAmount(e.target.value)}
                placeholder="Ex: 5"
                className="w-full"
                disabled={submitting}
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveCreditsDialogOpen(false)}
              disabled={submitting}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button 
              onClick={handleRemoveCredits} 
              disabled={submitting || !selectedRemoveMasterId || !removeCreditAmount}
              variant="destructive"
              className="w-full sm:w-auto"
            >
              {submitting ? "Removendo..." : "Remover Créditos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}