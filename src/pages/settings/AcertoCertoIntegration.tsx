import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { JsonViewDialog } from "@/components/JsonViewDialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, ExternalLink, Shield } from "lucide-react";

// Tipo estendido para incluir request_headers
interface WebhookHistoryItem {
  id: string;
  sent_at: string;
  event_type: string;
  target_url: string;
  payload: any;
  request_headers?: Record<string, string> | null;
  response_status_code: number | null;
  response_body: string | null;
  revenda_user_id: string | null;
}

export default function AcertoCertoIntegration() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [webhookUrl, setWebhookUrl] = useState("");

  // Buscar configuração atual
  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ['webhook-config', 'acerto_certo_webhook_url'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('config_key', 'acerto_certo_webhook_url')
        .maybeSingle();

      if (error) throw error;
      
      if (data) {
        setWebhookUrl(data.webhook_url || "");
      }
      
      return data;
    }
  });

  // Buscar histórico de webhooks
  const { data: history, isLoading: loadingHistory } = useQuery({
    queryKey: ['acerto-certo-webhook-history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acerto_certo_webhook_history')
        .select('*')
        .order('sent_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as WebhookHistoryItem[];
    }
  });

  // Salvar URL do webhook
  const saveMutation = useMutation({
    mutationFn: async (url: string) => {
      const { error } = await supabase
        .from('webhook_configs')
        .upsert(
          {
            config_key: 'acerto_certo_webhook_url',
            webhook_url: url,
            description: 'URL do webhook listener do sistema Acerto Certo para sincronização de usuários'
          },
          { onConflict: 'config_key' }
        );

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Configuração salva",
        description: "URL do webhook foi atualizada com sucesso."
      });
      queryClient.invalidateQueries({ queryKey: ['webhook-config'] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error instanceof Error ? error.message : "Ocorreu um erro ao salvar a configuração."
      });
    }
  });

  const handleSave = () => {
    if (!webhookUrl.trim()) {
      toast({
        variant: "destructive",
        title: "URL inválida",
        description: "Por favor, insira uma URL válida."
      });
      return;
    }

    saveMutation.mutate(webhookUrl);
  };

  const getStatusBadge = (statusCode: number | null) => {
    if (!statusCode) {
      return <Badge variant="outline">Sem resposta</Badge>;
    }
    
    if (statusCode >= 200 && statusCode < 300) {
      return <Badge className="bg-green-600 hover:bg-green-700">Sucesso ({statusCode})</Badge>;
    }
    
    if (statusCode >= 400 && statusCode < 500) {
      return <Badge variant="destructive">Erro Cliente ({statusCode})</Badge>;
    }
    
    return <Badge variant="destructive">Erro Servidor ({statusCode})</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Integração Acerto Certo" />
      <div className="container mx-auto p-4 sm:p-6 space-y-6"> {/* Ajustado padding */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Integração Acerto Certo</h1> {/* Ajustado tamanho da fonte */}
          <p className="text-sm sm:text-base text-muted-foreground mt-2"> {/* Ajustado tamanho da fonte */}
            Configure o webhook para sincronizar usuários com o sistema Acerto Certo
          </p>
        </div>

        {/* Configuração da URL */}
        <Card>
          <CardHeader>
            <CardTitle>Configuração do Webhook</CardTitle>
            <CardDescription>
              URL do listener que receberá notificações quando revendedores forem criados ou excluídos
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingConfig ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="webhook-url">URL do Webhook Listener</Label>
                  <Input
                    id="webhook-url"
                    type="url"
                    placeholder="https://api.acertocerto.com/webhook"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">
                    Esta URL receberá requisições POST com os eventos de criação e exclusão de usuários
                  </p>
                </div>

                <Button 
                  onClick={handleSave} 
                  disabled={saveMutation.isPending}
                  className="w-full sm:w-auto"
                >
                  {saveMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    <>
                      <Save className="mr-2 h-4 w-4" />
                      Salvar URL
                    </>
                  )}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Histórico de Webhooks */}
        <Card>
          <CardHeader>
            <CardTitle>Últimos Eventos Enviados</CardTitle>
            <CardDescription>
              Histórico das últimas 100 requisições enviadas ao Acerto Certo
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Aviso de segurança para admins */}
            <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4 mb-6">
              <div className="flex items-start gap-3">
                <Shield className="h-5 w-5 text-amber-600 dark:text-amber-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                    🔐 Acesso Administrativo Completo
                  </h4>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    Como administrador, você pode visualizar todos os detalhes das requisições, 
                    incluindo os headers de autorização enviados. Estes dados são sensíveis e 
                    devem ser mantidos confidenciais.
                  </p>
                </div>
              </div>
            </div>

            {loadingHistory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : history && history.length > 0 ? (
              <div className="rounded-md border overflow-x-auto">
                <Table className="min-w-max">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Enviado em</TableHead>
                      <TableHead className="whitespace-nowrap">Tipo Evento</TableHead>
                      <TableHead className="whitespace-nowrap">URL Destino</TableHead>
                      <TableHead className="whitespace-nowrap">Status Resposta</TableHead>
                      <TableHead className="whitespace-nowrap">Headers Enviados</TableHead>
                      <TableHead className="whitespace-nowrap">Payload</TableHead>
                      <TableHead className="whitespace-nowrap">Resposta</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="whitespace-nowrap">
                          {new Date(item.sent_at).toLocaleString('pt-BR')}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <Badge variant="outline">
                            {item.event_type === 'create_user' 
                              ? 'Criar Usuário' 
                              : item.event_type === 'delete_user'
                              ? 'Deletar Usuário'
                              : 'Atualizar Status'}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          <a 
                            href={item.target_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-primary hover:underline"
                          >
                            {item.target_url}
                            <ExternalLink className="h-3 w-3 flex-shrink-0" />
                          </a>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {getStatusBadge(item.response_status_code)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {item.request_headers ? (
                            <JsonViewDialog 
                              data={item.request_headers} 
                              triggerLabel="Ver Headers"
                              title="Headers Enviados"
                            />
                          ) : (
                            <Badge variant="outline">Sem headers</Badge>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <JsonViewDialog 
                            data={item.payload} 
                            triggerLabel="Ver Payload"
                            title="Payload Enviado"
                          />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {item.response_body ? (
                            <JsonViewDialog 
                              data={item.response_body} 
                              triggerLabel="Ver Resposta"
                              title="Corpo da Resposta"
                            />
                          ) : (
                            <span className="text-muted-foreground text-sm">Sem resposta</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum evento enviado ainda</p>
                <p className="text-sm mt-1">Os webhooks aparecerão aqui quando revendedores forem criados ou excluídos</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Documentação dos Payloads */}
        <Card>
          <CardHeader>
            <CardTitle>Documentação dos Payloads</CardTitle>
            <CardDescription>
              Estrutura dos dados enviados nos webhooks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="font-semibold mb-2">Evento: create_user</h4>
              <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
{`{
  "eventType": "create_user",
  "userId": "uuid-do-usuario-criado",
  "email": "revendedor@email.com",
  "password": "senha-usada-na-criacao",
  "fullName": "Nome Completo Revendedor",
  "vencimento": "Vencimento do Crédito",
  "role": "user",
  "phone": "+5511999998888",
  "tax_id": "12345678900"
}`}
              </pre>
              <p className="text-sm text-amber-600 dark:text-amber-500 mt-2">
                ⚠️ Atenção: Por questões de segurança, enviar senha em texto plano não é recomendado. 
                Idealmente o sistema receptor deveria gerar uma senha temporária.
              </p>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Evento: delete_user</h4>
              <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
{`{
  "eventType": "delete_user",
  "userId": "uuid-do-usuario-a-ser-excluido"
}`}
              </pre>
            </div>

            <div>
              <h4 className="font-semibold mb-2">Evento: update_user_status</h4>
              <pre className="bg-muted p-4 rounded-md text-xs overflow-x-auto">
{`{
  "eventType": "update_user_status",
  "userId": "uuid-do-usuario-atualizado",
  "newStatus": "active" // ou "inactive" ou "suspended"
}`}
              </pre>
              <p className="text-sm text-muted-foreground mt-2">
                Este evento é enviado quando o status de um revendedor é alterado para "active", "inactive" ou "suspended" através do menu de ações na página de Revendedores.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}