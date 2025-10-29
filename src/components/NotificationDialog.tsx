import { useState, useEffect } from "react";
import { Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface NotificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipient: {
    id: string;
    name: string;
    phone?: string;
    plan_name?: string;
    plan_value?: number;
    expiry_date?: string;
  };
}

export function NotificationDialog({ open, onOpenChange, recipient }: NotificationDialogProps) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadTemplates();
    }
  }, [open]);

  const loadTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("templates")
        .select("*")
        .order("nome", { ascending: true });

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      console.error("Error loading templates:", error);
      toast({
        title: "Erro ao carregar templates",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const renderPreview = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return "";

    let rendered = template.corpo;

    // Substituir placeholders
    rendered = rendered.replace(/\{\{customer_name\}\}/g, recipient.name || "Cliente");
    rendered = rendered.replace(/\{\{plan_name\}\}/g, recipient.plan_name || "N/A");
    rendered = rendered.replace(/\{\{value\}\}/g, recipient.plan_value ? `R$ ${recipient.plan_value.toFixed(2)}` : "N/A");
    rendered = rendered.replace(/\{\{due_date\}\}/g, recipient.expiry_date ? new Date(recipient.expiry_date).toLocaleDateString("pt-BR") : "N/A");
    
    // Placeholder PIX key - você pode buscar do perfil do master logado
    rendered = rendered.replace(/\{\{pix_key\}\}/g, "seupix@email.com");

    return rendered;
  };

  useEffect(() => {
    if (selectedTemplateId) {
      setPreview(renderPreview(selectedTemplateId));
    } else {
      setPreview("");
    }
  }, [selectedTemplateId, recipient]);

  const handleSend = async () => {
    try {
      if (!recipient.phone) {
        throw new Error("Destinatário não possui telefone cadastrado");
      }

      if (!preview) {
        throw new Error("Selecione um template");
      }

      setSending(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Buscar instância do usuário
      const { data: instanceData } = await supabase
        .from("user_instances")
        .select("instance_name, connection_status")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!instanceData) {
        throw new Error("Você precisa conectar seu WhatsApp primeiro em /whatsapp");
      }

      if (instanceData.connection_status !== "connected") {
        throw new Error("Seu WhatsApp não está conectado. Conecte em /whatsapp");
      }

      // Buscar URL do webhook
      const { data: configData } = await supabase
        .from("webhook_configs")
        .select("webhook_url")
        .eq("config_key", "n8n_message_sender")
        .maybeSingle();

      if (!configData?.webhook_url) {
        throw new Error("URL do webhook de mensagens não configurada");
      }

      // Enviar para n8n com estrutura aninhada correta
      const payload = {
        body: [
          {
            instanceName: instanceData.instance_name,
            contact_name: recipient.name,
            number: recipient.phone.replace(/\D/g, ""), // Remover caracteres não numéricos
            text: preview,
            mode: "real",
          },
        ],
      };

      const response = await fetch(configData.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Logar no histórico
      await supabase
        .from("n8n_message_sender_history")
        .insert({
          user_id: user.id,
          instance_name: instanceData.instance_name,
          recipient_phone: recipient.phone,
          message_text: preview,
          request_payload: payload,
          response_status: response.status,
        });

      if (!response.ok) {
        throw new Error("Erro ao enviar mensagem");
      }

      toast({
        title: "Mensagem enviada!",
        description: `Notificação enviada para ${recipient.name}`,
      });

      onOpenChange(false);
      setSelectedTemplateId("");
      setPreview("");
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({
        title: "Erro ao enviar mensagem",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
        <DialogHeader>
          <DialogTitle>Enviar Notificação</DialogTitle>
          <DialogDescription>
            Envie uma mensagem para {recipient.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Template</Label>
            <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
              <SelectTrigger className="w-full"> {/* Adicionado w-full */}
                <SelectValue placeholder="Selecione um template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preview && (
            <div className="space-y-2">
              <Label>Preview da Mensagem</Label>
              <Card>
                <CardContent className="pt-6">
                  <p className="text-sm whitespace-pre-wrap">{preview}</p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !preview}>
            {sending ? (
              "Enviando..."
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Enviar Mensagem
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}