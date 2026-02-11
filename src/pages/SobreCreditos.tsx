import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Coins,
  ArrowDownCircle,
  ArrowUpCircle,
  UserPlus,
  RefreshCw,
  ShieldCheck,
  Users,
  HelpCircle,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";

export default function SobreCreditos() {
  return (
    <div className="flex flex-col min-h-screen w-full">
      <AppHeader title="Sobre os Créditos" />
      <main className="flex-1 p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full">
        {/* Hero */}
        <div className="text-center space-y-2 py-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
            <Coins className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            Sistema de Créditos
          </h1>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Entenda como funciona o fluxo de créditos, quem pode gerenciá-los e o custo de cada ação.
          </p>
        </div>

        {/* O que são créditos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-primary" />
              O que são créditos?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-muted-foreground">
            <p>
              Créditos são a moeda interna do sistema. Eles são utilizados para realizar
              ações específicas, como a criação de novos usuários do tipo <Badge variant="outline">Cliente</Badge>.
            </p>
            <p>
              Cada conta de <Badge variant="secondary">Master</Badge> ou <Badge variant="secondary">Revenda</Badge> possui
              um saldo de créditos que pode ser gerenciado pela hierarquia acima.
            </p>
          </CardContent>
        </Card>

        {/* Hierarquia */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5 text-primary" />
              Hierarquia de Créditos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              Os créditos fluem de cima para baixo na hierarquia. Cada nível pode
              gerenciar os créditos dos usuários abaixo dele.
            </p>
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-primary/10 border border-primary/20">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">Admin</p>
                  <p className="text-xs text-muted-foreground">Créditos ilimitados</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90" />
              <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                <Users className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="font-semibold text-foreground">Master</p>
                  <p className="text-xs text-muted-foreground">Recebe créditos do Admin</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90" />
              <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-orange-500/10 border border-orange-500/20">
                <Users className="w-5 h-5 text-orange-500" />
                <div>
                  <p className="font-semibold text-foreground">Revenda</p>
                  <p className="text-xs text-muted-foreground">Recebe créditos do Master</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-muted-foreground rotate-90" />
              <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-muted border border-border">
                <Users className="w-5 h-5 text-muted-foreground" />
                <div>
                  <p className="font-semibold text-foreground">Cliente</p>
                  <p className="text-xs text-muted-foreground">Não utiliza créditos</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quem pode adicionar/remover */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownCircle className="w-5 h-5 text-green-500" />
              Quem pode adicionar e remover créditos?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Admin</p>
                  <p className="text-sm text-muted-foreground">
                    Pode adicionar e remover créditos de qualquer usuário
                    <Badge variant="secondary" className="ml-2">Master</Badge> ou <Badge variant="secondary">Revenda</Badge>.
                    O Admin possui créditos ilimitados.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Users className="w-5 h-5 text-blue-500 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Master</p>
                  <p className="text-sm text-muted-foreground">
                    Pode adicionar e remover créditos dos seus subordinados
                    (<Badge variant="secondary">Revenda</Badge> e <Badge variant="secondary">Master</Badge> criados por ele).
                    Ao adicionar, os créditos são debitados do seu saldo. Ao remover, os créditos retornam ao seu saldo.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Users className="w-5 h-5 text-orange-500 mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Revenda</p>
                  <p className="text-sm text-muted-foreground">
                    Pode adicionar e remover créditos dos seus subordinados
                    (<Badge variant="secondary">Revenda</Badge> e <Badge variant="secondary">Master</Badge> criados por ele).
                    Funciona da mesma forma que o Master: os créditos saem/retornam ao seu saldo.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Users className="w-5 h-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Cliente</p>
                  <p className="text-sm text-muted-foreground">
                    Não pode adicionar nem remover créditos. Clientes não utilizam créditos diretamente.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custo das ações */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="w-5 h-5 text-primary" />
              Custo das ações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <UserPlus className="w-5 h-5 text-red-400" />
                  <div>
                    <p className="font-medium text-foreground">Criar um Cliente</p>
                    <p className="text-xs text-muted-foreground">Ao criar um usuário do tipo Cliente</p>
                  </div>
                </div>
                <Badge variant="destructive" className="text-sm">-1 crédito</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <RefreshCw className="w-5 h-5 text-red-400" />
                  <div>
                    <p className="font-medium text-foreground">Renovar um Cliente</p>
                    <p className="text-xs text-muted-foreground">Ao renovar a assinatura de um Cliente</p>
                  </div>
                </div>
                <Badge variant="destructive" className="text-sm">-1 crédito</Badge>
              </div>

              <Separator />

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <UserPlus className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium text-foreground">Criar um Master ou Revenda</p>
                    <p className="text-xs text-muted-foreground">Criar usuários de nível superior</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-sm bg-green-500/10 text-green-500 border-green-500/20">Gratuito</Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <ArrowUpCircle className="w-5 h-5 text-green-500" />
                  <div>
                    <p className="font-medium text-foreground">Transferir créditos</p>
                    <p className="text-xs text-muted-foreground">Enviar créditos para subordinados</p>
                  </div>
                </div>
                <Badge variant="secondary" className="text-sm bg-green-500/10 text-green-500 border-green-500/20">Gratuito</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Regras importantes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Regras importantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Ao <strong className="text-foreground">adicionar créditos</strong> a um subordinado, o valor é debitado do seu saldo.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Ao <strong className="text-foreground">remover créditos</strong> de um subordinado, o valor retorna ao seu saldo.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Você só pode gerenciar créditos de usuários que foram <strong className="text-foreground">criados por você</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-500 mt-1 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  O <strong className="text-foreground">Admin</strong> tem créditos ilimitados e pode gerenciar qualquer usuário.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-1 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Não é possível transferir mais créditos do que o seu saldo disponível.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <XCircle className="w-4 h-4 text-red-400 mt-1 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Não é possível remover mais créditos do que o subordinado possui.
                </span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
