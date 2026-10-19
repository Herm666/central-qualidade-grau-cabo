
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const PREFIX = "PLANILHA_QUALIDADE_2026:INICIAL:";

function authorized(request: Request) {
  const secret = process.env.GOOGLE_SHEETS_SYNC_SECRET;
  const supplied = request.headers.get("authorization");

  return Boolean(
    secret &&
    supplied &&
    supplied === `Bearer ${secret}`
  );
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const latest = await prisma.manifestation.findFirst({
      where: {
        sourceReference: { startsWith: PREFIX },
      },
      orderBy: { updatedAt: "desc" },
      select: { updatedAt: true },
    });

    return NextResponse.json({
      lastUpdated: latest?.updatedAt.toISOString() ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Falha ao consultar sincronização." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { error: "Não autorizado." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    if (!Array.isArray(body.rows) || body.rows.length > 2000) {
      return NextResponse.json(
        { error: "Lista de linhas inválida." },
        { status: 400 }
      );
    }

    let updated = 0;
    let unchanged = 0;
    let missing = 0;
    const errors: string[] = [];
    const seen = new Set<number>();

    for (const item of body.rows) {
      const row = Number(item.row);

      if (
        !Number.isInteger(row) ||
        row < 5 ||
        row > 100000 ||
        seen.has(row)
      ) {
        errors.push(`Linha inválida ou repetida: ${item.row}`);
        continue;
      }

      seen.add(row);

      const reference = `${PREFIX}${row}`;
      const rawDeadline = item.deadline;

      let deadline: Date | null = null;

      if (rawDeadline !== null && rawDeadline !== "") {
        if (
          typeof rawDeadline !== "string" ||
          !/^\d{4}-\d{2}-\d{2}$/.test(rawDeadline)
        ) {
          errors.push(`Prazo inválido na linha ${row}`);
          continue;
        }

        const [year, month, day] = rawDeadline
          .split("-")
          .map(Number);

        deadline = new Date(Date.UTC(year, month - 1, day));

        if (
          deadline.getUTCFullYear() !== year ||
          deadline.getUTCMonth() !== month - 1 ||
          deadline.getUTCDate() !== day
        ) {
          errors.push(`Data inexistente na linha ${row}`);
          continue;
        }
      }

      const existing = await prisma.manifestation.findFirst({
        where: { sourceReference: reference },
        select: { id: true, deadline: true },
      });

      if (!existing) {
        missing++;
        continue;
      }

      const oldDate = existing.deadline?.toISOString().slice(0, 10) ?? null;
      const newDate = deadline?.toISOString().slice(0, 10) ?? null;

      if (oldDate === newDate) {
        unchanged++;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        await tx.manifestation.update({
          where: { id: existing.id },
          data: { deadline },
        });

        await tx.manifestationHistory.create({
          data: {
            manifestationId: existing.id,
            action: "PRAZO_SINCRONIZADO",
            details: `Prazo atualizado pela planilha: ${oldDate ?? "vazio"} → ${newDate ?? "vazio"}.`,
          },
        });
      });

      updated++;
    }

    return NextResponse.json({
      success: true,
      updated,
      unchanged,
      missing,
      errors,
    });
  } catch (error) {
    console.error("Erro na sincronização da planilha:", error);

    return NextResponse.json(
      { error: "Falha na sincronização." },
      { status: 500 }
    );
  }
}
