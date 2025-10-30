import { useState, useEffect } from "react";
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
import { Coins, Plus, TrendingDown, TrendingUp } from "lucide-react";
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
}

interface MasterUser {
  user_id: string;
  full_name: string;
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

      // Admin sees all transactions, Master sees only their own or related to their created masters
      if (userRole !== 'admin') {
        // For master, show transactions where:
        // 1. user_id is the logged-in master (their own spent/added credits)
        // 2. user_id is one of their created masters (credits added/spent by sub-masters, or managed by admin for sub-masters)
        // 3. performed_by is the logged-in master AND related_user_id is one of their created masters (their own transfers to sub-masters)

        // First, get IDs of masters created by the logged-in master
        const { data: createdMastersProfiles, error: createdMastersError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('created_by', user.id);

        if (createdMastersError) throw createdMastersError;
        const createdMasterIds = createdMastersProfiles?.map(p => p.user_id) || [];

        const relevantUserIds = [user.id, ...createdMasterIds];

        query = supabase
          .from('credit_transactions')
          .select('*')
          .or(`user_id.in.(${relevantUserIds.join(',')}),and(performed_by.eq.${user.id},related_user_id.in.(${createdMasterIds.join(',')}))`)
          .order('created_at', { ascending: false })
          .limit(100);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch profiles for all relevant user_ids, performed_by, and related_user_id
      const allInvolvedIds = [...new Set([
        ...(data?.map(t => t.user_id) || []),
        ...(data?.map(t => t.performed_by).filter(Boolean) || []),
        ...(data?.map(t => t.related_user_id).filter(Boolean) || [])
      ])];
      
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', allInvolvedIds);

      if (!profilesError && profiles) {
        const profileMap = new Map(profiles.map(p => [p.user_id, p.full_name]));
        
        const transactionsWithProfiles = data.map(t => ({
          ...t,
          master_profile: { full_name: profileMap.get(t.user_id) || 'N/A' }, // User who received/spent the credit
          admin_profile: t.performed_by ? { full_name: profileMap.get(t.performed_by) || 'N/A' } : null, // User who performed the action (admin or master)
          target_user_profile: t.related_user_id ? { full_name: profileMap.get(t.related_user_id) || 'N/A' } : null, // Related user (e.g., target of transfer)
        }));
        
        setTransactions(transactionsWithProfiles);
        return;
      }

      setTransactions(data || []);
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

  useEffect(() => {
    loadCreditBalance();
    loadTransactions();
    if (userRole === 'admin') {
      loadMasterUsers();
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
        description: `${creditAmount} crédito(s) adicionado(s) a ${result.targetUser || selectedMasterId}`,
      });

      setAddCreditsDialogOpen(false);
      setSelectedMasterId("");
      setCreditAmount("");
      loadCreditBalance();
      loadTransactions();
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
  
  // For admin, show all credit_added transactions where performed_by is not null (i.e., admin added it)
  // For master, show credit_added transactions where user_id is one of their created masters AND performed_by is not the logged-in master
  const managedCreditsHistory = transactions.filter(t => {
    if (userRole === 'admin') {
      return t.transaction_type === 'credit_added' && t.performed_by;
    } else if (userRole === 'master' && user) {
      const isForCreatedMaster = masterCreatedUsers.some(m => m.user_id === t.user_id);
      const isPerformedByAdmin = t.performed_by && t.performed_by !== user.id;
      const isTransferFromMe = t.performed_by === user.id && t.transaction_type === 'credit_added' && t.related_user_id === user.id; // This should not happen with current logic, but for completeness
      
      return (isForCreatedMaster && isPerformedByAdmin) || (t.performed_by === user.id && t.related_user_id && masterCreatedUsers.some(m => m.user_id === t.related_user_id));
    }
    return false;
  });

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Carteira de Créditos" />

      <main className="container mx-auto p-4 sm:p-6 space-y-6"> {/* Ajustado padding */}
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
              <span className="text-4xl sm:text-5xl font-bold text-primary"> {/* Ajustado tamanho da fonte */}
                {userRole === 'admin' ? '∞' : creditBalance ?? 0}
              </span>
              <span className="text-lg sm:text-xl text-muted-foreground"> {/* Ajustado tamanho da fonte */}
                {userRole === 'admin' ? 'Ilimitado' : 'créditos'}
              </span>
            </div>
            {(userRole === 'admin' || userRole === 'master') && (
              <div className="flex flex-col sm:flex-row gap-2 mt-4"> {/* Empilhado em telas pequenas */}
                <Button 
                  onClick={() => setAddCreditsDialogOpen(true)}
                  className="w-full sm:w-auto"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar Créditos a Master
                </Button>
                {userRole === 'admin' && ( // Only admin can remove credits
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

        {/* Histórico de Créditos Gerenciados (Admin: todos, Master: seus sub-masters) */}
        {(userRole === 'admin' || userRole === 'master') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-blue-600" />
                {userRole === 'admin' ? 'Histórico de Créditos Gerenciados por Administradores' : 'Histórico de Créditos de Suas Revendas Master'}
              </CardTitle>
              <CardDescription>
                {userRole === 'admin' 
                  ? 'Registro de todas as adições e remoções de créditos feitas por administradores'
                  : 'Registro de créditos adicionados/removidos para suas revendas master, ou transferidos por você'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto"> {/* Adicionado overflow-x-auto */}
                <Table className="min-w-max"> {/* Adicionado min-w-max */}
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead className="whitespace-nowrap">{userRole === 'admin' ? 'Administrador' : 'Iniciador'}</TableHead>
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
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
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
                        const targetUserName = transaction.target_user_profile?.full_name || transaction.related_user_id || 'N/A';
                        const initiatorName = transaction.admin_profile?.full_name || transaction.master_profile?.full_name || 'N/A';
                        
                        let descriptionText = transaction.description;
                        if (userRole === 'master' && transaction.transaction_type === 'credit_added' && transaction.performed_by !== user?.id) {
                          descriptionText = `Recebido de Admin para ${transaction.master_profile?.full_name || transaction.user_id}`;
                        } else if (userRole === 'master' && transaction.transaction_type === 'credit_added' && transaction.performed_by === user?.id) {
                          descriptionText = `Transferido por você para ${transaction.master_profile?.full_name || transaction.user_id}`;
                        } else if (userRole === 'master' && transaction.transaction_type === 'credit_spent' && transaction.performed_by === user?.id) {
                          descriptionText = `Transferido por você para ${targetUserName}`;
                        }

                        return (
                          <TableRow key={transaction.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {initiatorName}
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
              <div className="rounded-lg border overflow-x-auto"> {/* Adicionado overflow-x-auto */}
                <Table className="min-w-max"> {/* Adicionado min-w-max */}
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
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
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
                          <TableCell className="whitespace-nowrap">{transaction.description}</TableCell>
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
            <div className="rounded-lg border overflow-x-auto"> {/* Adicionado overflow-x-auto */}
              <Table className="min-w-max"> {/* Adicionado min-w-max */}
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data</TableHead>
                    <TableHead className="whitespace-nowrap">Ação/Descrição</TableHead>
                    {userRole === 'admin' && <TableHead className="whitespace-nowrap">Master</TableHead>}
                    <TableHead className="text-right whitespace-nowrap">Quantidade</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Saldo Após</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={userRole === 'admin' ? 5 : 4} className="text-center py-8">
                        <div className="flex justify-center">
                          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
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
                        <TableCell className="whitespace-nowrap">{transaction.description}</TableCell>
                        {userRole === 'admin' && (
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {transaction.master_profile?.full_name || 'N/A'}
                          </TableCell>
                        )}
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
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <DialogHeader>
            <DialogTitle>
              {userRole === 'admin' ? 'Adicionar Créditos' : 'Transferir Créditos para Revenda Master'}
            </DialogTitle>
            <DialogDescription>
              {userRole === 'admin' 
                ? 'Adicione créditos a um usuário master específico'
                : 'Transfira créditos do seu saldo para uma revenda master que você criou'}
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
                  {userRole === 'admin' ? (
                    masterUsers.map((master) => (
                      <SelectItem key={master.user_id} value={master.user_id}>
                        {master.full_name}
                      </SelectItem>
                    ))
                  ) : (
                    masterCreatedUsers.map((master) => (
                      <SelectItem key={master.user_id} value={master.user_id}>
                        {master.full_name}
                      </SelectItem>
                    ))
                  )}
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

          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2"> {/* Empilhado em telas pequenas */}
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
      {userRole === 'admin' && (
        <Dialog open={removeCreditsDialogOpen} onOpenChange={setRemoveCreditsDialogOpen}>
          <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
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
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2"> {/* Empilhado em telas pequenas */}
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
      )}
    </div>
  );
}