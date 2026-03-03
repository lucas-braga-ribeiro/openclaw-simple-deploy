import { db } from "@/src/infrastructure/db/client";
import { paymentsTable } from "@/src/infrastructure/db/schema";
import { getSubscriptionRepository } from "@/src/application/container";
import { createClient as createSupabaseServerClient } from "@/src/infrastructure/auth/supabase";
import { NextResponse } from "next/server";

/**
 * POST /api/subscription/bypass
 *
 * Creates a demo subscription (no real payment) so the user can
 * explore the full platform without paying.
 *
 * This does NOT touch any Mercado Pago API — it only writes to the
 * local database, leaving the real payment flow completely untouched.
 */
export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 },
      );
    }

    const subRepo = getSubscriptionRepository();
    const existing = await subRepo.findByUser(user.id);

    // If user already has an active subscription, no-op
    if (existing && existing.status === "authorized") {
      return NextResponse.json(
        { error: "Você já possui uma assinatura ativa." },
        { status: 409 },
      );
    }

    const demoPreapprovalId = `demo-bypass-${user.id}`;
    const nextPaymentDate = new Date();
    nextPaymentDate.setDate(nextPaymentDate.getDate() + 30);

    // Create or update the subscription record
    if (existing && existing.mpPreapprovalId === demoPreapprovalId) {
      await subRepo.updateStatus(
        demoPreapprovalId,
        "authorized",
        nextPaymentDate,
      );
    } else if (!existing) {
      await subRepo.create({
        userId: user.id,
        mpPreapprovalId: demoPreapprovalId,
        status: "authorized",
        planId: "pro-monthly",
        maxAgents: 1,
        nextPaymentDate,
      });
    }

    // Insert a simulated "approved" payment so the billing history looks realistic
    const demoTransactionId = `demo-${user.id}-${Date.now()}`;
    await db.insert(paymentsTable).values({
      userId: user.id,
      transactionId: demoTransactionId,
      status: "approved",
      amount: "0.00",
      planId: "pro-monthly",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[subscription/bypass] Error:", error);
    return NextResponse.json(
      { error: "Erro ao ativar modo demo." },
      { status: 500 },
    );
  }
}
