import "server-only";

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

import {
  formatMadridTime,
  formatMinutes,
  formatSpanishDate,
  type StaffTimeReportData,
  type StaffTimeReportDay,
  type StaffTimeReportTeacher,
} from "./staffTime";

const A4_LANDSCAPE: [number, number] = [841.89, 595.28];
const BLUE = rgb(0.075, 0.192, 0.42);
const INK = rgb(0.11, 0.15, 0.2);
const MUTED = rgb(0.35, 0.4, 0.47);
const BORDER = rgb(0.79, 0.82, 0.86);
const SOFT = rgb(0.95, 0.965, 0.98);
const WHITE = rgb(1, 1, 1);

function safePdfText(value: unknown) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[•·]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...");
}

function wrap(text: string, font: PDFFont, size: number, width: number, maxLines = 3) {
  const words = safePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    let final = lines[maxLines - 1];
    while (final.length > 1 && font.widthOfTextAtSize(`${final}...`, size) > width) {
      final = final.slice(0, -1);
    }
    lines[maxLines - 1] = `${final}...`;
  }
  return lines.length ? lines : [""];
}

function drawWrapped(
  page: PDFPage,
  value: string,
  x: number,
  y: number,
  width: number,
  font: PDFFont,
  size: number,
  options: { color?: ReturnType<typeof rgb>; maxLines?: number; lineHeight?: number } = {}
) {
  const lines = value.includes("\n")
    ? value
        .split("\n")
        .flatMap((line) => wrap(line, font, size, width, 1))
        .slice(0, options.maxLines || 3)
    : wrap(value, font, size, width, options.maxLines || 3);
  const lineHeight = options.lineHeight || size + 1.5;
  lines.forEach((line, index) => {
    page.drawText(safePdfText(line), {
      x,
      y: y - index * lineHeight,
      size,
      font,
      color: options.color || INK,
    });
  });
}

function drawLabelValue(
  page: PDFPage,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  regular: PDFFont,
  bold: PDFFont
) {
  page.drawText(label, { x, y, size: 7.2, font: bold, color: MUTED });
  drawWrapped(page, value || "—", x, y - 11, width, regular, 8.5, { maxLines: 2 });
}

function sessionTimes(day: StaffTimeReportDay, side: "in" | "out") {
  return day.sessions
    .map((session) => formatMadridTime(side === "in" ? session.sign_in_at : session.sign_out_at))
    .join("\n");
}

function drawHeader(
  page: PDFPage,
  report: StaffTimeReportData,
  teacher: StaffTimeReportTeacher,
  regular: PDFFont,
  bold: PDFFont,
  continuation: boolean
) {
  const width = page.getWidth();
  page.drawRectangle({ x: 0, y: page.getHeight() - 62, width, height: 62, color: BLUE });
  page.drawText("REGISTRO MENSUAL DE JORNADA DE TRABAJO", {
    x: 28,
    y: page.getHeight() - 35,
    font: bold,
    size: 15.5,
    color: WHITE,
  });
  page.drawText(continuation ? "Continuación del registro individual" : "Registro individual de jornada", {
    x: 28,
    y: page.getHeight() - 50,
    font: regular,
    size: 8.5,
    color: rgb(0.84, 0.89, 0.98),
  });
  page.drawText(`Periodo: ${safePdfText(report.period_label)}`, {
    x: width - 220,
    y: page.getHeight() - 38,
    font: bold,
    size: 9,
    color: WHITE,
  });

  const top = page.getHeight() - 82;
  const company = report.company;
  drawLabelValue(page, "Empresa / Razón social", company.legal_employer_name, 28, top, 180, regular, bold);
  drawLabelValue(page, "CIF/NIF", company.tax_identifier, 220, top, 80, regular, bold);
  drawLabelValue(page, "Centro de trabajo", company.workplace_name, 315, top, 150, regular, bold);
  drawLabelValue(
    page,
    "Dirección del centro",
    `${company.workplace_address}, ${company.postcode} ${company.city}, ${company.province}, ${company.country}`,
    480,
    top,
    330,
    regular,
    bold
  );
  const employeeTop = top - 42;
  drawLabelValue(
    page,
    "Trabajador/a · Perfil",
    `${teacher.name} · ${teacher.staff_role_label}`,
    28,
    employeeTop,
    190,
    regular,
    bold
  );
  drawLabelValue(page, "DNI/NIE", teacher.dni_nie, 230, employeeTop, 92, regular, bold);
  drawLabelValue(page, "Puesto / Categoría", teacher.job_title, 335, employeeTop, 180, regular, bold);
  drawLabelValue(
    page,
    "Tipo de jornada",
    teacher.working_time_type === "full_time" ? "Tiempo completo" : "Tiempo parcial",
    528,
    employeeTop,
    105,
    regular,
    bold
  );
  drawLabelValue(
    page,
    "Horas semanales contratadas",
    `${teacher.contracted_weekly_hours.toLocaleString("es-ES", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} horas`,
    645,
    employeeTop,
    165,
    regular,
    bold
  );
  return employeeTop - 39;
}

function drawTable(
  page: PDFPage,
  days: StaffTimeReportDay[],
  startY: number,
  regular: PDFFont,
  bold: PDFFont
) {
  const x = 28;
  const columns = [
    { label: "Fecha", width: 58 },
    { label: "Día", width: 63 },
    { label: "Horario previsto", width: 106 },
    { label: "Hora de entrada", width: 84 },
    { label: "Hora de salida", width: 84 },
    { label: "Tiempo registrado", width: 78 },
    { label: "Situación / Incidencia", width: 312 },
  ];
  const totalWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const headerHeight = 22;
  page.drawRectangle({ x, y: startY - headerHeight, width: totalWidth, height: headerHeight, color: BLUE });
  let cellX = x;
  for (const column of columns) {
    drawWrapped(page, column.label, cellX + 4, startY - 9, column.width - 8, bold, 7, {
      color: WHITE,
      maxLines: 2,
      lineHeight: 7.5,
    });
    cellX += column.width;
  }
  let y = startY - headerHeight;
  for (const [index, day] of days.entries()) {
    const lineCount = Math.max(1, day.sessions.length);
    const rowHeight = Math.max(15, 9 + lineCount * 8);
    page.drawRectangle({
      x,
      y: y - rowHeight,
      width: totalWidth,
      height: rowHeight,
      color: index % 2 ? SOFT : WHITE,
      borderColor: BORDER,
      borderWidth: 0.35,
    });
    const values = [
      formatSpanishDate(day.date),
      day.weekday,
      day.planned,
      sessionTimes(day, "in"),
      sessionTimes(day, "out"),
      formatMinutes(day.registered_minutes, true),
      day.situation,
    ];
    cellX = x;
    columns.forEach((column, columnIndex) => {
      drawWrapped(page, values[columnIndex], cellX + 4, y - 10, column.width - 8, regular, 6.8, {
        maxLines: Math.max(2, lineCount),
        lineHeight: 7.8,
      });
      cellX += column.width;
    });
    y -= rowHeight;
  }
  return y;
}

function drawTotals(
  page: PDFPage,
  report: StaffTimeReportData,
  teacher: StaffTimeReportTeacher,
  y: number,
  regular: PDFFont,
  bold: PDFFont
) {
  const totals = teacher.totals;
  const difference = totals.registered_minutes - totals.planned_minutes;
  page.drawRectangle({ x: 28, y: y - 46, width: 785, height: 42, color: SOFT, borderColor: BORDER, borderWidth: 0.5 });
  page.drawText("Resumen del periodo", { x: 38, y: y - 17, size: 8.5, font: bold, color: BLUE });
  const values = [
    `Días con registro: ${totals.recorded_days}`,
    `Horas previstas: ${formatMinutes(totals.planned_minutes, true)}`,
    `Horas registradas: ${formatMinutes(totals.registered_minutes, true)}`,
    `Diferencia respecto al horario previsto: ${difference < 0 ? "-" : "+"}${formatMinutes(Math.abs(difference), true)}`,
    `Festivos / cierres: ${totals.closure_days}`,
    `Incidencias: ${totals.incidences}`,
    `Registros rectificados: ${totals.corrected_records}`,
  ];
  drawWrapped(page, values.join("   |   "), 38, y - 33, 762, regular, 7.2, { maxLines: 2, lineHeight: 9 });

  const correctedDays = teacher.days.filter((day) => day.corrected);
  let noteY = y - 58;
  if (correctedDays.length) {
    page.drawText("Anotaciones de rectificación", { x: 28, y: noteY, size: 8, font: bold, color: BLUE });
    noteY -= 11;
    const notes = correctedDays
      .map((day) => {
        const reasons = Array.from(
          new Set(day.sessions.map((session) => session.correction_reason).filter(Boolean))
        ).join("; ");
        return `${formatSpanishDate(day.date)} - Registro rectificado.${reasons ? ` Motivo: ${reasons}` : ""}`;
      })
      .join("   ");
    drawWrapped(page, notes, 28, noteY, 785, regular, 7, { maxLines: 3, lineHeight: 9 });
  }
  page.drawText(
    `Generado el ${new Intl.DateTimeFormat("es-ES", {
      timeZone: "Europe/Madrid",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(report.generated_at))} (Europe/Madrid)`,
    { x: 28, y: 16, size: 6.8, font: regular, color: MUTED }
  );
}

export async function generateStaffTimePdf(report: StaffTimeReportData) {
  const document = await PDFDocument.create();
  document.setTitle("Registro mensual de jornada de trabajo");
  document.setSubject(`Registro de jornada - ${report.period_label}`);
  document.setAuthor(report.company.legal_employer_name);
  document.setCreator("Sydney School Portal");
  document.setCreationDate(new Date(report.generated_at));
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const pageRefs: PDFPage[] = [];

  for (const teacher of report.teachers) {
    const chunks: StaffTimeReportDay[][] = [];
    for (let index = 0; index < teacher.days.length; index += 20) {
      chunks.push(teacher.days.slice(index, index + 20));
    }
    if (!chunks.length) chunks.push([]);
    chunks.forEach((days, index) => {
      const page = document.addPage(A4_LANDSCAPE);
      pageRefs.push(page);
      const tableStart = drawHeader(page, report, teacher, regular, bold, index > 0);
      const tableEnd = drawTable(page, days, tableStart, regular, bold);
      if (index === chunks.length - 1) {
        drawTotals(page, report, teacher, tableEnd - 7, regular, bold);
      }
    });
  }

  pageRefs.forEach((page, index) => {
    const label = `Página ${index + 1} de ${pageRefs.length}`;
    page.drawText(label, {
      x: page.getWidth() - 28 - regular.widthOfTextAtSize(label, 6.8),
      y: 16,
      size: 6.8,
      font: regular,
      color: MUTED,
    });
  });
  return document.save();
}
