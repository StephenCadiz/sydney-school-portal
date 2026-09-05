import "server-only";

import ExcelJS from "exceljs";

import {
  formatMadridTime,
  formatSpanishDate,
  type StaffTimeReportData,
} from "./staffTime";

const HEADER_FILL = "FF13316B";
const SUBTLE_FILL = "FFEFF3F8";
const BORDER = "FFD0D7E2";

export async function generateStaffTimeXlsx(report: StaffTimeReportData) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Sydney School Portal";
  workbook.created = new Date(report.generated_at);
  workbook.modified = new Date(report.generated_at);
  workbook.subject = `Registro de jornada - ${report.period_label}`;
  workbook.title = "Registro mensual de jornada de trabajo";
  const sheet = workbook.addWorksheet("Registro de jornada", {
    properties: { showGridLines: false },
    pageSetup: {
      paperSize: 9,
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.45,
        bottom: 0.45,
        header: 0.15,
        footer: 0.15,
      },
    },
  });

  sheet.mergeCells("A1:O1");
  const title = sheet.getCell("A1");
  title.value = "REGISTRO MENSUAL DE JORNADA DE TRABAJO";
  title.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 16 };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  title.alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 30;
  sheet.mergeCells("A2:O2");
  sheet.getCell("A2").value = `Periodo: ${report.period_label}`;
  sheet.getCell("A2").font = { bold: true, color: { argb: "FF13316B" } };
  sheet.mergeCells("A3:G3");
  sheet.getCell("A3").value = `Empresa / Razón social: ${report.company.legal_employer_name}`;
  sheet.mergeCells("H3:O3");
  sheet.getCell("H3").value = `CIF/NIF: ${report.company.tax_identifier}`;
  sheet.mergeCells("A4:G4");
  sheet.getCell("A4").value = `Centro de trabajo: ${report.company.workplace_name}`;
  sheet.mergeCells("H4:O4");
  sheet.getCell("H4").value = `Dirección: ${report.company.workplace_address}, ${report.company.postcode} ${report.company.city}, ${report.company.province}, ${report.company.country}`;
  for (const rowNumber of [2, 3, 4]) {
    sheet.getRow(rowNumber).font = { size: 10 };
    sheet.getRow(rowNumber).alignment = { vertical: "middle" };
  }

  const headers = [
    "Trabajador/a",
    "Perfil",
    "DNI/NIE",
    "Puesto / Categoría",
    "Tipo de jornada",
    "Horas semanales contratadas",
    "Fecha",
    "Día",
    "Horario previsto",
    "Entrada(s)",
    "Salida(s)",
    "Horas registradas",
    "Situación",
    "Incidencia",
    "Rectificado",
  ];
  const headerRow = sheet.getRow(6);
  headerRow.values = headers;
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: BORDER } } };
  });

  for (const teacher of report.teachers) {
    for (const day of teacher.days) {
      const row = sheet.addRow([
        teacher.name,
        teacher.staff_role_label,
        teacher.dni_nie,
        teacher.job_title,
        teacher.working_time_type === "full_time" ? "Tiempo completo" : "Tiempo parcial",
        teacher.contracted_weekly_hours,
        formatSpanishDate(day.date),
        day.weekday,
        day.planned,
        day.sessions.map((session) => formatMadridTime(session.sign_in_at)).join("\n"),
        day.sessions.map((session) => formatMadridTime(session.sign_out_at)).join("\n"),
        day.registered_minutes / 60,
        day.situation,
        day.incidence || "—",
        day.corrected ? "Sí" : "No",
      ]);
      row.height = Math.max(20, 13 * Math.max(1, day.sessions.length));
      row.eachCell((cell, columnNumber) => {
        cell.alignment = { vertical: "top", wrapText: true };
        cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
        if (columnNumber === 6 || columnNumber === 12) cell.numFmt = "0.00";
      });
      if (day.corrected) {
        row.getCell(15).note = day.sessions
          .filter((session) => session.corrected)
          .map(
            (session) =>
              `Registro rectificado. Motivo: ${session.correction_reason || "No indicado"}`
          )
          .join("\n");
      }
    }
  }

  sheet.columns = [
    { width: 28 },
    { width: 16 },
    { width: 15 },
    { width: 23 },
    { width: 18 },
    { width: 18 },
    { width: 13 },
    { width: 14 },
    { width: 22 },
    { width: 15 },
    { width: 15 },
    { width: 17 },
    { width: 27 },
    { width: 34 },
    { width: 14 },
  ];
  sheet.views = [{ state: "frozen", ySplit: 6 }];
  sheet.autoFilter = { from: "A6", to: `O${Math.max(6, sheet.rowCount)}` };
  sheet.headerFooter.oddFooter =
    "&LRegistro de jornada - uso administrativo&C&P de &N&RGenerado por Sydney School Portal";
  sheet.pageSetup.printTitlesRow = "1:6";

  const summary = workbook.addWorksheet("Resumen", {
    properties: { showGridLines: false },
  });
  summary.mergeCells("A1:I1");
  summary.getCell("A1").value = `RESUMEN DEL REGISTRO DE JORNADA — ${report.period_label}`;
  summary.getCell("A1").font = {
    bold: true,
    size: 15,
    color: { argb: "FFFFFFFF" },
  };
  summary.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_FILL },
  };
  summary.getRow(1).height = 28;
  const summaryHeaders = [
    "Trabajador/a",
    "Perfil",
    "Días con registro",
    "Horas previstas",
    "Horas registradas",
    "Diferencia respecto al horario previsto",
    "Festivos / cierres",
    "Incidencias",
    "Registros rectificados",
  ];
  const summaryHeader = summary.addRow(summaryHeaders);
  summaryHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  summaryHeader.height = 28;
  report.teachers.forEach((teacher, index) => {
    const totals = teacher.totals;
    const row = summary.addRow([
      teacher.name,
      teacher.staff_role_label,
      totals.recorded_days,
      totals.planned_minutes / 60,
      totals.registered_minutes / 60,
      (totals.registered_minutes - totals.planned_minutes) / 60,
      totals.closure_days,
      totals.incidences,
      totals.corrected_records,
    ]);
    row.eachCell((cell, column) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 ? SUBTLE_FILL : "FFFFFFFF" },
      };
      cell.border = { bottom: { style: "hair", color: { argb: BORDER } } };
      if (column >= 4 && column <= 6) cell.numFmt = "0.00";
    });
  });
  summary.columns = [
    { width: 30 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 27 },
    { width: 18 },
    { width: 15 },
    { width: 22 },
  ];
  summary.views = [{ state: "frozen", ySplit: 2 }];
  summary.pageSetup = {
    paperSize: 9,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
