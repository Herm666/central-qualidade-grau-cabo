
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();

const FILE = path.resolve(
  "PLANILHA DE QUALIDADE - GRAU CABO - 2026(1).xlsx"
);
const REPORT_DIR = path.resolve("relatorios-importacao");
const REPORT_FILE = path.join(REPORT_DIR, "resultado-importacao.json");
const PREFIX = "PLANILHA_QUALIDADE_2026:INICIAL:";
const APPLY = process.argv.includes("--apply");
const CONFIRM = process.argv.includes("--confirm-import-qualidade-2026");

type ManifestationStatus =
  | "PENDENTE"
  | "EM_ANALISE"
  | "EM_ANDAMENTO"
  | "CONCLUIDO"
  | "INDEFERIDO";

type PlannedManifestation = {
  row: number;
  sourceReference: string;
  date: Date | null;
  issue: string;
  action: string | null;
  deadline: Date | null;
  channel: string;
  location: string;
  responsible: string;
  status: ManifestationStatus;
  disclosure: boolean;
  problems: string[];
};

type PlannedFeedback = {
  row: number;
  date: Date | null;
  message: string;
  sector: string | null;
  className: string | null;
  problems: string[];
};

type ReportRow = {
  row: number;
  reasons: string[];
  [key: string]: unknown;
};

let workbook: XLSX.WorkBook;

function txt(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function norm(value: unknown): string {
  return txt(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function parseDate(
  value: unknown,
  keepTime = false
): { date: Date | null; error?: string } {
  if (value === null || value === undefined || txt(value) === "") {
    return { date: null, error: "Data vazia" };
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return { date: null, error: "Data inválida" };
    }

    if (keepTime) {
      return { date: new Date(value.getTime()) };
    }

    return {
      date: new Date(
        Date.UTC(
          value.getUTCFullYear(),
          value.getUTCMonth(),
          value.getUTCDate()
        )
      ),
    };
  }

  if (typeof value === "number") {
    const parts = XLSX.SSF.parse_date_code(value);

    if (!parts) {
      return { date: null, error: "Número de data inválido" };
    }

    return {
      date: new Date(
        Date.UTC(
          parts.y,
          parts.m - 1,
          parts.d,
          keepTime ? parts.H : 0,
          keepTime ? parts.M : 0,
          keepTime ? Math.floor(parts.S) : 0
        )
      ),
    };
  }

  const raw = txt(value);
  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return { date: null, error: "Data brasileira inválida" };
    }

    return { date };
  }

  if (/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(raw)) {
    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
      return { date: null, error: "Data ISO inválida" };
    }

    if (keepTime && raw.includes("T")) {
      return { date };
    }

    return {
      date: new Date(
        Date.UTC(
          date.getUTCFullYear(),
          date.getUTCMonth(),
          date.getUTCDate()
        )
      ),
    };
  }

  return { date: null, error: "Formato de data não reconhecido" };
}

function statusFromSheet(value: string): ManifestationStatus {
  switch (norm(value)) {
    case "OK":
    case "CONCLUIDO":
    case "CONCLUIDA":
    case "FINALIZADO":
    case "FINALIZADA":
      return "CONCLUIDO";

    case "EM ANALISE":
      return "EM_ANALISE";

    case "EM ANDAMENTO":
      return "EM_ANDAMENTO";

    case "INDEFERIDO":
    case "INDEFERIDA":
      return "INDEFERIDO";

    case "PENDENTE":
      return "PENDENTE";

    default:
      return "PENDENTE";
  }
}

function readRows(sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`A aba "${sheetName}" não foi encontrada.`);
  }

  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });
}

function headerIndex(headers: string[], name: string): number {
  return headers.findIndex((header) => norm(header) === norm(name));
}

function readInitial(): PlannedManifestation[] {
  const rows = readRows("INICIAL");
  const headers = (rows[3] ?? []).map(txt);

  const idx = {
    date: headerIndex(headers, "DATA"),
    channel: headerIndex(headers, "CANAL DE ATENDIMENTO"),
    issue: headers.findIndex((h) =>
      norm(h).includes("NAO CONFORMIDADES")
    ),
    location: headerIndex(headers, "LOCAL"),
    action: headerIndex(headers, "AÇÃO"),
    responsible: headerIndex(headers, "RESPONSAVEL"),
    deadline: headerIndex(headers, "PRAZO"),
    status: headerIndex(headers, "STATUS"),
    disclosure: headers.findIndex((h) =>
      norm(h).includes("DIVULGACAO")
    ),
  };

  if (idx.date < 0 || idx.issue < 0) {
    throw new Error(
      "Não foi possível identificar DATA e NÃO CONFORMIDADES na aba INICIAL."
    );
  }

  const result: PlannedManifestation[] = [];

  rows.slice(4).forEach((row, index) => {
    if (row.every((value) => txt(value) === "")) return;

    const excelRow = index + 5;
    const parsedDate = parseDate(row[idx.date]);
    const issue = txt(row[idx.issue]);
    const problems: string[] = [];

    if (!parsedDate.date) {
      problems.push(`Data inválida: ${txt(row[idx.date])}`);
    }

    if (!issue) {
      problems.push("Descrição vazia");
    }

    const rawDeadline = idx.deadline >= 0
      ? row[idx.deadline]
      : "";

    const parsedDeadline = txt(rawDeadline)
      ? parseDate(rawDeadline)
      : { date: null };

    let deadline = parsedDeadline.date;

    if (txt(rawDeadline) && !parsedDeadline.date) {
      problems.push(`Prazo inválido: ${txt(rawDeadline)}`);
    }

    if (
      deadline &&
      parsedDate.date &&
      deadline.getTime() < parsedDate.date.getTime()
    ) {
      problems.push(
        `Prazo anterior à manifestação: ${txt(rawDeadline)}`
      );
      deadline = null;
    }

    result.push({
      row: excelRow,
      sourceReference: `${PREFIX}${excelRow}`,
      date: parsedDate.date,
      issue,
      action: idx.action >= 0 ? txt(row[idx.action]) || null : null,
      deadline,
      channel: idx.channel >= 0 ? txt(row[idx.channel]) : "",
      location: idx.location >= 0 ? txt(row[idx.location]) : "",
      responsible:
        idx.responsible >= 0 ? txt(row[idx.responsible]) : "",
      status:
        idx.status >= 0
          ? statusFromSheet(txt(row[idx.status]))
          : "PENDENTE",
      disclosure:
        idx.disclosure >= 0 &&
        ["SIM", "S", "YES", "TRUE", "1"].includes(
          norm(row[idx.disclosure])
        ),
      problems,
    });
  });

  return result;
}

function readDirector(): PlannedFeedback[] {
  const rows = readRows("DANIEL DIRETOR");
  const headers = (rows[0] ?? []).map(txt);

  const timestampIdx = headerIndex(headers, "Timestamp");
  const messageIdx = headers.findIndex((h) =>
    norm(h).includes("DESCREVA O PROBLEMA OU SUGESTAO")
  );
  const sectorIdx = headers.findIndex((h) =>
    norm(h).includes("QUAL SETOR VOCE SE REFERE")
  );
  const classIdx = headers.findIndex((h) =>
    norm(h).includes("QUAL SUA TURMA")
  );
  const classFallbackIdx = headerIndex(headers, "Turma");

  if (timestampIdx < 0 || messageIdx < 0) {
    throw new Error(
      "Não foi possível identificar Timestamp e mensagem em DANIEL DIRETOR."
    );
  }

  const result: PlannedFeedback[] = [];

  rows.slice(1).forEach((row, index) => {
    if (row.every((value) => txt(value) === "")) return;

    const parsed = parseDate(row[timestampIdx], true);
    const message = txt(row[messageIdx]);
    const problems: string[] = [];

    if (!parsed.date) {
      problems.push(`Timestamp inválido: ${txt(row[timestampIdx])}`);
    }

    if (!message) {
      problems.push("Mensagem vazia");
    }

    const classValue =
      classIdx >= 0
        ? txt(row[classIdx])
        : classFallbackIdx >= 0
          ? txt(row[classFallbackIdx])
          : "";

    result.push({
      row: index + 2,
      date: parsed.date,
      message,
      sector: sectorIdx >= 0 ? txt(row[sectorIdx]) || null : null,
      className: classValue || null,
      problems,
    });
  });

  return result;
}

function feedbackKey(
  date: Date,
  message: string,
  sector: string | null,
  className: string | null
): string {
  return JSON.stringify([
    date.getTime(),
    message,
    sector ?? "",
    className ?? "",
  ]);
}

async function findOrCreateLookup(
  kind: "channel" | "location" | "responsible" | "category",
  sourceName: string,
  cache: Map<string, string>
): Promise<string | null> {
  const name = sourceName.trim();
  if (!name) return null;

  const key = norm(name);
  const cached = cache.get(key);
  if (cached) return cached;

  if (kind === "channel") {
    const rows = await prisma.channel.findMany({
      select: { id: true, name: true },
    });
    const found = rows.find((item) => norm(item.name) === key);
    const item = found ?? await prisma.channel.create({ data: { name } });
    cache.set(key, item.id);
    return item.id;
  }

  if (kind === "location") {
    const rows = await prisma.location.findMany({
      select: { id: true, name: true },
    });
    const found = rows.find((item) => norm(item.name) === key);
    const item = found ?? await prisma.location.create({ data: { name } });
    cache.set(key, item.id);
    return item.id;
  }

  if (kind === "responsible") {
    const rows = await prisma.responsible.findMany({
      select: { id: true, name: true },
    });
    const found = rows.find((item) => norm(item.name) === key);
    const item = found ?? await prisma.responsible.create({ data: { name } });
    cache.set(key, item.id);
    return item.id;
  }

  const rows = await prisma.category.findMany({
    select: { id: true, name: true },
  });
  const categoryName = "Não conformidade";
  const found = rows.find((item) => norm(item.name) === norm(categoryName));
  const item = found ?? await prisma.category.create({
    data: { name: categoryName },
  });
  cache.set(key, item.id);
  return item.id;
}

async function main() {
  if (!fs.existsSync(FILE)) {
    throw new Error(`Planilha não encontrada: ${FILE}`);
  }

  if (APPLY && !CONFIRM) {
    throw new Error(
      "Para gravar, informe --apply --confirm-import-qualidade-2026."
    );
  }

  workbook = XLSX.readFile(FILE, { cellDates: true });

  const manifestations = readInitial();
  const feedbacks = readDirector();

  // Checagem de registros já importados anteriormente por este script.
  const existingManifestations = await prisma.manifestation.findMany({
    where: { sourceReference: { startsWith: PREFIX } },
    select: { sourceReference: true },
  });

  const existingRefs = new Set(
    existingManifestations
      .map((item) => item.sourceReference)
      .filter((item): item is string => Boolean(item))
  );

  // Carrega os feedbacks para verificar repetições sem gravar nada.
  const existingFeedbacks = await prisma.feedback.findMany({
    select: {
      date: true,
      message: true,
      sector: true,
      className: true,
    },
  });

  const feedbackKeys = new Set(
    existingFeedbacks.map((item) =>
      feedbackKey(item.date, item.message, item.sector, item.className)
    )
  );

  const plannedManifestations: ReportRow[] = manifestations.map((item) => {
    const reasons = [...item.problems];

    if (existingRefs.has(item.sourceReference)) {
      reasons.push("Já importada anteriormente");
    }

    if (!item.date || !item.issue) {
      reasons.push("Não elegível para importação");
    }

    return { ...item, reasons };
  });

  const plannedFeedbacks: ReportRow[] = feedbacks.map((item) => {
    const reasons = [...item.problems];

    if (
      item.date &&
      item.message &&
      feedbackKeys.has(
        feedbackKey(item.date, item.message, item.sector, item.className)
      )
    ) {
      reasons.push("Feedback igual já existente no banco");
    }

    if (!item.date || !item.message) {
      reasons.push("Não elegível para importação");
    }

    return { ...item, reasons };
  });

  const readyManifestations = manifestations.filter(
    (item) => item.date && item.issue && !existingRefs.has(item.sourceReference)
  );

  // Também detecta repetições entre linhas da própria planilha.
  const seenFeedbackKeys = new Set(feedbackKeys);
  const readyFeedbacks = feedbacks.filter((item) => {
    if (!item.date || !item.message) return false;

    const key = feedbackKey(
      item.date,
      item.message,
      item.sector,
      item.className
    );

    if (seenFeedbackKeys.has(key)) return false;

    seenFeedbackKeys.add(key);
    return true;
  });

  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    mode: APPLY ? "APLICAÇÃO CONFIRMADA" : "PRÉVIA — SOMENTE LEITURA",
    sourceFile: path.basename(FILE),
    policy: {
      initial:
        "Importar manifestações com data válida e descrição preenchida.",
      deadlines:
        "Prazo inválido ou anterior à manifestação fica nulo; datas válidas são preservadas.",
      director:
        "Importar feedbacks com timestamp válido e mensagem preenchida.",
      conformidades: "Não importada nesta etapa.",
      existingData: "Não atualizar nem excluir registros existentes.",
    },
    summary: {
      initialRows: manifestations.length,
      initialReady: readyManifestations.length,
      initialInvalidDate: manifestations.filter((item) => !item.date).length,
      initialEmptyDescription: manifestations.filter((item) => !item.issue).length,
      initialAlreadyImported: manifestations.filter((item) =>
        existingRefs.has(item.sourceReference)
      ).length,
      initialInvalidDeadline: manifestations.filter((item) =>
        item.problems.some((problem) => problem.startsWith("Prazo inválido:"))
      ).length,
      initialEarlierDeadline: manifestations.filter((item) =>
        item.problems.some((problem) =>
          problem.startsWith("Prazo anterior à manifestação:")
        )
      ).length,
      directorRows: feedbacks.length,
      directorReady: readyFeedbacks.length,
      directorInvalidTimestamp: feedbacks.filter((item) => !item.date).length,
      directorEmptyMessage: feedbacks.filter((item) => !item.message).length,
      directorDuplicatesOrExisting: feedbacks.length -
        readyFeedbacks.length -
        feedbacks.filter((item) => !item.date || !item.message).length,
      conformidadesImported: 0,
      createdManifestations: 0,
      createdFeedbacks: 0,
    },
    initialRows: plannedManifestations,
    directorRows: plannedFeedbacks,
  };

  if (APPLY) {
    // Evita gravar se houver qualquer problema inesperado de leitura.
    // Cada criação usa uma transação para manter as referências consistentes.
    for (const item of readyManifestations) {
      await prisma.$transaction(async (tx) => {
        const lookup = async (
          kind: "channel" | "location" | "responsible" | "category",
          name: string,
          cache: Map<string, string>
        ): Promise<string | null> => {
          if (!name.trim()) return null;

          const key = norm(name);
          const cached = cache.get(key);
          if (cached) return cached;

          if (kind === "channel") {
            const all = await tx.channel.findMany({
              select: { id: true, name: true },
            });
            const found = all.find((x) => norm(x.name) === key);
            const row = found ?? await tx.channel.create({ data: { name } });
            cache.set(key, row.id);
            return row.id;
          }

          if (kind === "location") {
            const all = await tx.location.findMany({
              select: { id: true, name: true },
            });
            const found = all.find((x) => norm(x.name) === key);
            const row = found ?? await tx.location.create({ data: { name } });
            cache.set(key, row.id);
            return row.id;
          }

          if (kind === "responsible") {
            const all = await tx.responsible.findMany({
              select: { id: true, name: true },
            });
            const found = all.find((x) => norm(x.name) === key);
            const row = found ?? await tx.responsible.create({ data: { name } });
            cache.set(key, row.id);
            return row.id;
          }

          const categoryName = "Não conformidade";
          const all = await tx.category.findMany({
            select: { id: true, name: true },
          });
          const found = all.find((x) => norm(x.name) === norm(categoryName));
          const row = found ?? await tx.category.create({
            data: { name: categoryName },
          });
          cache.set(key, row.id);
          return row.id;
        };

        const channelId = await lookup("channel", item.channel, channelCache);
        const locationId = await lookup("location", item.location, locationCache);
        const responsibleId = await lookup(
          "responsible",
          item.responsible,
          responsibleCache
        );
        const categoryId = await lookup(
          "category",
          "Não conformidade",
          categoryCache
        );

        // Segunda verificação dentro da transação para evitar repetição em reexecuções.
        const alreadyExists = await tx.manifestation.findFirst({
          where: { sourceReference: item.sourceReference },
          select: { id: true },
        });

        if (alreadyExists) return;

        await tx.manifestation.create({
          data: {
            date: item.date!,
            issue: item.issue,
            title: `Manifestação histórica - linha ${item.row}`,
            action: item.action,
            deadline: item.deadline,
            status: item.status,
            disclosure: item.disclosure,
            sourceReference: item.sourceReference,
            channelId,
            locationId,
            responsibleId,
            categoryId,
          },
        });

        (report.summary as Record<string, number>).createdManifestations++;
      });
    }

    for (const item of readyFeedbacks) {
      await prisma.$transaction(async (tx) => {
        const existing = await tx.feedback.findFirst({
          where: {
            date: item.date!,
            message: item.message,
            sector: item.sector,
            className: item.className,
          },
          select: { id: true },
        });

        if (existing) return;

        await tx.feedback.create({
          data: {
            date: item.date!,
            message: item.message,
            sector: item.sector,
            className: item.className,
            status: "NOVO",
            channelId: null,
          },
        });

        (report.summary as Record<string, number>).createdFeedbacks++;
      });
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2), "utf8");

  console.log("\nRESUMO DA IMPORTAÇÃO");
  console.log(JSON.stringify(report.summary, null, 2));
  console.log(`\nModo: ${report.mode}`);
  console.log(`Relatório: ${REPORT_FILE}`);
  console.log("CONFORMIDADES: pendente, não importada.");
  console.log(
    APPLY
      ? "Processo de gravação finalizado. Confira o relatório."
      : "Nenhum registro foi gravado. Esta foi apenas a prévia."
  );
}

const channelCache = new Map<string, string>();
const locationCache = new Map<string, string>();
const responsibleCache = new Map<string, string>();
const categoryCache = new Map<string, string>();

main()
  .catch((error) => {
    console.error("IMPORTAÇÃO INTERROMPIDA:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
