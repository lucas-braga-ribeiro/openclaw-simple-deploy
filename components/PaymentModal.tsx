"use client";

import {
  CheckIcon,
  DollarSign,
  Loader2,
  Play,
  ShieldCheck,
  X,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

declare global {
  interface Window {
    MercadoPago: any;
  }
}

interface PaymentModalProps {
  planId: string;
  onClose: () => void;
}

type Step = "plan" | "form";
type PaymentMethod = "card" | "pix";
type PaymentStatus = "idle" | "loading" | "success" | "error";
type PostPaymentDialog = "approved" | "in_process" | null;

// ─── Friendly rejection messages ───────────────────────────────────────────
const REJECTION_MESSAGES: Record<string, { title: string; hint: string }> = {
  cc_rejected_bad_filled_card_number: {
    title: "Número do cartão inválido",
    hint: "Verifique o número do cartão e tente novamente.",
  },
  cc_rejected_bad_filled_date: {
    title: "Data de validade incorreta",
    hint: "Confira o mês e ano de validade do cartão.",
  },
  cc_rejected_bad_filled_other: {
    title: "Dados do cartão incorretos",
    hint: "Verifique todas as informações do cartão e tente novamente.",
  },
  cc_rejected_bad_filled_security_code: {
    title: "CVV incorreto",
    hint: "O código de segurança (CVV) está incorreto.",
  },
  cc_rejected_blacklist: {
    title: "Cartão com restrição",
    hint: "Este cartão não pode ser utilizado. Tente outro cartão.",
  },
  cc_rejected_call_for_authorize: {
    title: "Autorização necessária",
    hint: "Ligue para o banco para autorizar o pagamento e tente novamente.",
  },
  cc_rejected_card_disabled: {
    title: "Cartão desativado",
    hint: "Seu cartão está bloqueado para compras online. Entre em contato com o banco.",
  },
  cc_rejected_card_error: {
    title: "Erro no cartão",
    hint: "Não conseguimos processar seu cartão. Tente novamente ou use outro cartão.",
  },
  cc_rejected_duplicated_payment: {
    title: "Pagamento duplicado",
    hint: "Já existe um pagamento idêntico recente. Aguarde alguns minutos antes de tentar novamente.",
  },
  cc_rejected_high_risk: {
    title: "Pagamento recusado por segurança",
    hint: "Por motivos de segurança, o pagamento foi recusado. Tente outro cartão.",
  },
  cc_rejected_insufficient_amount: {
    title: "Saldo insuficiente",
    hint: "Seu cartão não tem limite disponível suficiente.",
  },
  cc_rejected_invalid_installments: {
    title: "Parcelamento inválido",
    hint: "O número de parcelas não é aceito para este cartão.",
  },
  cc_rejected_max_attempts: {
    title: "Muitas tentativas",
    hint: "Você excedeu o número de tentativas. Aguarde antes de tentar novamente.",
  },
  cc_rejected_other_reason: {
    title: "Pagamento recusado",
    hint: "O banco recusou o pagamento. Entre em contato com o banco ou use outro cartão.",
  },
};

function getRejectionInfo(errorMessage: string): {
  title: string;
  hint: string;
} {
  for (const [code, info] of Object.entries(REJECTION_MESSAGES)) {
    if (errorMessage.includes(code)) return info;
  }
  return {
    title: "Pagamento recusado",
    hint:
      errorMessage ||
      "Verifique os dados e tente novamente, ou use outro cartão.",
  };
}

interface PixData {
  qrCode: string;
  qrCodeBase64: string;
  ticketUrl: string;
}

const PLAN_DISPLAY = {
  "pro-monthly": {
    title: "Plano Pro",
    price: "R$ 49,90",
    period: "/mês",
    features: [
      "Deploy 1-click do OpenClaw",
      "Integração com Telegram",
      "Dashboard de gerenciamento",
      "Uptime 99.9% garantido",
    ],
  },
} as const;

export function PaymentModal({ planId, onClose }: PaymentModalProps) {
  const router = useRouter();
  const plan = PLAN_DISPLAY[planId as keyof typeof PLAN_DISPLAY];

  // Steps
  const [step, setStep] = useState<Step>("plan");

  // Payment form
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [status, setStatus] = useState<PaymentStatus>("idle");
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [postPaymentDialog, setPostPaymentDialog] =
    useState<PostPaymentDialog>(null);

  // Bypass / demo
  const [bypassing, setBypassing] = useState(false);

  // Rejection modal
  const [rejectionModal, setRejectionModal] = useState<{
    title: string;
    hint: string;
  } | null>(null);

  // Card fields
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCVV, setCardCVV] = useState("");
  const [cardDocType, setCardDocType] = useState("CPF");
  const [cardDocNumber, setCardDocNumber] = useState("");
  const [cardEmail, setCardEmail] = useState("");

  // Auto-detected from card BIN
  const [cardPaymentMethodId, setCardPaymentMethodId] = useState("");
  const [cardIssuerId, setCardIssuerId] = useState("");

  // MercadoPago SDK
  const mpRef = useRef<any>(null);

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_MERCADO_PAGO_PUBLIC_KEY;
    if (!publicKey) return;

    if (window.MercadoPago) {
      mpRef.current = new window.MercadoPago(publicKey, { locale: "pt-BR" });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://sdk.mercadopago.com/js/v2";
    script.async = true;
    script.onload = () => {
      mpRef.current = new window.MercadoPago(publicKey, { locale: "pt-BR" });
    };
    document.head.appendChild(script);
  }, []);

  // ─── Auto-detect issuer + payment method from card BIN ───
  useEffect(() => {
    const mp = mpRef.current;
    const bin = cardNumber.replace(/\s/g, "").slice(0, 6);
    if (!mp || bin.length < 6) {
      setCardPaymentMethodId("");
      setCardIssuerId("");
      return;
    }

    mp.getInstallments({ amount: "49.90", bin })
      .then((result: any[]) => {
        if (result && result.length > 0) {
          setCardPaymentMethodId(result[0].payment_method_id || "");
          setCardIssuerId(result[0].issuer?.id?.toString() || "");
        }
      })
      .catch(() => {
        setCardPaymentMethodId("");
        setCardIssuerId("");
      });
  }, [cardNumber]);

  // ─── Formatters ───
  const formatCardNumber = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 16);
    return d.replace(/(.{4})/g, "$1 ").trim();
  };

  const formatExpiry = (v: string) => {
    const d = v.replace(/\D/g, "").slice(0, 4);
    if (d.length >= 3) return `${d.slice(0, 2)}/${d.slice(2)}`;
    return d;
  };

  const formatDoc = (v: string) => {
    const d = v.replace(/\D/g, "");
    if (cardDocType === "CPF") {
      return d
        .slice(0, 11)
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }
    return d
      .slice(0, 14)
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
  };

  // ─── Card payment ───
  const handleCardPayment = useCallback(async () => {
    setStatus("loading");

    try {
      const mp = mpRef.current;
      if (!mp) throw new Error("MercadoPago SDK não carregado.");

      const [expMonth, expYear] = cardExpiry.split("/");

      const tokenResult = await mp.createCardToken({
        cardNumber: cardNumber.replace(/\s/g, ""),
        cardholderName: cardName,
        cardExpirationMonth: expMonth,
        cardExpirationYear: `20${expYear}`,
        securityCode: cardCVV,
        identificationType: cardDocType,
        identificationNumber: cardDocNumber.replace(/\D/g, ""),
      });

      if (tokenResult.error) throw new Error(tokenResult.error);

      const res = await fetch("/api/payment/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: tokenResult.id,
          issuer_id: cardIssuerId,
          payment_method_id: cardPaymentMethodId,
          installments: 1,
          planId,
          payer: {
            email: cardEmail,
            identification: {
              type: cardDocType,
              number: cardDocNumber.replace(/\D/g, ""),
            },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error || "Pagamento recusado.");

      if (data.status === "approved") {
        setStatus("success");
        setPostPaymentDialog("approved");
      } else if (data.status === "in_process") {
        setStatus("success");
        setPostPaymentDialog("in_process");
      } else {
        throw new Error(
          data.detail ||
            data.status_detail ||
            `Pagamento recusado (${data.status}).`,
        );
      }
    } catch (err: any) {
      setStatus("idle");
      const msg = err.message || "Erro desconhecido.";
      setRejectionModal(getRejectionInfo(msg));
    }
  }, [
    cardNumber,
    cardName,
    cardExpiry,
    cardCVV,
    cardDocType,
    cardDocNumber,
    cardEmail,
    planId,
    router,
  ]);

  // ─── Pix payment ───
  const handlePixPayment = useCallback(async () => {
    setStatus("loading");
    setPixData(null);
    setPostPaymentDialog(null);

    try {
      const res = await fetch("/api/payment/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          payment_method_id: "pix",
          payer: {
            email: cardEmail,
            identification: {
              type: cardDocType,
              number: cardDocNumber.replace(/\D/g, ""),
            },
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error)
        throw new Error(data.error || "Erro ao gerar Pix.");

      if (data.pixQrCode) {
        setPixData({
          qrCode: data.pixQrCode,
          qrCodeBase64: data.pixQrCodeBase64,
          ticketUrl: data.ticketUrl,
        });
        setStatus("idle");
      } else {
        throw new Error("QR Code Pix não disponível.");
      }
    } catch (err: any) {
      setStatus("idle");
      setRejectionModal(getRejectionInfo(err.message || "Erro ao gerar Pix."));
    }
  }, [planId, cardEmail, cardDocType, cardDocNumber]);

  const copyPixCode = () => {
    if (pixData?.qrCode) {
      navigator.clipboard.writeText(pixData.qrCode);
      setPixCopied(true);
      setTimeout(() => setPixCopied(false), 2000);
    }
  };

  const isCardFormValid =
    cardNumber.replace(/\s/g, "").length >= 13 &&
    cardName.length >= 3 &&
    cardExpiry.length === 5 &&
    cardCVV.length >= 3 &&
    cardDocNumber.replace(/\D/g, "").length >= 11 &&
    cardEmail.includes("@");

  // ────────────────────────── INPUT CLASSES ──────────────────────────
  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backgroundColor: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(6px)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative w-full max-w-md overflow-y-auto rounded-2xl border border-slate-700/60 bg-slate-950 shadow-[0_0_80px_-10px_rgba(34,211,238,0.3)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-800">
          <div>
            <p className="text-xs uppercase tracking-widest text-cyan-400 mb-1">
              Simpleclaw Sync
            </p>
            <h2 className="text-xl font-bold text-white">
              {step === "plan" ? "Ativar Licença" : "Dados de Pagamento"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ═══════════════ STEP 1: Plan ═══════════════ */}
        {step === "plan" && (
          <>
            <div className="px-6 py-6 text-center border-b border-slate-800 bg-slate-900/40">
              <p className="text-slate-400 text-sm mb-2">
                {plan?.title ?? planId}
              </p>
              <div className="flex items-end justify-center gap-1">
                <span className="text-5xl font-extrabold text-white tracking-tight">
                  {plan?.price ?? "—"}
                </span>
                <span className="text-slate-400 text-lg mb-1">
                  {plan?.period ?? ""}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Cobrado mensalmente · Cancele quando quiser
              </p>
            </div>

            <div className="px-6 py-5">
              <ul className="space-y-3">
                {plan?.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-center gap-3 text-sm text-slate-300"
                  >
                    <span className="shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-cyan-500/15 border border-cyan-500/30">
                      <CheckIcon className="h-3 w-3 text-cyan-400" />
                    </span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="px-6 pb-6 space-y-3">
              <button
                onClick={() => setStep("form")}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-400 py-3.5 text-sm font-bold text-slate-900 transition hover:bg-cyan-300 active:scale-[0.98]"
              >
                Pagar Agora
              </button>
              <button
                onClick={async () => {
                  setBypassing(true);
                  try {
                    const res = await fetch("/api/subscription/bypass", {
                      method: "POST",
                    });
                    if (!res.ok) {
                      const data = await res.json();
                      throw new Error(data?.error ?? "Erro ao ativar demo");
                    }
                    router.push("/dashboard?payment=demo");
                  } catch {
                    setBypassing(false);
                  }
                }}
                disabled={bypassing}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-800/50 py-2.5 text-xs font-medium text-slate-400 transition hover:bg-slate-700/60 hover:text-white hover:border-slate-600 disabled:opacity-50"
              >
                {bypassing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                {bypassing ? "Ativando demo..." : "Testar sem pagar (Demo)"}
              </button>
              <div className="flex items-center justify-center gap-2 text-xs text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5" />
                Pagamento seguro
              </div>
            </div>
          </>
        )}

        {/* ═══════════════ STEP 2: Payment Form ═══════════════ */}
        {step === "form" && (
          <div className="px-6 py-5">
            {/* Back button */}
            <button
              onClick={() => {
                setStep("plan");
                setStatus("idle");
                setPixData(null);
              }}
              className="text-xs text-slate-500 hover:text-white mb-4 flex items-center gap-1 transition"
            >
              ← Voltar
            </button>

            {/* Method tabs */}
            <div className="flex gap-2 mb-5">
              <button
                onClick={() => {
                  setMethod("card");
                  setPixData(null);
                  setStatus("idle");
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  method === "card"
                    ? "bg-cyan-400 text-slate-900"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                💳 Cartão
              </button>
              <button
                onClick={() => {
                  setMethod("pix");
                  setStatus("idle");
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                  method === "pix"
                    ? "bg-cyan-400 text-slate-900"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                <label
                  htmlFor="pix"
                  className="flex items-center justify-center"
                >
                  <DollarSign className="w-4 h-4" /> Pix
                </label>
              </button>
            </div>

            {/* ─── Card ─── */}
            {method === "card" && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Número do cartão
                  </label>
                  <input
                    type="text"
                    placeholder="0000 0000 0000 0000"
                    value={cardNumber}
                    onChange={(e) =>
                      setCardNumber(formatCardNumber(e.target.value))
                    }
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    Nome no cartão
                  </label>
                  <input
                    type="text"
                    placeholder="NOME COMPLETO"
                    value={cardName}
                    onChange={(e) => setCardName(e.target.value.toUpperCase())}
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Validade
                    </label>
                    <input
                      type="text"
                      placeholder="MM/AA"
                      value={cardExpiry}
                      onChange={(e) =>
                        setCardExpiry(formatExpiry(e.target.value))
                      }
                      className={inputCls}
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      CVV
                    </label>
                    <input
                      type="text"
                      placeholder="123"
                      value={cardCVV}
                      onChange={(e) =>
                        setCardCVV(
                          e.target.value.replace(/\D/g, "").slice(0, 4),
                        )
                      }
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={cardEmail}
                    onChange={(e) => setCardEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="w-28">
                    <label className="block text-xs text-slate-400 mb-1">
                      Documento
                    </label>
                    <select
                      value={cardDocType}
                      onChange={(e) => setCardDocType(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="CPF">CPF</option>
                      <option value="CNPJ">CNPJ</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Número
                    </label>
                    <input
                      type="text"
                      placeholder={
                        cardDocType === "CPF"
                          ? "000.000.000-00"
                          : "00.000.000/0000-00"
                      }
                      value={cardDocNumber}
                      onChange={(e) =>
                        setCardDocNumber(formatDoc(e.target.value))
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                <button
                  disabled={!isCardFormValid || status === "loading"}
                  onClick={handleCardPayment}
                  className="w-full mt-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : status === "success" ? (
                    "✓ Pagamento processado"
                  ) : (
                    `Pagar ${plan?.price ?? "R$ 49,90"}`
                  )}
                </button>
              </div>
            )}

            {/* ─── Pix (form) ─── */}
            {method === "pix" && !pixData && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">
                    E-mail
                  </label>
                  <input
                    type="email"
                    placeholder="seu@email.com"
                    value={cardEmail}
                    onChange={(e) => setCardEmail(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="w-28">
                    <label className="block text-xs text-slate-400 mb-1">
                      Documento
                    </label>
                    <select
                      value={cardDocType}
                      onChange={(e) => setCardDocType(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-white focus:border-cyan-400 focus:outline-none"
                    >
                      <option value="CPF">CPF</option>
                      <option value="CNPJ">CNPJ</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-slate-400 mb-1">
                      Número
                    </label>
                    <input
                      type="text"
                      placeholder={
                        cardDocType === "CPF"
                          ? "000.000.000-00"
                          : "00.000.000/0000-00"
                      }
                      value={cardDocNumber}
                      onChange={(e) =>
                        setCardDocNumber(formatDoc(e.target.value))
                      }
                      className={inputCls}
                    />
                  </div>
                </div>

                <button
                  disabled={status === "loading"}
                  onClick={handlePixPayment}
                  className="w-full mt-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-900 transition hover:bg-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed flex justify-center items-center gap-2"
                >
                  {status === "loading" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando Pix...
                    </>
                  ) : (
                    "Gerar QR Code Pix"
                  )}
                </button>
              </div>
            )}

            {/* ─── Pix QR Code ─── */}
            {method === "pix" && pixData && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm text-slate-300">
                  Escaneie o QR Code ou copie o código Pix:
                </p>
                {pixData.qrCodeBase64 && (
                  <img
                    src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                    alt="QR Code Pix"
                    className="w-48 h-48 rounded-lg bg-white p-2"
                  />
                )}
                <button
                  onClick={copyPixCode}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-cyan-400 hover:bg-slate-700 transition"
                >
                  {pixCopied ? "✓ Código copiado!" : "📋 Copiar código Pix"}
                </button>
                <p className="text-xs text-slate-500 text-center">
                  Após a confirmação, você será redirecionado automaticamente.
                </p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════ SUCCESS overlay ═══════════ */}
        {postPaymentDialog && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/80 p-4 backdrop-blur-md rounded-2xl">
            <div className="w-full max-w-sm rounded-2xl border border-slate-700/60 bg-slate-900 p-6 shadow-2xl">
              {postPaymentDialog === "approved" ? (
                <>
                  {/* Success icon */}
                  <div className="flex justify-center mb-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/15 ring-4 ring-emerald-500/10">
                      <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                    </div>
                  </div>
                  <h3 className="text-center text-lg font-bold text-white">
                    Pagamento aprovado!
                  </h3>
                  <p className="mt-2 text-center text-sm text-slate-400">
                    Sua assinatura está ativa. Deseja ir para o dashboard e
                    fazer o deploy agora?
                  </p>
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={onClose}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                    >
                      Fechar
                    </button>
                    <button
                      onClick={() => router.push("/dashboard?payment=success")}
                      className="flex-1 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-cyan-300"
                    >
                      Ir ao dashboard
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/15 ring-4 ring-amber-500/10">
                      <CheckCircle2 className="h-8 w-8 text-amber-400" />
                    </div>
                  </div>
                  <h3 className="text-center text-lg font-bold text-white">
                    Pagamento em análise
                  </h3>
                  <p className="mt-2 text-center text-sm text-slate-400">
                    Recebemos seu pagamento. A confirmação pode levar alguns
                    minutos — você será notificado assim que for aprovado.
                  </p>
                  <div className="mt-5 flex gap-2">
                    <button
                      onClick={onClose}
                      className="flex-1 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                    >
                      Fechar
                    </button>
                    <button
                      onClick={() => router.push("/dashboard?payment=pending")}
                      className="flex-1 rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-cyan-300"
                    >
                      Ir ao dashboard
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ REJECTION modal ═══════════ */}
        {rejectionModal && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm rounded-2xl">
            <div className="w-full max-w-sm rounded-2xl border border-red-500/20 bg-slate-900 p-6 shadow-2xl">
              {/* Icon */}
              <div className="flex justify-center mb-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 ring-4 ring-red-500/10">
                  <AlertTriangle className="h-8 w-8 text-red-400" />
                </div>
              </div>

              <h3 className="text-center text-lg font-bold text-white">
                {rejectionModal.title}
              </h3>
              <p className="mt-2 text-center text-sm text-slate-400">
                {rejectionModal.hint}
              </p>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setRejectionModal(null)}
                  className="flex-1 rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-700"
                >
                  Tentar novamente
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:text-white"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
