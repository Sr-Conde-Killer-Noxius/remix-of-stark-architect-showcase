import { useState, useEffect } from "react";
import { Plus, Edit, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const planoSchema = z.object({
  nome: z.string().min(3, "Nome deve ter no mínimo 3 caracteres"),
  valor: z.string().refine((val) => !isNaN(Number(val)) && Number(val) >= 0, {
    message: "Valor deve ser um número positivo",
  }),
});

type PlanoFormData = z.infer<typeof planoSchema>;

interface Plano {
  id: string;
  nome: string;
  valor: number;
  created_at: string;
}

export default function Planos() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedPlano, setSelectedPlano] = useState<Plano | null>(null);
  const { toast } = useToast();

  const form = useForm<PlanoFormData>({
    resolver: zodResolver(planoSchema),
    defaultValues: {
      nome: "",
      valor: "0",
    },
  });

  const editForm = useForm<PlanoFormData>({
    resolver: zodResolver(planoSchema),
    defaultValues: {
      nome: "",
      valor: "0",
    },
  });

  const loadPlanos = async () => {
    try {
      setLoading(true);
      
      // Load all plans (RLS handles filtering by user_id automatically)
      const { data, error } = await supabase
        .from("planos")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setPlanos(data || []);
    } catch (error: any) {
      console.error("Error loading planos:", error);
      toast({
        title: "Erro ao carregar planos",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlanos();
  }, []);

  const onSubmit = async (data: PlanoFormData) => {
    try {
      setSubmitting(true);

      const { error } = await supabase
        .from("planos")
        .insert({
          nome: data.nome,
          valor: Number(data.valor),
        });

      if (error) throw error;

      toast({
        title: "Plano criado com sucesso!",
        description: `${data.nome} foi adicionado ao sistema.`,
      });

      setDialogOpen(false);
      form.reset();
      loadPlanos();
    } catch (error: any) {
      console.error("Error creating plano:", error);
      
      let errorMessage = "Ocorreu um erro ao criar o plano";
      
      if (error.message?.includes("duplicate key")) {
        errorMessage = "Já existe um plano com este nome";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro ao criar plano",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onEdit = async (data: PlanoFormData) => {
    if (!selectedPlano) return;

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from("planos")
        .update({
          nome: data.nome,
          valor: Number(data.valor),
        })
        .eq("id", selectedPlano.id);

      if (error) throw error;

      toast({
        title: "Plano atualizado com sucesso!",
        description: `${data.nome} foi atualizado.`,
      });

      setEditDialogOpen(false);
      editForm.reset();
      loadPlanos();
    } catch (error: any) {
      console.error("Error updating plano:", error);
      
      let errorMessage = "Ocorreu um erro ao atualizar o plano";
      
      if (error.message?.includes("duplicate key")) {
        errorMessage = "Já existe um plano com este nome";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro ao atualizar plano",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!selectedPlano) return;

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from("planos")
        .delete()
        .eq("id", selectedPlano.id);

      if (error) throw error;

      toast({
        title: "Plano excluído com sucesso!",
        description: `${selectedPlano.nome} foi removido do sistema.`,
      });

      setDeleteDialogOpen(false);
      setSelectedPlano(null);
      loadPlanos();
    } catch (error: any) {
      console.error("Error deleting plano:", error);
      toast({
        title: "Erro ao excluir plano",
        description: error.message || "Ocorreu um erro ao excluir o plano",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (plano: Plano) => {
    setSelectedPlano(plano);
    editForm.reset({
      nome: plano.nome,
      valor: plano.valor.toString(),
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (plano: Plano) => {
    setSelectedPlano(plano);
    setDeleteDialogOpen(true);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader 
        title="Planos e Preços" 
        subtitle="Gerencie os planos disponíveis para seus clientes"
      />

      <main className="container mx-auto p-4 sm:p-6"> {/* Ajustado padding */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0"> {/* Ajustado para empilhar em telas pequenas */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Planos</h2> {/* Ajustado tamanho da fonte */}
            <p className="text-sm sm:text-base text-muted-foreground"> {/* Ajustado tamanho da fonte */}
              Gerencie os planos do sistema
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto"> {/* Botão ocupa largura total em mobile */}
            <Plus className="mr-2 h-4 w-4" />
            Novo Plano
          </Button>
        </div>

        <div className="rounded-lg border bg-card overflow-x-auto"> {/* Adicionado overflow-x-auto */}
          <Table className="min-w-max"> {/* Adicionado min-w-max */}
            <TableHeader>
              <TableRow>
                <TableHead className="whitespace-nowrap">Nome</TableHead>
                <TableHead className="whitespace-nowrap">Valor</TableHead>
                <TableHead className="text-right whitespace-nowrap">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8">
                    <div className="flex justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : planos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                    Nenhum plano encontrado
                  </TableCell>
                </TableRow>
              ) : (
                planos.map((plano) => (
                  <TableRow key={plano.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {plano.nome}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(plano.valor)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleEdit(plano)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(plano)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </main>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <DialogHeader>
            <DialogTitle>Novo Plano</DialogTitle>
            <DialogDescription>
              Crie um novo plano no sistema
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do Plano</Label>
              <Input
                id="nome"
                {...form.register("nome")}
                placeholder="Ex: Básico, Intermediário, Premium"
                className="w-full" {/* Adicionado w-full */}
              />
              {form.formState.errors.nome && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.nome.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="valor">Valor (R$)</Label>
              <Input
                id="valor"
                type="number"
                step="0.01"
                {...form.register("valor")}
                placeholder="0.00"
                className="w-full" {/* Adicionado w-full */}
              />
              {form.formState.errors.valor && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.valor.message}
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
                {submitting ? "Criando..." : "Criar Plano"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <DialogHeader>
            <DialogTitle>Editar Plano</DialogTitle>
            <DialogDescription>
              Atualize as informações do plano
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome do Plano</Label>
              <Input
                id="edit-nome"
                {...editForm.register("nome")}
                placeholder="Ex: Básico, Intermediário, Premium"
                className="w-full" {/* Adicionado w-full */}
              />
              {editForm.formState.errors.nome && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.nome.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-valor">Valor (R$)</Label>
              <Input
                id="edit-valor"
                type="number"
                step="0.01"
                {...editForm.register("valor")}
                placeholder="0.00"
                className="w-full" {/* Adicionado w-full */}
              />
              {editForm.formState.errors.valor && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.valor.message}
                </p>
              )}
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
                {submitting ? "Salvando..." : "Salvar"}
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
              Tem certeza que deseja excluir o plano "{selectedPlano?.nome}"?
              Esta ação não pode ser desfeita. Os revendedores que possuem este
              plano terão o campo de plano definido como vazio.
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
    </div>
  );
}