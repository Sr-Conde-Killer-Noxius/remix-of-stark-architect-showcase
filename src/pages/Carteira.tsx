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
  user_id: string; // The user whose credit was affected
  performed_by_profile?: {
    full_name: string;
  } | null;
  target_user_profile?: {
    full_name: string;
  } | null;
}

interface ManagedUser {
  user_id: string;
  full_name: string;
  role: string;
}

export default function Carteira() {
  const { userRole, user } = useAuth();
  const [creditBalance, setCreditBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [addCreditsDialogOpen, setAddCreditsDialogOpen] = useState(false);
  const [removeCreditsDialogOpen, setRemoveCreditsDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]); // Users that the current user can manage credits for
  const [selectedTargetUserId, setSelectedTargetUserId] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [selectedRemoveTargetUserId, setSelectedRemoveTargetUserId] = useState("");
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

  const loadManagedUsers = async () => {
    if (!user) return;

    try {
      let query;
      if (userRole === 'admin') {
        // Admin can manage credits for all master users
        query = supabase
          .from('profiles')
          .select('user_id, full_name, user_roles(role)')
          .not('user_id', 'eq', user.id) // Exclude self
          .order('full_name', { ascending: true });
      } else if (userRole === 'master') {
        // Master can manage credits for masters and resellers they created
        query = supabase
          .from('profiles')
          .select('user_id, full_name, user_roles(role)')
          .eq('created_by', user.id)
          .order('full_name', { ascending: true });
      } else {
        setManagedUsers([]);
        return;
      }

      const { data: profiles, error: profilesError } = await query;

      if (profilesError) throw profilesError;

      const filteredUsers: ManagedUser[] = [];
      for (const profile of profiles || []) {
        const role = (profile.user_roles as any)?.role;
        // For admin, show only masters
        // For master, show both masters and resellers they created
        if (userRole === 'admin' && role === 'master') {
          filteredUsers.push({ user_id: profile.user_id, full_name: profile.full_name || "N/A", role });
        } else if (userRole === 'master' && (role === 'master' || role === 'reseller')) {
          filteredUsers.push({ user_id: profile.user_id, full_name: profile.full_name || "N/A", role });
        }
      }
      setManagedUsers(filteredUsers);
    } catch (error: any) {
      console.error('Error loading managed users:', error);
    }
  };

  const loadTransactions = async () => {
    if (!user) return;

    try {
      setLoading(true);
      
      let query = supabase
        .from('credit_transactions')
        .select('*, performed_by_profile:profiles!performed_by(full_name), target_user_profile:profiles!related_user_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (userRole === 'master') {
        // For master, fetch IDs of all users (masters and resellers) they created
        const { data: createdUsers, error: createdUsersError } = await supabase
          .from('profiles')
          .select('user_id')
          .eq('created_by', user.id);

        if (createdUsersError) throw createdUsersError;
        const createdUserIds = createdUsers?.map(p => p.user_id) || [];

        // Master sees:
        // 1. Their own credit movements (user_id = master.id)
        // 2. Credit movements for users they created (user_id in createdUserIds)
        // 3. Credit movements they performed on users they created (performed_by = master.id AND related_user_id in createdUserIds)
        const filterConditions = [
          `user_id.eq.${user.id}`,
        ];
        if (createdUserIds.length > 0) {
          filterConditions.push(`user_id.in.(${createdUserIds.join(',')})`);
          filterConditions.push(`and(performed_by.eq.${user.id},related_user_id.in.(${createdUserIds.join(',')}))`);
        }
        
        query = query.or(filterConditions.join(','));
      }

      const { data, error } = await query;

      if (error) throw error;
      
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

  useEffect(() => {
    loadCreditBalance();
    loadManagedUsers();
    loadTransactions();
  }, [userRole, user]);

  const handleManageCredits = async (targetUserId: string, amount: number) => {
    if (!targetUserId || amount === 0) {
      toast({
        title: "Campos obrigatórios",
        description: "Selecione um usuário e informe a quantidade de créditos",
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
            targetUserId: targetUserId,
            amount: amount,
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
        title: "Sucesso!",
        description: `${Math.abs(amount)} crédito(s) ${amount > 0 ? 'adicionado(s) a' : 'removido(s) de'} ${result.targetUser}`,
      });

      setAddCreditsDialogOpen(false);
      setRemoveCreditsDialogOpen(false);
      setSelectedTargetUserId("");
      setCreditAmount("");
      setSelectedRemoveTargetUserId("");
      setRemoveCreditAmount("");
      loadCreditBalance();
      loadTransactions();
    } catch (error: any) {
      console.error("Error managing credits:", error);
      toast({
        title: "Erro ao gerenciar créditos",
        description: error.message || "Ocorreu um erro ao gerenciar os créditos",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddCredits = () => handleManageCredits(selectedTargetUserId, parseInt(creditAmount));
  const handleRemoveCredits = () => handleManageCredits(selectedRemoveTargetUserId, -parseInt(removeCreditAmount));

  // Filter transactions for the "Histórico de Gerenciamento de Créditos" table
  const managedCreditTransactions = transactions.filter(t => 
    (userRole === 'admin' && t.transaction_type === 'credit_added' && t.performed_by) || // Admin sees all added by admin
    (userRole === 'master' && t.performed_by === user?.id && t.related_user_id) // Master sees what they performed on their created users
  );

  // Filter transactions for the "Créditos Adquiridos" table (only for Masters)
  const creditedTransactions = transactions.filter(t => 
    t.transaction_type === 'credit_added' && t.user_id === user?.id
  );
  
  // Filter transactions for the "Créditos Gastos" table
  const spentTransactions = transactions.filter(t => 
    t.transaction_type === 'credit_spent' && t.user_id === user?.id
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
                  Adicionar Créditos a {userRole === 'admin' ? 'Master' : 'Usuário Criado'}
                </Button>
                <Button 
                  onClick={() => setRemoveCreditsDialogOpen(true)}
                  variant="destructive"
                  className="w-full sm:w-auto"
                >
                  <Coins className="mr-2 h-4 w-4" />
                  Remover Créditos de {userRole === 'admin' ? 'Master' : 'Usuário Criado'}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico de Gerenciamento de Créditos (for Admins and Masters) */}
        {(userRole === 'admin' || userRole === 'master') && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Coins className="h-5 w-5 text-blue-600" />
                Histórico de Gerenciamento de Créditos
              </CardTitle>
              <CardDescription>
                Registro de todas as adições e remoções de créditos feitas por {userRole === 'admin' ? 'administradores' : 'você'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border overflow-x-auto">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Data</TableHead>
                      <TableHead className="whitespace-nowrap">{userRole === 'admin' ? 'Administrador' : 'Ação por'}</TableHead>
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
                    ) : managedCreditTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          Nenhuma adição ou remoção de crédito registrada
                        </TableCell>
                      </TableRow>
                    ) : (
                      managedCreditTransactions.map((transaction) => {
                        const isAddition = transaction.amount > 0;
                        const performedByName = transaction.performed_by_profile?.full_name || 'N/A';
                        const targetUserName = transaction.target_user_profile?.full_name || 'N/A';
                        const actionText = isAddition 
                          ? `Adicionando crédito para ${targetUserName}`
                          : `Removendo crédito de ${targetUserName}`;
                        
                        return (
                          <TableRow key={transaction.id}>
                            <TableCell className="whitespace-nowrap">
                              {format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm')}
                            </TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                              {performedByName}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{actionText}</TableCell>
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
                Créditos Adquiridos
              </CardTitle>
              <CardDescription>
                Histórico de créditos adicionados por administradores
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
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : creditedTransactions.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nenhum crédito adquirido ainda
                        </TableCell>
                      </TableRow>
                    ) : (
                      creditedTransactions.map((transaction) => (
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
                : 'Histórico de créditos utilizados em criação e renovação'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border overflow-x-auto">
              <Table className="min-w-max">
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
                            {transaction.performed_by_profile?.full_name || 'N/A'}
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

      {/* Add Credits Dialog (Admin/Master) */}
      <Dialog open={addCreditsDialogOpen} onOpenChange={setAddCreditsDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar Créditos</DialogTitle>
            <DialogDescription>
              Adicione créditos a um usuário {userRole === 'admin' ? 'master' : 'criado'} específico
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="targetUser">Usuário {userRole === 'admin' ? 'Master' : 'Criado'}</Label>
              <Select value={selectedTargetUserId} onValueChange={setSelectedTargetUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`Selecione um ${userRole === 'admin' ? 'master' : 'usuário criado'}`} />
                </SelectTrigger>
                <SelectContent>
                  {managedUsers.map((managedUser) => (
                    <SelectItem key={managedUser.user_id} value={managedUser.user_id}>
                      {managedUser.full_name} ({managedUser.role === 'admin' ? 'Admin' : managedUser.role === 'master' ? 'Master' : 'Revendedor'})
                    </SelectItem>
                  ))}
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
            <Button onClick={handleAddCredits} disabled={submitting} className="w-full sm:w-auto">
              {submitting ? "Adicionando..." : "Adicionar Créditos"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Credits Dialog (Admin/Master) */}
      <Dialog open={removeCreditsDialogOpen} onOpenChange={setRemoveCreditsDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Remover Créditos</DialogTitle>
            <DialogDescription>
              Remova créditos de um usuário {userRole === 'admin' ? 'master' : 'criado'} específico
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="remove-targetUser">Usuário {userRole === 'admin' ? 'Master' : 'Criado'}</Label>
              <Select value={selectedRemoveTargetUserId} onValueChange={setSelectedRemoveTargetUserId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={`Selecione um ${userRole === 'admin' ? 'master' : 'usuário criado'}`} />
                </SelectTrigger>
                <SelectContent>
                  {managedUsers.map((managedUser) => (
                    <SelectItem key={managedUser.user_id} value={managedUser.user_id}>
                      {managedUser.full_name} ({managedUser.role === 'admin' ? 'Admin' : managedUser.role === 'master' ? 'Master' : 'Revendedor'})
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
              disabled={submitting}
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