(function initializeOverviewExport(root) {
  "use strict";

  const overviewData = typeof module !== "undefined" && module.exports
    ? require("./overview.js")
    : root.OverviewData;
  const {
    DATASET_LABELS,
    FIELD_LABELS,
    VISIBLE_DATASET_NAMES,
    collectDatasetTableColumns,
    datasetRows,
  } = overviewData;
  const DEFAULT_COLUMNS = Object.freeze({
    forecast: ["id", "province_code", "trading_date", "period", "time_slot", "load_forecast_mw", "non_market_forecast_mw", "renewable_forecast_mw", "external_import_mw", "source_file", "uploaded_at"],
    coalForecast: ["trading_date", "time_slot", "period", "coal_forecast_mw", "coal_linear_mw", "coal_rf_mw", "coal_bagging_mw", "coal_catboost_mw", "coal_lightgbm_mw", "coal_xgboost_mw"],
    priceForecast: ["trading_date", "time_slot", "period", "realtime_ensemble_price", "realtime_linear_price", "realtime_rf_price", "realtime_bagging_price", "realtime_catboost_price", "realtime_lightgbm_price", "realtime_xgboost_price"],
    rollingAuction: ["trading_date", "time_slot", "d2_mid_price", "d2_low_price", "d2_high_price"],
    temperature: ["trading_date", "time_slot", "actual_temperature_c", "forecast_temperature_c"],
    realtime: ["id", "province_code", "trading_date", "period", "time_slot", "actual_load_mw", "non_market_gen_mw", "renewable_gen_mw", "renewable_solar_gen_mw", "renewable_wind_gen_mw", "tie_line_mw", "source_file", "uploaded_at"],
    clearing: ["trading_date", "period", "time_slot", "day_ahead_price", "realtime_price", "storage_mw", "other_mw", "distributed_pv_mw", "solar_mw", "nuclear_mw", "hydro_mw", "gas_mw", "oil_mw", "coal_mw", "wind_mw", "thermal_units", "thermal_total_mw"],
  });

  function parseIsoDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) throw new Error("Expected a strict ISO date (YYYY-MM-DD).");
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error("Expected a valid ISO date.");
    }
    return date;
  }

  function enumerateIsoDates(startDate, endDate) {
    const start = parseIsoDate(startDate);
    const end = parseIsoDate(endDate);
    if (end < start) throw new Error("End date must not precede start date.");
    const dates = [];
    for (let current = start; current <= end; current = new Date(current.getTime() + 86400000)) {
      dates.push(current.toISOString().slice(0, 10));
    }
    return dates;
  }

  function selectedDatasetNames(datasetNames) {
    if (!Array.isArray(datasetNames) || datasetNames.length === 0) {
      throw new Error("Select at least one dataset.");
    }
    const selected = new Set(datasetNames);
    if (Array.from(selected).some((name) => !VISIBLE_DATASET_NAMES.includes(name))) {
      throw new Error("Unsupported dataset selected.");
    }
    return VISIBLE_DATASET_NAMES.filter((name) => selected.has(name));
  }

  function timeSlotValue(value) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  }

  function sortRows(rows) {
    return rows.map((row, index) => ({ row, index })).sort((left, right) => (
      String(left.row.trading_date || "").localeCompare(String(right.row.trading_date || ""))
      || timeSlotValue(left.row.time_slot) - timeSlotValue(right.row.time_slot)
      || Number(left.row.period ?? Number.MAX_SAFE_INTEGER) - Number(right.row.period ?? Number.MAX_SAFE_INTEGER)
      || left.index - right.index
    )).map(({ row }) => row);
  }

  function prepareOverviewExport(options) {
    const startDate = String(options?.startDate || "");
    const endDate = String(options?.endDate || "");
    const dates = enumerateIsoDates(startDate, endDate);
    const datasetNames = selectedDatasetNames(options?.datasetNames);
    const payloadsByDate = options?.payloadsByDate || {};
    const failedDates = new Set(options?.failedDates || []);
    const rowsByDataset = Object.fromEntries(datasetNames.map((name) => [name, []]));
    const missing = [];
    const missingKeys = new Set();

    const addMissing = (date, dataset) => {
      const key = `${date}\u0000${dataset}`;
      if (missingKeys.has(key)) return;
      missingKeys.add(key);
      missing.push({ date, dataset, label: DATASET_LABELS[dataset] });
    };

    dates.forEach((date) => {
      const hasPayload = Object.prototype.hasOwnProperty.call(payloadsByDate, date);
      const payload = payloadsByDate[date];
      datasetNames.forEach((dataset) => {
        if (!hasPayload || failedDates.has(date)) {
          addMissing(date, dataset);
          return;
        }
        const rows = datasetRows(payload, dataset);
        if (!rows.length) {
          addMissing(date, dataset);
          return;
        }
        rowsByDataset[dataset].push(...rows);
      });
    });

    const sheets = Object.fromEntries(datasetNames.map((dataset) => {
      const rows = sortRows(rowsByDataset[dataset]);
      return [dataset, {
        name: DATASET_LABELS[dataset],
        columns: rows.length ? collectDatasetTableColumns(dataset, rows) : DEFAULT_COLUMNS[dataset],
        rows,
      }];
    }));
    const generatedAt = options?.generatedAt || new Date().toISOString();
    const metadata = { startDate, endDate, datasetNames, generatedAt };
    return {
      filename: `河北南网电力交易市场数据导出-${startDate.replaceAll("-", "")}-${endDate.replaceAll("-", "")}.xlsx`,
      sheetOrder: ["导出说明", ...datasetNames.map((name) => DATASET_LABELS[name])],
      sheets,
      missing,
      metadata,
    };
  }

  function excelDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!match) return "";
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }

  function exportCellValue(column, value) {
    if (value === null || value === undefined) return "";
    if (column === "trading_date") return excelDate(value) || String(value);
    if (column === "time_slot") return String(value);
    if (typeof value === "number") return value;
    return String(value);
  }

  function setWorksheetLayout(worksheet) {
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.columns.forEach((column) => {
      const width = worksheet.getColumn(column.number).values.reduce((maximum, value) => (
        Math.max(maximum, value instanceof Date ? 10 : Array.from(String(value ?? "")).reduce(
          (total, character) => total + (character.charCodeAt(0) > 255 ? 2 : 1),
          0,
        ))
      ), 0) + 2;
      column.width = Math.max(10, Math.min(40, width));
    });
  }

  function buildOverviewWorkbook(ExcelJS, prepared) {
    const workbook = new ExcelJS.Workbook();
    const description = workbook.addWorksheet("导出说明");
    description.addRow(["项目", "内容"]);
    description.addRow(["导出范围", `${prepared.metadata.startDate} 至 ${prepared.metadata.endDate}`]);
    description.addRow(["数据类型", prepared.metadata.datasetNames.map((name) => DATASET_LABELS[name]).join("、")]);
    description.addRow(["生成时间", prepared.metadata.generatedAt]);
    prepared.missing.forEach(({ date, label }) => {
      description.addRow([`缺失数据：${label}`, date]);
    });
    setWorksheetLayout(description);

    prepared.metadata.datasetNames.forEach((dataset) => {
      const sheet = prepared.sheets[dataset];
      const worksheet = workbook.addWorksheet(sheet.name);
      worksheet.addRow(sheet.columns.map((column) => FIELD_LABELS[column] || column));
      sheet.rows.forEach((row) => {
        worksheet.addRow(sheet.columns.map((column) => exportCellValue(column, row[column])));
      });
      sheet.columns.forEach((column, index) => {
        if (column === "trading_date") worksheet.getColumn(index + 1).numFmt = "yyyy/mm/dd";
      });
      setWorksheetLayout(worksheet);
    });
    return workbook;
  }

  async function writeOverviewWorkbook(ExcelJS, prepared, pageRoot) {
    const workbook = buildOverviewWorkbook(ExcelJS, prepared);
    const buffer = await workbook.xlsx.writeBuffer();
    const downloadRoot = pageRoot || root;
    let objectUrl;
    let hasObjectUrl = false;
    let anchor;
    let appended = false;
    let originalError;
    try {
      const blob = new downloadRoot.Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      objectUrl = downloadRoot.URL.createObjectURL(blob);
      hasObjectUrl = true;
      anchor = downloadRoot.document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = prepared.filename;
      downloadRoot.document.body.append(anchor);
      appended = true;
      anchor.click();
    } catch (error) {
      originalError = error;
      throw error;
    } finally {
      let cleanupError;
      if (appended) {
        try {
          downloadRoot.document.body.removeChild(anchor);
        } catch (error) {
          cleanupError = error;
        }
      }
      if (hasObjectUrl) {
        try {
          downloadRoot.URL.revokeObjectURL(objectUrl);
        } catch (error) {
          cleanupError = cleanupError || error;
        }
      }
      if (!originalError && cleanupError) throw cleanupError;
    }
  }

  function setExportStatus(element, message, type) {
    element.textContent = message;
    element.dataset.type = type;
  }

  function isStrictIsoDate(value) {
    try {
      parseIsoDate(value);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function fetchLocalJson(pageRoot, url) {
    let lastError;
    for (const candidate of overviewData.candidateLocalUrls(url)) {
      try {
        const response = await pageRoot.fetch(candidate, { cache: "no-store" });
        if (!response.ok) {
          lastError = new Error("本地历史数据文件读取失败");
          continue;
        }
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("本地历史数据文件读取失败");
  }

  const overviewExportControllers = new WeakMap();

  function initializeOverviewExport(pageRoot) {
    const exportRoot = pageRoot || root;
    const documentRoot = exportRoot?.document;
    if (!documentRoot) return null;
    const page = documentRoot.querySelector('[data-page="overview"]');
    const elements = {
      open: documentRoot.getElementById("overviewExportOpen"),
      dialog: documentRoot.getElementById("overviewExportDialog"),
      startDate: documentRoot.getElementById("overviewExportStartDate"),
      endDate: documentRoot.getElementById("overviewExportEndDate"),
      selectAll: documentRoot.getElementById("overviewExportSelectAll"),
      cancel: documentRoot.getElementById("overviewExportCancel"),
      run: documentRoot.getElementById("overviewExportRun"),
      status: documentRoot.getElementById("overviewExportStatus"),
      overviewDate: documentRoot.getElementById("overviewDate"),
    };
    const datasetInputs = Array.from(documentRoot.querySelectorAll("[data-overview-export-dataset]"));
    if (!page || Object.values(elements).some((element) => !element) || !datasetInputs.length) return null;
    const existing = overviewExportControllers.get(elements.dialog);
    if (existing?.root === exportRoot) return existing.controller;

    let exporting = false;
    let triggerElement = elements.open;
    const runLabel = elements.run.textContent;
    const formFields = [
      elements.startDate,
      elements.endDate,
      elements.selectAll,
      ...datasetInputs,
    ];

    const syncSelectAll = () => {
      const selectedCount = datasetInputs.filter((input) => input.checked).length;
      elements.selectAll.checked = selectedCount === datasetInputs.length;
      elements.selectAll.indeterminate = selectedCount > 0 && selectedCount < datasetInputs.length;
    };

    const closeDialog = () => {
      if (exporting || elements.dialog.hidden) return;
      elements.dialog.hidden = true;
      if (typeof triggerElement?.focus === "function") triggerElement.focus();
    };

    const openDialog = () => {
      if (typeof documentRoot.activeElement?.focus === "function") {
        triggerElement = documentRoot.activeElement;
      } else {
        triggerElement = elements.open;
      }
      const currentDate = elements.overviewDate.value;
      elements.startDate.value = currentDate;
      elements.endDate.value = currentDate;
      datasetInputs.forEach((input) => { input.checked = true; });
      syncSelectAll();
      setExportStatus(elements.status, "", "");
      elements.dialog.hidden = false;
      elements.startDate.focus();
    };

    const setBusy = (busy) => {
      formFields.forEach((field) => { field.disabled = busy; });
      elements.run.disabled = busy;
      elements.cancel.disabled = busy;
      elements.open.disabled = busy;
      elements.run.textContent = busy ? "正在导出..." : runLabel;
      if (busy) elements.dialog.focus();
    };

    const validate = () => {
      const startDate = elements.startDate.value;
      const endDate = elements.endDate.value;
      if (!startDate || !endDate) return "请选择开始和结束日期";
      if (!isStrictIsoDate(startDate) || !isStrictIsoDate(endDate)) return "日期格式必须为 YYYY-MM-DD";
      if (endDate < startDate) return "结束日期不能早于开始日期";
      if (!datasetInputs.some((input) => input.checked)) return "请至少选择一种数据类型";
      return "";
    };

    const runExport = async () => {
      if (exporting) return;
      const validationError = validate();
      if (validationError) {
        setExportStatus(elements.status, validationError, "error");
        return;
      }
      if (!exportRoot.ExcelJS) {
        setExportStatus(elements.status, "Excel 导出组件加载失败", "error");
        return;
      }

      exporting = true;
      setBusy(true);
      try {
        const manifestUrl = page.dataset.overviewManifest || "overview-data/index.json";
        let manifest;
        try {
          manifest = await fetchLocalJson(exportRoot, manifestUrl);
        } catch (error) {
          setExportStatus(elements.status, "本地历史数据索引读取失败", "error");
          return;
        }
        const startDate = elements.startDate.value;
        const endDate = elements.endDate.value;
        const datasetNames = datasetInputs.filter((input) => input.checked).map((input) => input.value);
        const payloadsByDate = {};
        const failedDates = [];
        for (const date of enumerateIsoDates(startDate, endDate)) {
          const entry = manifest?.entries?.[date];
          if (!entry) continue;
          try {
            payloadsByDate[date] = await fetchLocalJson(exportRoot, entry);
          } catch (error) {
            failedDates.push(date);
          }
        }
        const prepared = prepareOverviewExport({
          startDate,
          endDate,
          datasetNames,
          payloadsByDate,
          failedDates,
          generatedAt: new Date().toISOString(),
          overviewData,
        });
        await writeOverviewWorkbook(exportRoot.ExcelJS, prepared, exportRoot);
        setExportStatus(elements.status, `导出完成：${prepared.filename}`, "success");
      } catch (error) {
        setExportStatus(elements.status, "数据导出失败，请稍后重试", "error");
      } finally {
        exporting = false;
        setBusy(false);
      }
    };

    const trapFocus = (event) => {
      if (event.key !== "Tab" || elements.dialog.hidden) return;
      if (exporting) {
        event.preventDefault();
        elements.dialog.focus();
        return;
      }
      const focusable = [
        elements.startDate,
        elements.endDate,
        elements.selectAll,
        ...datasetInputs,
        elements.cancel,
        elements.run,
      ].filter((element) => !element.disabled);
      if (!focusable.length) return;
      const currentIndex = focusable.indexOf(documentRoot.activeElement);
      const nextIndex = event.shiftKey
        ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
        : (currentIndex < 0 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);
      event.preventDefault();
      focusable[nextIndex].focus();
    };

    elements.open.addEventListener("click", openDialog);
    elements.cancel.addEventListener("click", closeDialog);
    elements.dialog.addEventListener("click", (event) => {
      if (event.target === elements.dialog) closeDialog();
    });
    exportRoot.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.dialog.hidden) closeDialog();
      else trapFocus(event);
    });
    elements.selectAll.addEventListener("change", () => {
      datasetInputs.forEach((input) => { input.checked = elements.selectAll.checked; });
      syncSelectAll();
    });
    datasetInputs.forEach((input) => input.addEventListener("change", syncSelectAll));
    elements.run.addEventListener("click", runExport);

    const controller = { closeDialog, openDialog, runExport };
    overviewExportControllers.set(elements.dialog, { root: exportRoot, controller });
    return controller;
  }

  const exported = {
    buildOverviewWorkbook,
    enumerateIsoDates,
    initializeOverviewExport,
    prepareOverviewExport,
    writeOverviewWorkbook,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  if (root) root.OverviewExport = exported;
  if (typeof window !== "undefined" && window === root && root.document) initializeOverviewExport(root);
}(typeof globalThis !== "undefined" ? globalThis : this));
