
import * as XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";

const file = path.resolve(
  "PLANILHA DE QUALIDADE - GRAU CABO - 2026(1).xlsx"
);

const outputDir = path.resolve("relatorios-importacao");
const outputFile = path.join(outputDir, "previa-importacao.json");

if (!fs.existsSync(file)) {
  throw new Error(`Planilha não encontrada: ${file}`);
}

const workbook = XLSX.readFile(file, { cellDates: true });

type DateResult = {
  value: string;
  valid: boolean;
  reason?: string;
};

type PreviewSection = {
  totalRegistros?: number;
  datasInvalidas?: unknown[];
  prazosInvalidos?: unknown[];
  prazosAnterioresAData?: unknown[];
  possiveisDuplicidadesExatas?: unknown[];
  possiveisDuplicidadesDentroDoMes?: unknown[];
  contagemPorMes?: Record<string, number>;
  erro?: string;
};

const report: {
  arquivo: string;
  geradoEm: string;
  modo: string;
  abas: Record<string, unknown>;
} = {
  arquivo: path.basename(file),
  geradoEm: new Date().toISOString(),
  modo: "PREVIA — NAO GRAVA NO BANCO",
  abas: {},
};

function text(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  return String(value).trim();
}

function emptyRow(row: unknown[]): boolean {
  return row.every((value) => text(value) === "");
}

function parseDate(value: unknown, allowDayMonth = false): DateResult {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return {
        value: text(value),
        valid: false,
        reason: "Data inválida",
      };
    }

    return {
      value: value.toISOString().slice(0, 10),
      valid: true,
    };
  }

  if (typeof value === "number") {
    const parts = XLSX.SSF.parse_date_code(value);

    if (!parts) {
      return {
        value: String(value),
        valid: false,
        reason: "Número de data inválido",
      };
    }

    const date = new Date(
      Date.UTC(parts.y, parts.m - 1, parts.d)
    );

    return {
      value: date.toISOString().slice(0, 10),
      valid: true,
    };
  }

  const raw = text(value);

  if (!raw) {
    return {
      value: raw,
      valid: false,
      reason: "Data vazia",
    };
  }

  // Prazo no formato DD/MM: a regra confirmada para esta planilha é usar 2026.
  const dayMonth = raw.match(/^(\d{1,2})\/(\d{1,2})$/);

  if (dayMonth && allowDayMonth) {
    const day = Number(dayMonth[1]);
    const month = Number(dayMonth[2]);
    const year = 2026;
    const date = new Date(Date.UTC(year, month - 1, day));
    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;

    return valid
      ? {
          value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          valid: true,
        }
      : {
          value: raw,
          valid: false,
          reason: "Data DD/MM inválida para o ano de 2026",
        };
  }

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = Number(br[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;

    return valid
      ? {
          value: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          valid: true,
        }
      : {
          value: raw,
          valid: false,
          reason: "Data brasileira inválida",
        };
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);

  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    const day = Number(iso[3]);

    const date = new Date(Date.UTC(year, month - 1, day));

    const valid =
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day;

    return valid
      ? {
          value: `${iso[1]}-${iso[2]}-${iso[3]}`,
          valid: true,
        }
      : {
          value: raw,
          valid: false,
          reason: "Data ISO inválida",
        };
  }

  return {
    value: raw,
    valid: false,
    reason: "Formato de data não reconhecido",
  };
}

function inspectInitial(): Record<string, unknown> {
  const sheet = workbook.Sheets["INICIAL"];

  if (!sheet) {
    return { erro: "Aba INICIAL não encontrada" };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  const headers = (rows[3] ?? []).map(text);

  const dateIndex = headers.findIndex(
    (header) => header.toUpperCase() === "DATA"
  );

  const deadlineIndex = headers.findIndex(
    (header) => header.toUpperCase() === "PRAZO"
  );

  const issueIndex = headers.findIndex((header) => {
    const normalized = header
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();

    return normalized.includes("NAO CONFORMIDADES");
  });

  const records = rows
    .slice(4)
    .map((row, index) => {
      const data = dateIndex >= 0
        ? parseDate(row[dateIndex])
        : {
            value: "",
            valid: false,
            reason: "Coluna DATA não encontrada",
          };

      const rawDeadline =
        deadlineIndex >= 0 ? row[deadlineIndex] : "";

      const prazo = text(rawDeadline)
        ? parseDate(rawDeadline, true)
        : null;

      const dados: Record<string, string> = {};

      headers.forEach((header, i) => {
        if (header) dados[header] = text(row[i]);
      });

      return {
        linhaExcel: index + 5,
        dados,
        data,
        prazo,
        linhaVazia: emptyRow(row),
      };
    })
    .filter((record) => {
      if (record.linhaVazia) return false;

      const dataCell = text(record.dados[headers[dateIndex]]);
      const prazoCell = deadlineIndex >= 0
        ? text(record.dados[headers[deadlineIndex]])
        : "";
      const normalize = (value: string) =>
        value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

      // Ignora cabeçalhos repetidos dentro da aba.
      if (normalize(dataCell) === "DATA" && normalize(prazoCell) === "PRAZO") {
        return false;
      }

      // Ignora separadores de mês (ex.: JANEIRO) quando o restante da linha está vazio.
      const monthNames = new Set([
        "JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
        "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
      ]);
      const otherCellsEmpty = Object.entries(record.dados).every(([key, value]) =>
        key === headers[dateIndex] || value.trim() === ""
      );
      if (monthNames.has(normalize(dataCell)) && otherCellsEmpty) return false;

      return true;
    })
    .map(({ linhaVazia: _linhaVazia, ...record }) => record);

  const invalidDates = records.filter(
    (record) => !record.data.valid
  );

  const invalidDeadlines = records.filter(
    (record) => record.prazo && !record.prazo.valid
  );

  // Apenas sinaliza prazos anteriores. Não apaga nem modifica datas.
  const dateWarnings = records.filter((record) => {
    if (!record.prazo?.valid || !record.data.valid) {
      return false;
    }

    return record.prazo.value < record.data.value;
  });

  const fingerprints = new Map<string, number[]>();

  for (const record of records) {
    const key = JSON.stringify(record.dados);
    const lines = fingerprints.get(key) ?? [];

    lines.push(record.linhaExcel);
    fingerprints.set(key, lines);
  }

  const duplicates = [...fingerprints.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([registro, linhas]) => ({
      linhas,
      registro: JSON.parse(registro) as Record<string, string>,
    }));

  return {
    totalRegistros: records.length,
    cabecalhos: headers,
    datasInvalidas: invalidDates,
    prazosInvalidos: invalidDeadlines,
    prazosAnterioresAData: dateWarnings,
    possiveisDuplicidadesExatas: duplicates,
    primeirasLinhas: records.slice(0, 5),
    indiceDescricao: issueIndex,
  };
}

function inspectMonthly(): Record<string, unknown> {
  const sheet = workbook.Sheets["CONFORMIDADES"];

  if (!sheet) {
    return { erro: "Aba CONFORMIDADES não encontrada" };
  }

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  });

  const monthNames = new Set([
    "JANEIRO",
    "FEVEREIRO",
    "MARÇO",
    "MARCO",
    "ABRIL",
    "MAIO",
    "JUNHO",
    "JULHO",
    "AGOSTO",
    "SETEMBRO",
    "OUTUBRO",
    "NOVEMBRO",
    "DEZEMBRO",
  ]);

  const records: Array<Record<string, unknown>> = [];
  let currentMonth = "";

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const nonEmpty = row.map(text).filter(Boolean);

    if (nonEmpty.length === 1) {
      const candidate = nonEmpty[0].toUpperCase().trim();

      if (monthNames.has(candidate)) {
        currentMonth = candidate;
        continue;
      }
    }

    const normalized = row.map((value) =>
      text(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
    );

    const channelIndex = normalized.findIndex(
      (value) => value === "CANAL DE ATENDIMENTO"
    );

    const conformityIndex = normalized.findIndex(
      (value) => value === "CONFORMIDADES"
    );

    const directedIndex = normalized.findIndex(
      (value) => value === "DIRECIONADO"
    );

    const disclosureIndex = normalized.findIndex(
      (value) => value === "DIVULGACAO"
    );

    if (
      channelIndex >= 0 &&
      conformityIndex >= 0 &&
      directedIndex >= 0 &&
      disclosureIndex >= 0
    ) {
      continue;
    }

    if (!currentMonth || emptyRow(row)) continue;

    const channel = text(row[1]);
    const conformity = text(row[2]);
    const directed = text(row[3]);
    const disclosure = text(row[4]);

    if (!channel && !conformity && !directed && !disclosure) {
      continue;
    }

    records.push({
      linhaExcel: i + 1,
      mes: currentMonth,
      canal: channel,
      conformidade: conformity,
      direcionado: directed,
      divulgacao: disclosure,
    });
  }

  const counts: Record<string, number> = {};

  for (const record of records) {
    const month = String(record.mes);
    counts[month] = (counts[month] ?? 0) + 1;
  }

  const fingerprints = new Map<string, number[]>();

  for (const record of records) {
    const key = JSON.stringify({
      mes: record.mes,
      canal: record.canal,
      conformidade: record.conformidade,
      direcionado: record.direcionado,
      divulgacao: record.divulgacao,
    });

    const lines = fingerprints.get(key) ?? [];
    lines.push(Number(record.linhaExcel));
    fingerprints.set(key, lines);
  }

  const duplicates = [...fingerprints.entries()]
    .filter(([, lines]) => lines.length > 1)
    .map(([registro, linhas]) => ({
      linhas,
      registro: JSON.parse(registro) as Record<string, unknown>,
    }));

  return {
    totalRegistros: records.length,
    contagemPorMes: counts,
    mesesIdentificados: [
      ...new Set(records.map((record) => record.mes)),
    ],
    semDataIndividual: true,
    aviso:
      "A planilha não fornece data individual nesta aba; não atribuir dia fictício.",
    possiveisDuplicidadesDentroDoMes: duplicates,
    primeirasLinhas: records.slice(0, 10),
  };
}

function inspectDirector(): Record<string, unknown> {
  const sheet = workbook.Sheets["DANIEL DIRETOR"];

  if (!sheet) {
    return { erro: "Aba DANIEL DIRETOR não encontrada" };
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    sheet,
    {
      defval: "",
      raw: true,
    }
  );

  const records = rows.map((row, index) => ({
    linhaExcel: index + 2,
    dados: Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        text(value),
      ])
    ),
    data: parseDate(row["Timestamp"]),
  }));

  return {
    totalRegistros: records.length,
    datasInvalidas: records.filter((record) => !record.data.valid),
    primeirasLinhas: records.slice(0, 5),
    aviso:
      "Registros de formulário; conferir origem do canal antes da importação.",
  };
}

report.abas["INICIAL"] = inspectInitial();
report.abas["CONFORMIDADES"] = inspectMonthly();
report.abas["DANIEL DIRETOR"] = inspectDirector();

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(
  outputFile,
  JSON.stringify(report, null, 2),
  "utf8"
);

console.log("Prévia revisada concluída. Nenhum dado foi gravado no banco.");
console.log(`Relatório: ${outputFile}`);

for (const [name, value] of Object.entries(report.abas)) {
  const result = value as PreviewSection;

  console.log(
    `\n${name}: ${result.erro ?? `${result.totalRegistros ?? 0} registros`}`
  );

  if (result.datasInvalidas) {
    console.log(`Datas inválidas: ${result.datasInvalidas.length}`);
  }

  if (result.prazosInvalidos) {
    console.log(`Prazos inválidos: ${result.prazosInvalidos.length}`);
  }

  if (result.prazosAnterioresAData) {
    console.log(
      `Prazos anteriores à data: ${result.prazosAnterioresAData.length}`
    );
  }

  if (result.possiveisDuplicidadesExatas) {
    console.log(
      `Grupos de duplicidades exatas: ${result.possiveisDuplicidadesExatas.length}`
    );
  }

  if (result.possiveisDuplicidadesDentroDoMes) {
    console.log(
      `Grupos de duplicidades dentro do mês: ${result.possiveisDuplicidadesDentroDoMes.length}`
    );

    console.log(
      `Contagem por mês: ${JSON.stringify(result.contagemPorMes)}`
    );
  }
}
