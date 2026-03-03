"use client";

import { User } from "@supabase/supabase-js";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Loader2,
  Play,
  Receipt,
  RefreshCw,
  Shield,
  Sparkles,
  Star,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { useSubscription } from "./SubscriptionContext";

interface SubscriptionData {
  id: string;
  status: string;
  planId: string;
  maxAgents: number;
  nextPaymentDate: string | null;
  createdAt: string;
}

interface SubscriptionResponse {
  active: boolean;
  validUntil: string | null;
  subscription: SubscriptionData | null;
}

interface PaymentRecord {
  id: string;
  transactionId: string;
  status: string;
  amount: string;
  planId: string;
  createdAt: string;
  validUntil: string;
}

interface PaymentHistoryResponse {
  payments: PaymentRecord[];
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  authorized: {
    label: "Ativa",
    className: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  },
  pending: {
    label: "Pendente",
    className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  },
  paused: {
    label: "Pausada",
    className: "text-red-400 bg-red-400/10 border-red-400/20",
  },
  cancelled: {
    label: "Cancelada",
    className: "text-red-400 bg-red-400/10 border-red-400/20",
  },
};

const PAYMENT_STATUS_LABELS: Record<
  string,
  { label: string; className: string; icon: React.ElementType }
> = {
  approved: {
    label: "Aprovado",
    className: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    icon: CheckCircle2,
  },
  pending: {
    label: "Pendente",
    className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    icon: Clock,
  },
  rejected: {
    label: "Recusado",
    className: "text-red-400 bg-red-400/10 border-red-400/20",
    icon: XCircle,
  },
  cancelled: {
    label: "Cancelado",
    className: "text-red-400 bg-red-400/10 border-red-400/20",
    icon: XCircle,
  },
  refunded: {
    label: "Reembolsado",
    className: "text-slate-400 bg-slate-400/10 border-slate-400/20",
    icon: RefreshCw,
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(amount: string): string {
  const num = parseFloat(amount);
  return isNaN(num)
    ? amount
    : num.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function ValidityBadge({ validUntil }: { validUntil: string }) {
  const expiry = new Date(validUntil);
  const now = new Date();
  const isValid = now < expiry;
  const daysLeft = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (isValid) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Válido · {daysLeft}d restantes
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-400">
      <XCircle className="h-3 w-3" />
      Expirado
    </span>
  );
}

export function BillingPage({ user: _user }: { user: User }) {
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [bypassing, setBypassing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [subData, setSubData] = useState<SubscriptionResponse | null>(null);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const { refresh: refreshSubscription } = useSubscription();

  const loadSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/subscription/status");
      if (!res.ok) throw new Error("Erro ao buscar assinatura");
      const data = (await res.json()) as SubscriptionResponse;
      setSubData(data);
    } catch {
      toast.error("Erro ao carregar dados da assinatura.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await fetch("/api/payment/history");
      if (!res.ok) throw new Error("Erro ao buscar histórico");
      const data = (await res.json()) as PaymentHistoryResponse;
      setPayments(data.payments ?? []);
    } catch {
      // silently fail – not critical
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSubscription();
    void loadHistory();
  }, [loadSubscription, loadHistory]);

  async function handleSubscribe() {
    setSubscribing(true);
    try {
      const res = await fetch("/api/payment/create-preference", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ planId: "pro-monthly" }),
      });

      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data?.error ?? "Erro ao criar assinatura");
      }

      const data = (await res.json()) as { init_point: string };
      if (data.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error("URL de redirecionamento não disponível");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao assinar.");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleBypass() {
    setBypassing(true);
    try {
      const res = await fetch("/api/subscription/bypass", { method: "POST" });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data?.error ?? "Erro ao ativar modo demo");
      }
      toast.success("Modo demo ativado! Explore a plataforma à vontade.");
      // Refresh both the local page data and the global subscription context
      await Promise.all([
        loadSubscription(),
        loadHistory(),
        refreshSubscription(),
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ativar demo.");
    } finally {
      setBypassing(false);
    }
  }

  async function handleRefresh() {
    setLoading(true);
    setHistoryLoading(true);
    await Promise.all([
      loadSubscription(),
      loadHistory(),
      refreshSubscription(),
    ]);
    toast.success("Dados atualizados!");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const sub = subData?.subscription;
  const isActive = subData?.active ?? false;
  const validUntil = subData?.validUntil ?? null;
  const statusInfo = STATUS_LABELS[sub?.status ?? ""] ?? STATUS_LABELS.pending;

  return (
    <div className="space-y-6 animate-slideUp">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
            Cobrança
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Gerencie sua assinatura e acompanhe seus pagamentos.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          title="Atualizar dados"
          className="flex items-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/50 px-3 py-2 text-xs text-slate-400 transition hover:bg-slate-700/60 hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </button>
      </div>

      {/* ─── Subscription Validity Card ─── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-5 ${
          isActive
            ? "border-emerald-500/20 bg-emerald-500/5"
            : "border-amber-500/20 bg-amber-500/5"
        }`}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span
              className={`rounded-xl p-2.5 ring-1 ${isActive ? "bg-emerald-500/15 ring-emerald-500/20 text-emerald-400" : "bg-amber-500/15 ring-amber-500/20 text-amber-400"}`}
            >
              {isActive ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </span>
            <div>
              <h2
                className={`text-base font-semibold ${isActive ? "text-emerald-300" : "text-amber-300"}`}
              >
                {isActive ? "Assinatura válida" : "Assinatura inválida"}
              </h2>
              <p className="mt-0.5 text-sm text-slate-400">
                {isActive
                  ? "Seu plano está ativo e dentro do período de 30 dias."
                  : "Não há um pagamento aprovado dentro dos últimos 30 dias."}
              </p>
            </div>
          </div>

          {/* Validity details */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-800/60 bg-slate-900/60 px-4 py-3 text-sm min-w-[200px]">
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500 text-xs">Acesso válido até</span>
              <span className="font-medium text-white text-xs">
                {validUntil ? formatDate(validUntil) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-slate-500 text-xs">Status</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusInfo.className}`}
              >
                {sub ? statusInfo.label : "Sem assinatura"}
              </span>
            </div>
            {sub && (
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500 text-xs">Próxima cobrança</span>
                <span className="font-medium text-white text-xs">
                  {formatDate(sub.nextPaymentDate)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── No Subscription State ─── */}
      {!sub && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="relative p-8 text-center">
            <div className="absolute inset-0 bg-linear-to-br from-cyan-500/5 via-transparent to-indigo-500/5 pointer-events-none" />
            <div className="relative">
              <div className="inline-flex rounded-2xl bg-linear-to-br from-cyan-400/20 to-indigo-500/20 p-4 ring-1 ring-white/10 mb-5">
                <Sparkles className="h-8 w-8 text-cyan-400" />
              </div>
              <h2 className="text-xl font-bold text-white mb-2">
                Plano Pro – R$ 49,90/mês
              </h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                Deploy 1-click de agentes OpenClaw, integração com Telegram,
                dashboard de gerenciamento e uptime 99.9% garantido.
              </p>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6 max-w-lg mx-auto">
                {[
                  "Deploy 1-click",
                  "Integração Telegram",
                  "Dashboard completo",
                  "Uptime 99.9%",
                ].map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-1.5 text-xs text-slate-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>

              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={handleSubscribe}
                  disabled={subscribing}
                  className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-cyan-500 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30 hover:brightness-110 disabled:opacity-50"
                >
                  {subscribing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="h-4 w-4" />
                  )}
                  {subscribing ? "Redirecionando..." : "Assinar agora"}
                </button>

                <button
                  onClick={handleBypass}
                  disabled={bypassing}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-800/50 px-4 py-2 text-xs font-medium text-slate-400 transition-all hover:bg-slate-700/60 hover:text-white hover:border-slate-600 disabled:opacity-50"
                >
                  {bypassing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  {bypassing ? "Ativando demo..." : "Testar sem pagar (Demo)"}
                </button>
              </div>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-600">
                <Shield className="h-3 w-3" />
                Pagamento seguro
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Active Subscription Card ─── */}
      {sub && (
        <>
          {/* Inactive subscription banner */}
          {!isActive && sub.status !== "pending" && (
            <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
              <XCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-red-300">
                  Assinatura inativa
                </h3>
                <p className="text-xs text-red-400/70 mt-0.5">
                  Seus agentes foram pausados. Renove sua assinatura para
                  reativá-los.
                </p>
              </div>
            </div>
          )}

          {/* Plan card */}
          <div className="glass rounded-2xl overflow-hidden">
            <div className="relative p-6">
              <div className="absolute inset-0 bg-linear-to-br from-cyan-500/5 via-transparent to-indigo-500/5 pointer-events-none" />

              <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="rounded-2xl bg-linear-to-br from-cyan-400/20 to-indigo-500/20 p-3 ring-1 ring-white/10">
                    <Sparkles className="h-7 w-7 text-cyan-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-xl font-bold text-white">
                        Plano Pro
                      </h2>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusInfo.className}`}
                      >
                        <Star className="h-2.5 w-2.5" />
                        {statusInfo.label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-400">
                      Deploy 1-click · Telegram · Dashboard · Uptime 99.9%
                    </p>
                    <div className="mt-2 flex flex-col gap-1 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Próxima cobrança: {formatDate(sub.nextPaymentDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Receipt className="h-3 w-3" />
                        Assinante desde: {formatDate(sub.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-3xl font-extrabold text-white tracking-tight">
                    R$ 49,90
                  </span>
                  <span className="text-sm text-slate-500 ml-1">/mês</span>
                  <div className="mt-1 text-xs text-slate-500">
                    Até {sub.maxAgents} agente{sub.maxAgents > 1 ? "s" : ""}
                  </div>
                </div>
              </div>
            </div>

            {/* Plan features */}
            <div className="border-t border-slate-800/60 bg-slate-950/30 px-6 py-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  "Deploy 1-click do OpenClaw",
                  "Integração com Telegram",
                  "Dashboard de gerenciamento",
                  "Uptime 99.9% garantido",
                ].map((feature) => (
                  <div
                    key={feature}
                    className="flex items-center gap-2 text-xs text-slate-300"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    {feature}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ─── Cancel / Danger Zone ─── */}
          {isActive && (
            <div className="rounded-2xl border border-red-500/10 bg-red-500/5 p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-red-300">
                    Cancelar assinatura
                  </h3>
                  <p className="text-xs text-red-400/60 mt-0.5">
                    Seus agentes serão desligados ao final do período
                    contratado.
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (
                      window.confirm(
                        "Tem certeza que deseja cancelar sua assinatura? Seus agentes serão desligados.",
                      )
                    ) {
                      toast("Em breve: cancelamento via API!", {
                        icon: "🚧",
                      });
                    }
                  }}
                  className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
                >
                  Cancelar assinatura
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ─── Payment History ─── */}
      <div className="glass rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-cyan-400" />
            <h3 className="text-lg font-semibold text-white">
              Histórico de pagamentos
            </h3>
          </div>
          {payments.length > 0 && (
            <span className="text-xs text-slate-500">
              Últimos {payments.length} pagamentos
            </span>
          )}
        </div>

        {historyLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-400/60" />
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Receipt className="h-8 w-8 text-slate-700" />
            <p className="text-sm text-slate-500">
              Nenhum pagamento registrado ainda.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => {
              const ps =
                PAYMENT_STATUS_LABELS[payment.status] ??
                PAYMENT_STATUS_LABELS.pending;
              const Icon = ps.icon;
              const isApproved = payment.status === "approved";

              return (
                <div
                  key={payment.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  {/* Left: icon + dates */}
                  <div className="flex items-start gap-3">
                    <span
                      className={`mt-0.5 rounded-full border p-1.5 ${ps.className}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {formatCurrency(payment.amount)} · Plano Pro
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Pago em {formatDateTime(payment.createdAt)}
                      </p>
                      {isApproved && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          Período: {formatDate(payment.createdAt)} →{" "}
                          {formatDate(payment.validUntil)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: status + validity badge */}
                  <div className="flex items-center gap-2 pl-9 sm:pl-0">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ps.className}`}
                    >
                      {ps.label}
                    </span>
                    {isApproved && (
                      <ValidityBadge validUntil={payment.validUntil} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-slate-600">
          <Shield className="h-3 w-3" />
          Cobranças automáticas seguras
        </div>
      </div>
    </div>
  );
}
