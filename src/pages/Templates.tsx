import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, MoreVertical, MessageSquare } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const templateSchema = z.object({
  nome: z.string().min(3, "Nome deve ter no mínimo 3 caracteres").max(100, "Nome deve ter no máximo 100 caracteres"),
  assunto: z.string().max(200, "Assunto deve ter no máximo 200 caracteres").optional(),
  corpo: z.string().min(10, "Corpo deve ter no mínimo 10 caracteres").max(2000, "Corpo deve ter no máximo 2000 caracteres"),
  tipo: z.enum(["global", "pessoal"]),
});

type TemplateFormData = z.infer<typeof templateSchema>;

interface Template {
  id: string;
  nome: string;
  assunto: string | null;
  corpo: string;
  tipo: string;
  created_at: string;
}

const placeholders = [
  { code: "{{customer_name}}", description: "Nome do cliente" },
  { code: "{{plan_name}}", description: "Nome do plano" },
  { code: "{{due_date}}", description: "Data de vencimento" },
  { code: "{{value}}", description: "Valor da cobrança" },
  { code: "{{pix_key}}", description: "Chave PIX do seu perfil" },
];

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const { toast } = useToast();

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      nome: "",
      assunto: "",
      corpo: "",
      tipo: "global",
    },
  });

  const editForm = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      nome: "",
      assunto: "",
      corpo: "",
      tipo: "global",
    },
  });

  const loadTemplates = async () => {
    try {
      setLoading(true);
      
      // Load templates (RLS handles filtering: user's own + global templates)
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      setTemplates(data || []);
    } catch (error: any) {
      console.error("Error loading templates:", error);
      toast({
        title: "Erro ao carregar templates",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const onSubmit = async (data: TemplateFormData) => {
    try {
      setSubmitting(true);

      const { error } = await supabase
        .from("templates")
        .insert({
          nome: data.nome,
          assunto: data.assunto || null,
          corpo: data.corpo,
          tipo: data.tipo,
        });

      if (error) throw error;

      toast({
        title: "Template criado com sucesso!",
        description: `${data.nome} foi adicionado ao sistema.`,
      });

      setDialogOpen(false);
      form.reset();
      loadTemplates();
    } catch (error: any) {
      console.error("Error creating template:", error);
      toast({
        title: "Erro ao criar template",
        description: error.message || "Ocorreu um erro ao criar o template",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onEdit = async (data: TemplateFormData) => {
    if (!selectedTemplate) return;

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from("templates")
        .update({
          nome: data.nome,
          assunto: data.assunto || null,
          corpo: data.corpo,
          tipo: data.tipo,
        })
        .eq("id", selectedTemplate.id);

      if (error) throw error;

      toast({
        title: "Template atualizado com sucesso!",
        description: `${data.nome} foi atualizado.`,
      });

      setEditDialogOpen(false);
      editForm.reset();
      loadTemplates();
    } catch (error: any) {
      console.error("Error updating template:", error);
      toast({
        title: "Erro ao atualizar template",
        description: error.message || "Ocorreu um erro ao atualizar o template",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const onDelete = async () => {
    if (!selectedTemplate) return;

    try {
      setSubmitting(true);

      const { error } = await supabase
        .from("templates")
        .delete()
        .eq("id", selectedTemplate.id);

      if (error) throw error;

      toast({
        title: "Template excluído com sucesso!",
        description: `${selectedTemplate.nome} foi removido do sistema.`,
      });

      setDeleteDialogOpen(false);
      setSelectedTemplate(null);
      loadTemplates();
    } catch (error: any) {
      console.error("Error deleting template:", error);
      toast({
        title: "Erro ao excluir template",
        description: error.message || "Ocorreu um erro ao excluir o template",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (template: Template) => {
    setSelectedTemplate(template);
    editForm.reset({
      nome: template.nome,
      assunto: template.assunto || "",
      corpo: template.corpo,
      tipo: template.tipo as "global" | "pessoal",
    });
    setEditDialogOpen(true);
  };

  const handleDelete = (template: Template) => {
    setSelectedTemplate(template);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader 
        title="Templates" 
        subtitle="Gerencie suas mensagens automáticas"
      />

      <main className="container mx-auto p-4 sm:p-6"> {/* Ajustado padding */}
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0"> {/* Ajustado para empilhar em telas pequenas */}
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground">Templates de Mensagem</h2> {/* Ajustado tamanho da fonte */}
            <p className="text-sm sm:text-base text-muted-foreground"> {/* Ajustado tamanho da fonte */}
              Crie e gerencie templates para notificações automáticas
            </p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="w-full sm:w-auto"> {/* Botão ocupa largura total em mobile */}
            <Plus className="mr-2 h-4 w-4" />
            Novo Template
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 mb-6">
              {templates.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    Nenhum template encontrado. Crie seu primeiro template!
                  </CardContent>
                </Card>
              ) : (
                templates.map((template) => (
                  <Card key={template.id} className="bg-card border-border">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-foreground text-lg sm:text-xl">{template.nome}</CardTitle> {/* Ajustado tamanho da fonte */}
                          {template.tipo === "global" && (
                            <Badge variant="secondary">Global</Badge>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(template)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDelete(template)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Excluir
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {template.assunto && (
                        <p className="text-sm text-muted-foreground mb-2">
                          <strong>Assunto:</strong> {template.assunto}
                        </p>
                      )}
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {template.corpo}
                      </p>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {/* Placeholders Card */}
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground text-lg sm:text-xl">Placeholders Disponíveis</CardTitle> {/* Ajustado tamanho da fonte */}
                <CardDescription className="text-muted-foreground text-sm sm:text-base"> {/* Ajustado tamanho da fonte */}
                  Use estes marcadores em suas mensagens para personalização automática
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {placeholders.map((placeholder) => (
                    <div key={placeholder.code} className="flex items-start gap-3">
                      <code className="bg-secondary text-secondary-foreground px-2 py-1 rounded text-xs sm:text-sm font-mono"> {/* Ajustado tamanho da fonte */}
                        {placeholder.code}
                      </code>
                      <span className="text-xs sm:text-sm text-foreground">{placeholder.description}</span> {/* Ajustado tamanho da fonte */}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <DialogHeader>
            <DialogTitle>Novo Template</DialogTitle>
            <DialogDescription>
              Crie um novo template de mensagem
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome do Template</Label>
              <Input
                id="nome"
                {...form.register("nome")}
                placeholder="Ex: Lembrete de Vencimento"
                className="w-full" {/* Adicionado w-full */}
              />
              {form.formState.errors.nome && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.nome.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo</Label>
              <Select
                onValueChange={(value) => form.setValue("tipo", value as "global" | "pessoal")}
                defaultValue="global"
              >
                <SelectTrigger className="w-full"> {/* Adicionado w-full */}
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="pessoal">Pessoal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assunto">Assunto (opcional)</Label>
              <Input
                id="assunto"
                {...form.register("assunto")}
                placeholder="Ex: Lembrete: Seu pagamento vence em breve"
                className="w-full" {/* Adicionado w-full */}
              />
              {form.formState.errors.assunto && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.assunto.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="corpo">Mensagem</Label>
              <Textarea
                id="corpo"
                {...form.register("corpo")}
                placeholder="Olá {{customer_name}}, este é um lembrete de que seu plano {{plan_name}} vence em {{due_date}}..."
                rows={6}
                className="w-full" {/* Adicionado w-full */}
              />
              {form.formState.errors.corpo && (
                <p className="text-sm text-destructive">
                  {form.formState.errors.corpo.message}
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
                {submitting ? "Criando..." : "Criar Template"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-[90vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
          <DialogHeader>
            <DialogTitle>Editar Template</DialogTitle>
            <DialogDescription>
              Atualize as informações do template
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-nome">Nome do Template</Label>
              <Input
                id="edit-nome"
                {...editForm.register("nome")}
                placeholder="Ex: Lembrete de Vencimento"
                className="w-full" {/* Adicionado w-full */}
              />
              {editForm.formState.errors.nome && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.nome.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-tipo">Tipo</Label>
              <Select
                onValueChange={(value) => editForm.setValue("tipo", value as "global" | "pessoal")}
                value={editForm.watch("tipo")}
              >
                <SelectTrigger className="w-full"> {/* Adicionado w-full */}
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Global</SelectItem>
                  <SelectItem value="pessoal">Pessoal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-assunto">Assunto (opcional)</Label>
              <Input
                id="edit-assunto"
                {...editForm.register("assunto")}
                placeholder="Ex: Lembrete: Seu pagamento vence em breve"
                className="w-full" {/* Adicionado w-full */}
              />
              {editForm.formState.errors.assunto && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.assunto.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-corpo">Mensagem</Label>
              <Textarea
                id="edit-corpo"
                {...editForm.register("corpo")}
                placeholder="Olá {{customer_name}}, este é um lembrete de que seu plano {{plan_name}} vence em {{due_date}}..."
                rows={6}
                className="w-full" {/* Adicionado w-full */}
              />
              {editForm.formState.errors.corpo && (
                <p className="text-sm text-destructive">
                  {editForm.formState.errors.corpo.message}
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
              Tem certeza que deseja excluir o template "{selectedTemplate?.nome}"?
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
    </div>
  );
}