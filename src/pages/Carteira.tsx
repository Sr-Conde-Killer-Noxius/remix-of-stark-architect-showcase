import { useState, useEffect, Fragment } from "react";
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
import { Coins, Plus, TrendingDown, TrendingUp, Repeat2, UserCog, Loader2 } from "lucide-react";
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
}

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

  const loadCreditBalance = async () => {
    if (!user || userRole === 'reseller') return;

    try {
      if (userRole === 'admin') {
        setCreditBalance(null); // null = ilimitado
        return;
      }

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

      const mastersWithRoles: MasterUser[] = [];
      
      for (const profile of profiles || []) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', profile.user_id)
          .maybeSingle();
        
        if (roleData?.role === 'master') {
          mastersWithRoles.push({
            user_id: profile.user_id,
            full_name: profile.full_name || "N/A",
          });
        }
      }

      setMasterUsers(mastersWithRoles);
    } catch (error: any) {
      console.error('Error loading master users:', error);
    }
  };

  const loadMasterCreatedUsers = async () => {
    if (userRole !== 'master' || !user) return;

    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .eq('created_by', user.id)
        .order('full_name', { ascending: true });

      if (profilesError) throw profilesError;

      const createdMasters: MasterUser[] = [];
      for (const profile of profiles || []) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', profile.user_id)
          .maybeSingle();
        
        if (roleData?.role === 'master') {
          createdMasters.push({
            user_id: profile.user_id,
            full_name: profile.full_name || "N/A",
          });
        }
      }
      setMasterCreatedUsers(createdMasters);
    } catch (error: any) {
      console.error('Error loading master created users:', error);
    }
  };

  const loadMasterUsersWithDetails = async () => {
    if (userRole !== 'admin' || !user) {
      setLoadingMasterUsers(false);
      return;
    }
    try {
      setLoadingMasterUsers(true);
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        throw new Error("Não autenticado");
      }

      const { data: result, error } = await supabase.functions.invoke(
        "get-master-user-details",
        {
          headers: {
            'Authorization': `Bearer ${sessionData.session.access_token}`
          }
        }
      );

      if (error) throw error;
      if (result?.error) {
        throw new Error(result.error);
      }

      setMasterUsersWithDetails(result.masters || []);
    } catch (error: any) {
      console.error('Error loading master users with details:', error);
      toast({
        title: "Erro ao carregar usuários Master",
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
      loadMasterUsers(); // Keep this for the add/remove dialogs
      loadMasterUsersWithDetails(); // New call for the new section
    } else if (userRole === 'master') {
      loadMasterCreatedUsers();
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

      const { data: result, error } = await supabase.functions.invoke(
        "manage-credits",
        {
          body: {
            targetUserId: selectedRemoveMasterId,
            amount: -parseInt(removeCreditAmount), // Negativo para remover
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
    t.transaction_type === 'credit_spent' && t.description.startsWith('Transferência para Master')
  );

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
            {(userRole === 'admin' || userRole === 'master') && (
              <div className="flex flex-col sm:flex-row gap-2 mt-4">
                <Button 
                  onClick={() => setAddCreditsDialogOpen(true)}
                  className="w-full sm:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Créditos a Master
                </Button>
                {userRole === 'admin' && (
                  <Button 
                    onClick={() => setRemoveCreditsDialogOpen(true)}
                    variant="destructive"
                    className="w-full sm:w-auto"
                  >
                    <Coins className="mr-2 h-4 w-4" />
                    Remover Créditos de Master
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Nova seção para Usuários Masters (apenas para Admin) */}
        {userRole === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-blue-500" />
                Usuários Masters
              </CardTitle>
              <CardDescription>
                Visão geral de todos os usuários com nível Master no sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Nome do Master</TableHead>
                      <TableHead className="text-right whitespace-nowrap">Créditos Atuais</TableHead>
                      <TableHead className="whitespace-nowrap">Último Login</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loadingMasterUsers ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8">
                          <div className="flex justify-center">
                            <Loader2 className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : masterUsersWithDetails.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                          Nenhum usuário Master encontrado
                        </TableCell>
                      </TableRow>
                    ) : (
                      masterUsersWithDetails.map((master) => (
                        <TableRow key={master.user_id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {master.full_name}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <Badge variant="default" className="bg-primary">
                              {master.credit_balance}
                            </Badge>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {master.last_login_at
                              ? format(new Date(master.last_login_at), 'dd/MM/yyyy HH:mm')
                              : 'Nunca logou'}
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

        {/* Créditos Adquiridos (only for Masters) */}
        {userRole === 'master' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-green-600" />
                Créditos Adquiridos (Seu Saldo)
              </CardTitle>
              <CardDescription>
                Histórico de créditos adicionados ao seu saldo por administradores ou transferidos por você
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
                            {transaction.transaction_type === 'credit_added' && transaction.user_id === user?.id && transaction.description.startsWith('Recebido de Master')
                              ? 'Recebido do seu Master'
                              : transaction.description}
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
              {userRole === 'admin' ? 'Adicionar Créditos' : 'Transferir Créditos para Usuário Master'}
            </DialogTitle>
            <DialogDescription>
              {userRole === 'admin'
                ? 'Adicione créditos a um usuário master específico'
                : 'Transfira créditos do seu saldo para um usuário master que você criou'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="master">Usuário Master</Label>
              <Select 
                value={selectedMasterId} 
                onValueChange={setSelectedMasterId}
                disabled={submitting}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione um master" />
                </SelectTrigger>
                <SelectContent>
                  {userRole === 'admin' ? 
                    masterUsers.map((master) => (
                      <SelectItem key={master.user_id} value={master.user_id}>
                        {master.full_name}
                      </SelectItem>
                    ))
                   : 
                    masterCreatedUsers.map((master) => (
                      <SelectItem key={master.user_id} value={master.user_id}>
                        {master.full_name}
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

      {/* Remove Credits Dialog (Admin only) */}
      {userRole === 'admin' && removeCreditsDialogOpen ? ( // Render Dialog only if user is admin AND dialog is open
        <Dialog open={removeCreditsDialogOpen} onOpenChange={setRemoveCreditsDialogOpen}>
          <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Remover Créditos</DialogTitle>
              <DialogDescription>
                Remova créditos de um usuário master específico
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="remove-master">Usuário Master</Label>
                <Select value={selectedRemoveMasterId} onValueChange={setSelectedRemoveMasterId} disabled={submitting}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione um master" />
                  </SelectTrigger>
                  <SelectContent>
                    {masterUsers.map((master) => (
                      <SelectItem key={master.user_id} value={master.user_id}>
                        {master.full_name}
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
              </div> {/* Adicionada a tag </div> que faltava aqui */}
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
      ) : null}
    </div>
  );
}