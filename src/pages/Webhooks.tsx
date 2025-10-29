import { useState, useEffect } from "react";
import { Save, AlertCircle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { JsonViewDialog } from "@/components/JsonViewDialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, ExternalLink } from "lucide-react";

interface WebhookConfig {
  config_key: string;
  webhook_url: string;
  description: string;
}

export default function Webhooks() {
  const [configs, setConfigs] = useState<Record<string, string>>({
    n8n_qr_code_generator: "",
    n8n_evolution_logout: "",
    n8n_message_sender: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [evolutionHistory, setEvolutionHistory] = useState<any[]>([]);
  const [qrHistory, setQrHistory] = useState<any[]>([]);
  const [logoutHistory, setLogoutHistory] = useState<any[]>([]);
  const [messageHistory, setMessageHistory] = useState<any[]>([]);
  const { toast } = useToast();

  const loadConfigs = async () => {
    try {
      const { data, error } = await supabase
        .from("webhook_configs")
        .select("*");

      if (error) throw error;

      const configsMap: Record<string, string> = {};
      data?.forEach((config: any) => {
        configsMap[config.config_key] = config.webhook_url;
      });
      
      setConfigs((prev) => ({ ...prev, ...configsMap }));
    } catch (error: any) {
      console.error("Error loading configs:", error);
      toast({
        title: "Erro ao carregar configurações",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const [evol, qr, logout, msg] = await Promise.all([
        supabase.from("evolution_api_history").select("*").order("created_at", { ascending: false }).limit(10),
        supabase.from("n8n_qr_code_history").select("*").order("created_at", { ascending: false }).limit(10),
        supabase.from("evolution_logout_history").select("*").order("created_at", { ascending: false }).limit(10),
        supabase.from("n8n_message_sender_history").select("*").order("created_at", { ascending: false }).limit(10),
      ]);

      setEvolutionHistory(evol.data || []);
      setQrHistory(qr.data || []);
      setLogoutHistory(logout.data || []);
      setMessageHistory(msg.data || []);
    } catch (error: any) {
      console.error("Error loading history:", error);
    }
  };

  useEffect(() => {
    loadConfigs();
    loadHistory();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);

      const updates = [
        {
          config_key: "n8n_qr_code_generator",
          webhook_url: configs.n8n_qr_code_generator,
          description: "URL do webhook n8n para gerar QR Code",
        },
        {
          config_key: "n8n_evolution_logout",
          webhook_url: configs.n8n_evolution_logout,
          description: "URL do webhook n8n para desconectar Evolution API",
        },
        {
          config_key: "n8n_message_sender",
          webhook_url: configs.n8n_message_sender,
          description: "URL do webhook n8n para enviar mensagens",
        },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from("webhook_configs")
          .upsert(update, { onConflict: "config_key" });

        if (error) throw error;
      }

      toast({
        title: "Configurações salvas!",
        description: "As URLs dos webhooks foram atualizadas com sucesso.",
      });
    } catch (error: any) {
      console.error("Error saving configs:", error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("pt-BR");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Configuração de Webhooks" subtitle="Gerencie as URLs de webhooks e monitore o histórico de eventos" />
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader 
        title="Configuração de Webhooks" 
        subtitle="Gerencie as URLs de webhooks e monitore o histórico de eventos"
      />

      <main className="container mx-auto p-4 sm:p-6"> {/* Ajustado padding */}
        <Tabs defaultValue="config" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto"> {/* Ajustado para 2 colunas em mobile */}
            <TabsTrigger value="config">Evolution API</TabsTrigger>
            <TabsTrigger value="qr">NBN QR Code</TabsTrigger>
            <TabsTrigger value="messages">NBN Mensagens</TabsTrigger>
            <TabsTrigger value="logout">Evolution Logout (NBN)</TabsTrigger>
          </TabsList>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Webhook da Evolution API</CardTitle>
                <CardDescription>
                  URL pública para receber atualizações de status da Evolution API. Configure esta URL na Evolution.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    URL do Webhook (Somente Leitura)
                  </AlertDescription>
                </Alert>
                <div className="space-y-2">
                  <Label>URL do Webhook (Somente Leitura)</Label>
                  <div className="flex flex-col sm:flex-row gap-2"> {/* Empilhado em telas pequenas */}
                    <Input
                      value={`https://korfuodesmuvloncrpmn.supabase.co/functions/v1/evolution-webhook-receiver`}
                      disabled
                      className="font-mono text-sm w-full" {/* Adicionado w-full */}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText("https://korfuodesmuvloncrpmn.supabase.co/functions/v1/evolution-webhook-receiver");
                        toast({ title: "Copiado!", description: "URL copiada para a área de transferência" });
                      }}
                      className="w-full sm:w-auto"
                    >
                      Copiar
                    </Button>
                  </div>
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Histórico de Requisições (Evolution → Sistema)</h3>
                  <div className="rounded-lg border overflow-x-auto"> {/* Adicionado overflow-x-auto */}
                    <Table className="min-w-max"> {/* Adicionado min-w-max */}
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                          <TableHead className="whitespace-nowrap">Tipo de Evento</TableHead>
                          <TableHead className="whitespace-nowrap">Payload</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {evolutionHistory.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              Nenhum evento registrado
                            </TableCell>
                          </TableRow>
                        ) : (
                          evolutionHistory.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge variant="default">{item.status_code || 200}</Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">{item.event_type}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <JsonViewDialog data={item.payload} />
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="qr">
            <Card>
              <CardHeader>
                <CardTitle>NBN QR Code</CardTitle>
                <CardDescription>
                  Configure a URL do webhook n8n para geração de QR Code
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="qr-url">URL do Webhook n8n</Label>
                  <Input
                    id="qr-url"
                    value={configs.n8n_qr_code_generator}
                    onChange={(e) => setConfigs({ ...configs, n8n_qr_code_generator: e.target.value })}
                    placeholder="https://seu-n8n.com/webhook/qr-code"
                    className="w-full" {/* Adicionado w-full */}
                  />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto"> {/* Botão ocupa largura total em mobile */}
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>

                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Histórico de Requisições</h3>
                  <div className="rounded-lg border overflow-x-auto"> {/* Adicionado overflow-x-auto */}
                    <Table className="min-w-max"> {/* Adicionado min-w-max */}
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                          <TableHead className="whitespace-nowrap">Instância</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                          <TableHead className="whitespace-nowrap">Payload</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {qrHistory.length === 0 ? (
                          <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Nenhum evento registrado
                              </TableCell>
                          </TableRow>
                        ) : (
                          qrHistory.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.instance_name}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge variant="default">{item.response_status || "N/A"}</Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <JsonViewDialog data={item.response_data ?? item.request_payload} />
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle>NBN Mensagens</CardTitle>
                <CardDescription>
                  Configure a URL do webhook n8n para envio de mensagens
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="msg-url">URL do Webhook n8n</Label>
                  <Input
                    id="msg-url"
                    value={configs.n8n_message_sender}
                    onChange={(e) => setConfigs({ ...configs, n8n_message_sender: e.target.value })}
                    placeholder="https://seu-n8n.com/webhook/send-message"
                    className="w-full" {/* Adicionado w-full */}
                  />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto"> {/* Botão ocupa largura total em mobile */}
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>

                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Histórico de Mensagens Enviadas</h3>
                  <div className="rounded-lg border overflow-x-auto"> {/* Adicionado overflow-x-auto */}
                    <Table className="min-w-max"> {/* Adicionado min-w-max */}
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                          <TableHead className="whitespace-nowrap">Destinatário</TableHead>
                          <TableHead className="whitespace-nowrap">Mensagem</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                          <TableHead className="whitespace-nowrap">Payload</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {messageHistory.length === 0 ? (
                          <TableRow>
                              <TableCell colSpan={5} className="text-center text-muted-foreground">
                                Nenhuma mensagem enviada
                              </TableCell>
                          </TableRow>
                        ) : (
                          messageHistory.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.recipient_phone}</TableCell>
                              <TableCell className="max-w-xs truncate">{item.message_text}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge variant="default">{item.response_status || "N/A"}</Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <JsonViewDialog data={item.request_payload} />
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logout">
            <Card>
              <CardHeader>
                <CardTitle>Evolution Logout (NBN)</CardTitle>
                <CardDescription>
                  Configure a URL do webhook n8n para desconexão da Evolution API
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="logout-url">URL do Webhook n8n</Label>
                  <Input
                    id="logout-url"
                    value={configs.n8n_evolution_logout}
                    onChange={(e) => setConfigs({ ...configs, n8n_evolution_logout: e.target.value })}
                    placeholder="https://seu-n8n.com/webhook/logout"
                    className="w-full" {/* Adicionado w-full */}
                  />
                </div>
                <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto"> {/* Botão ocupa largura total em mobile */}
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar"}
                </Button>

                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-4">Histórico de Desconexões</h3>
                  <div className="rounded-lg border overflow-x-auto"> {/* Adicionado overflow-x-auto */}
                    <Table className="min-w-max"> {/* Adicionado min-w-max */}
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                          <TableHead className="whitespace-nowrap">Instância</TableHead>
                          <TableHead className="whitespace-nowrap">Status</TableHead>
                          <TableHead className="whitespace-nowrap">Payload</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {logoutHistory.length === 0 ? (
                          <TableRow>
                              <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Nenhuma desconexão registrada
                              </TableCell>
                          </TableRow>
                        ) : (
                          logoutHistory.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(item.created_at)}</TableCell>
                              <TableCell className="whitespace-nowrap">{item.instance_name}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                <Badge variant="default">{item.response_status || "N/A"}</Badge>
                              </TableCell>
                              <TableCell className="whitespace-nowrap">
                                <JsonViewDialog data={item.request_payload} />
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}