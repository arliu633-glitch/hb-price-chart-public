(function initializeOverviewModule(root) {
  "use strict";

  const DATASET_LABELS = Object.freeze({
    forecast: "披露预测",
    coalForecast: "燃煤预测",
    priceForecast: "电价预测",
    rollingAuction: "日滚撮明细",
    temperature: "温度",
    realtime: "实时运行",
    clearing: "市场出清",
  });
  const VISIBLE_DATASET_NAMES = Object.freeze(Object.keys(DATASET_LABELS));
  const TABLE_METADATA_HIDDEN_COLUMNS = new Set(["source_file", "uploaded_at"]);
  const CLEARING_HIDDEN_COLUMNS = new Set([
    "id",
    "province_code",
    "d2_mid_price",
    "d2_low_price",
    "d2_high_price",
    "realtime_ensemble_price",
    "realtime_linear_price",
    "realtime_rf_price",
    "realtime_bagging_price",
    "realtime_catboost_price",
    "realtime_lightgbm_price",
    "realtime_xgboost_price",
  ]);

  const FIELD_LABELS = {
    id: "ID",
    province_code: "省份代码",
    trading_date: "交易日期",
    period: "时段",
    time_slot: "时刻",
    load_forecast_mw: "负荷预测(MW)",
    non_market_forecast_mw: "非市场化机组预测(MW)",
    renewable_forecast_mw: "新能源预测(MW)",
    external_import_mw: "区外受电计划(MW)",
    actual_load_mw: "实际负荷(MW)",
    non_market_gen_mw: "非市场化机组出力(MW)",
    renewable_gen_mw: "风光合计(MW)",
    renewable_solar_gen_mw: "光伏(MW)",
    renewable_wind_gen_mw: "风电(MW)",
    tie_line_mw: "联络线电力(MW)",
    day_ahead_price: "日前节点电价(元/MWh)",
    realtime_price: "实时节点电价(元/MWh)",
    storage_mw: "储能(MW)",
    other_mw: "其他(MW)",
    distributed_pv_mw: "分布式光伏(MW)",
    solar_mw: "光伏(MW)",
    nuclear_mw: "核电(MW)",
    hydro_mw: "水电(MW)",
    gas_mw: "燃气(MW)",
    oil_mw: "燃油(MW)",
    coal_mw: "燃煤(MW)",
    wind_mw: "风电(MW)",
    thermal_units: "火电开机台数",
    thermal_total_mw: "火电总出力(MW)",
    d2_mid_price: "D-2滚撮中位价",
    d2_low_price: "D-2滚撮最低价",
    d2_high_price: "D-2滚撮最高价",
    realtime_ensemble_price: "集合实时电价预测",
    realtime_linear_price: "线性实时电价预测",
    realtime_rf_price: "随机森林实时电价预测",
    realtime_bagging_price: "Bagging实时电价预测",
    realtime_catboost_price: "CatBoost实时电价预测",
    realtime_lightgbm_price: "LightGBM实时电价预测",
    realtime_xgboost_price: "XGBoost实时电价预测",
    temperature_c: "温度(℃)",
    actual_temperature_c: "实际温度(℃)",
    forecast_temperature_c: "预测温度(℃)",
    avg_mid: "日均中位价",
    min_low: "日最低价",
    max_high: "日最高价",
    coal_forecast_mw: "集合燃煤预测(MW)",
    coal_linear_mw: "线性燃煤预测(MW)",
    coal_rf_mw: "随机森林燃煤预测(MW)",
    coal_bagging_mw: "Bagging燃煤预测(MW)",
    coal_catboost_mw: "CatBoost燃煤预测(MW)",
    coal_lightgbm_mw: "LightGBM燃煤预测(MW)",
    coal_xgboost_mw: "XGBoost燃煤预测(MW)",
    source_file: "源文件",
    uploaded_at: "上传时间",
  };

  const CHART_COLORS = [
    "#0f766e",
    "#dc2626",
    "#2563eb",
    "#d97706",
    "#7c3aed",
    "#0891b2",
    "#be123c",
    "#4d7c0f",
    "#475569",
    "#c2410c",
    "#0369a1",
    "#6d28d9",
  ];
  const PAIRED_SERIES_COLORS = Object.freeze({
    load: "#0f766e",
    nonMarket: "#dc2626",
    renewable: "#2563eb",
    tieLine: "#d97706",
    temperature: "#7c3aed",
  });

  function timeSlotValue(timeSlot) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeSlot || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  }

  function sortTimeSlots(timeSlots) {
    return Array.from(new Set(timeSlots.filter(Boolean))).sort(
      (left, right) => timeSlotValue(left) - timeSlotValue(right),
    );
  }

  function chartAxisLabelInterval(times) {
    return times.some((time) => String(time).includes(" "))
      ? Math.max(0, Math.ceil(times.length / 7) - 1)
      : 7;
  }

  function findAdjacentDate(availableDates, selectedDate, direction) {
    if (!availableDates.length || !selectedDate || direction === 0) return "";
    const sortedDates = Array.from(new Set(availableDates.filter(Boolean))).sort();
    if (direction < 0) {
      return sortedDates.findLast((dateValue) => dateValue < selectedDate) || "";
    }
    return sortedDates.find((dateValue) => dateValue > selectedDate) || "";
  }

  function datesInRange(startDate, endDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate || "")
      || !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "")
      || startDate > endDate) return [];
    const dates = [];
    const cursor = new Date(`${startDate}T00:00:00Z`);
    const end = new Date(`${endDate}T00:00:00Z`);
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  function nextIsoDate(tradingDate) {
    const cursor = new Date(`${tradingDate}T00:00:00Z`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    return cursor.toISOString().slice(0, 10);
  }

  function collectTableColumns(rows) {
    const columns = [];
    const seen = new Set();
    rows.forEach((row) => {
      Object.keys(row || {}).forEach((key) => {
        if (!seen.has(key)) {
          seen.add(key);
          columns.push(key);
        }
      });
    });
    return columns;
  }

  function collectDatasetTableColumns(datasetName, rows) {
    const columns = collectTableColumns(rows)
      .filter((column) => !TABLE_METADATA_HIDDEN_COLUMNS.has(column));
    if (datasetName === "clearing") {
      return columns.filter((column) => !CLEARING_HIDDEN_COLUMNS.has(column));
    }
    if (datasetName === "realtime" && columns.includes("renewable_gen_mw")) {
      const components = ["renewable_solar_gen_mw", "renewable_wind_gen_mw"];
      const ordered = columns.filter((column) => !components.includes(column));
      const renewableIndex = ordered.indexOf("renewable_gen_mw");
      ordered.splice(renewableIndex + 1, 0, ...components);
      return ordered;
    }
    return columns;
  }

  function formatOverviewValue(datasetName, column, value) {
    if (value === null || value === undefined) return "";
    const decimalPlaces = datasetName === "coalForecast" && /^coal_.*_mw$/.test(column)
      ? 0
      : datasetName === "priceForecast" && /^realtime_.*_price$/.test(column)
        ? 2
        : null;
    if (decimalPlaces === null) return String(value);
    const numericValue = Number(value);
    return Number.isFinite(numericValue)
      ? numericValue.toFixed(decimalPlaces)
      : String(value);
  }

  function mergeTemperatureRows(datasets) {
    const temperatures = new Map();
    const addRows = (rows, fieldName) => {
      rows.forEach((row) => {
        const tradingDate = String(row?.trading_date || "");
        const timeSlot = String(row?.time_slot || "");
        const key = `${tradingDate}\u0000${timeSlot}`;
        if (!temperatures.has(key)) {
          temperatures.set(key, {
            trading_date: tradingDate,
            time_slot: timeSlot,
            ...(row?.chart_time ? { chart_time: row.chart_time } : {}),
          });
        }
        temperatures.get(key)[fieldName] = row?.temperature_c;
      });
    };

    addRows(datasets?.temperatureActual || [], "actual_temperature_c");
    addRows(datasets?.temperatureForecast || [], "forecast_temperature_c");
    return Array.from(temperatures.values()).sort((left, right) => (
      left.trading_date.localeCompare(right.trading_date)
      || timeSlotValue(left.time_slot) - timeSlotValue(right.time_slot)
    ));
  }

  function datasetRows(payloadOrDatasets, datasetName) {
    const datasets = payloadOrDatasets?.datasets || payloadOrDatasets || {};
    return datasetName === "temperature"
      ? mergeTemperatureRows(datasets)
      : datasets[datasetName] || [];
  }

  function createEmptyOverviewPayload(tradingDate) {
    return {
      tradingDate,
      datasets: Object.fromEntries(VISIBLE_DATASET_NAMES.map((name) => [name, []])),
    };
  }

  function candidateLocalUrls(url) {
    const normalized = String(url || "").replace(/^\/+/, "");
    if (!normalized || normalized.startsWith("public/")) return [normalized];
    return [normalized, `public/${normalized}`];
  }

  function mergeOverviewPayloads(payloadsByDate, selectedDates, lookaheadPayload = null) {
    const sourceDatasetNames = new Set();
    payloadsByDate.forEach((payload) => {
      Object.keys(payload?.datasets || {}).forEach((name) => sourceDatasetNames.add(name));
    });
    const timeSlots = sortTimeSlots(payloadsByDate.flatMap((payload) => (
      Object.values(payload?.datasets || {}).flatMap((rows) => (
        Array.isArray(rows) ? rows.map((row) => row?.time_slot) : []
      ))
    )));
    const multipleDates = selectedDates.length > 1;
    const payloadByDate = new Map(payloadsByDate.map((payload, index) => [
      selectedDates[index] || payload?.tradingDate || payload?.date || "",
      payload,
    ]));
    if (lookaheadPayload) {
      payloadByDate.set(
        lookaheadPayload.tradingDate || lookaheadPayload.date || nextIsoDate(selectedDates.at(-1)),
        lookaheadPayload,
      );
    }
    const datasets = Object.fromEntries(Array.from(sourceDatasetNames, (name) => [name, []]));

    payloadsByDate.forEach((payload, payloadIndex) => {
      const fallbackDate = selectedDates[payloadIndex] || payload?.tradingDate || payload?.date || "";
      Object.entries(payload?.datasets || {}).forEach(([name, rows]) => {
        if (!Array.isArray(rows)) return;
        if (!datasets[name]) datasets[name] = [];
        datasets[name].push(...rows.map((row) => {
          const tradingDate = String(row?.trading_date || fallbackDate);
          return {
            ...row,
            trading_date: tradingDate,
            ...(multipleDates ? { chart_time: `${tradingDate.slice(5)} ${row?.time_slot || ""}` } : {}),
          };
        }));
      });
    });

    const temperature24Rows = selectedDates.flatMap((tradingDate) => {
      const nextDayDatasets = payloadByDate.get(nextIsoDate(tradingDate))?.datasets || {};
      const actual = (nextDayDatasets.temperatureActual || [])
        .find((row) => row?.time_slot === "00:00")?.temperature_c;
      const forecast = (nextDayDatasets.temperatureForecast || [])
        .find((row) => row?.time_slot === "00:00")?.temperature_c;
      if (!Number.isFinite(actual) && !Number.isFinite(forecast)) return [];
      return [{
        trading_date: tradingDate,
        time_slot: "24:00",
        ...(multipleDates ? { chart_time: `${tradingDate.slice(5)} 24:00` } : {}),
        ...(Number.isFinite(actual) ? { actual_temperature_c: actual } : {}),
        ...(Number.isFinite(forecast) ? { forecast_temperature_c: forecast } : {}),
      }];
    });
    const chartTimeSlots = temperature24Rows.length
      ? sortTimeSlots([...timeSlots, "24:00"])
      : timeSlots;

    return {
      tradingDate: selectedDates.at(-1) || "",
      rangeStart: selectedDates[0] || "",
      rangeEnd: selectedDates.at(-1) || "",
      chartTimes: multipleDates
        ? selectedDates.flatMap((tradingDate) => chartTimeSlots.map(
          (timeSlot) => `${tradingDate.slice(5)} ${timeSlot}`,
        ))
        : chartTimeSlots,
      temperature24Rows,
      datasets,
    };
  }

  function buildChartModel(definitions, fixedTimes = null) {
    const rowTime = (row) => row.chart_time || row.time_slot;
    const times = (fixedTimes || sortTimeSlots(
      definitions.flatMap(({ rows }) => rows.map(rowTime)),
    )).filter((time) => !/(?:^| )00:00$/.test(String(time || "")));
    const series = definitions.map((definition) => {
      const byTime = new Map(
        definition.rows.map((row) => [rowTime(row), row[definition.field]]),
      );
      const hourlyValues = new Map(
        definition.rows.flatMap((row) => {
          const match = /^(?:(\d{2}-\d{2}) )?(\d{1,2}):00$/.exec(String(rowTime(row) || ""));
          return match ? [[`${match[1] || ""}\u0000${Number(match[2])}`, row[definition.field]]] : [];
        }),
      );
      return {
        name: definition.name,
        axis: definition.axis || 0,
        lineType: definition.lineType || "solid",
        decimalPlaces: definition.decimalPlaces ?? null,
        colorKey: definition.colorKey ?? null,
        data: times.map((time) => {
          let value = byTime.get(time);
          if (typeof value !== "number" && definition.fillWithinHour) {
            const match = /^(?:(\d{2}-\d{2}) )?(\d{1,2}):(15|30|45)$/.exec(String(time || ""));
            if (match) {
              const prefix = `${match[1] || ""}\u0000`;
              const hour = Number(match[2]);
              const fraction = Number(match[3]) / 60;
              const startValue = hourlyValues.get(`${prefix}${hour}`);
              const endValue = hourlyValues.get(`${prefix}${hour + 1}`);
              value = Number.isFinite(startValue) && Number.isFinite(endValue)
                ? startValue + ((endValue - startValue) * fraction)
                : null;
            } else {
              value = null;
            }
          }
          if (!Number.isFinite(value)) return null;
          return definition.fillWithinHour ? Math.round(value * 10) / 10 : value;
        }),
      };
    });
    return { times, series, axes: Array.from(new Set(series.map((item) => item.axis))) };
  }

  function definitions(rows, fields) {
    return fields.map(([
      field,
      name,
      axis = 0,
      lineType = "solid",
      decimalPlaces = null,
      fillWithinHour = false,
      colorKey = null,
    ]) => ({
      rows,
      field,
      name,
      axis,
      lineType,
      decimalPlaces,
      fillWithinHour,
      colorKey,
    }));
  }

  function buildOverviewModels(payload) {
    const datasets = payload?.datasets || {};
    const forecast = datasets.forecast || [];
    const realtime = datasets.realtime || [];
    const clearing = datasets.clearing || [];
    const rolling = datasets.rollingAuction || [];
    const priceForecast = datasets.priceForecast || [];
    const coalForecast = datasets.coalForecast || [];
    const temperature = [
      ...mergeTemperatureRows(datasets),
      ...(payload?.temperature24Rows || []),
    ];
    const chartTimes = Array.isArray(payload?.chartTimes) ? payload.chartTimes : null;

    return {
      system: buildChartModel([
        ...definitions(forecast, [
          ["load_forecast_mw", "负荷预测", 0, "dashed", null, false, "load"],
          ["non_market_forecast_mw", "非市场化机组预测", 0, "dashed", null, false, "nonMarket"],
          ["renewable_forecast_mw", "新能源预测", 0, "dashed", null, false, "renewable"],
          ["external_import_mw", "区外受电计划", 0, "dashed", null, false, "tieLine"],
        ]),
        ...definitions(realtime, [
          ["actual_load_mw", "实际负荷", 0, "solid", null, false, "load"],
          ["non_market_gen_mw", "非市场化机组出力", 0, "solid", null, false, "nonMarket"],
          ["renewable_gen_mw", "新能源出力", 0, "solid", null, false, "renewable"],
          ["tie_line_mw", "联络线电力", 0, "solid", null, false, "tieLine"],
        ]),
      ], chartTimes),
      loadTemperature: buildChartModel([
        ...definitions(forecast, [
          ["load_forecast_mw", "预测负荷", 0, "dashed", null, false, "load"],
        ]),
        ...definitions(realtime, [
          ["actual_load_mw", "实际负荷", 0, "solid", null, false, "load"],
        ]),
        ...definitions(temperature, [
          ["forecast_temperature_c", "预测温度", 1, "dashed", null, true, "temperature"],
          ["actual_temperature_c", "实际温度", 1, "solid", null, true, "temperature"],
        ]),
      ], chartTimes),
      priceForecast: buildChartModel([
        ...definitions(clearing, [
          ["realtime_price", "实时节点电价"],
        ]),
        ...definitions(priceForecast, [
          ["realtime_ensemble_price", "集合实时电价预测", 0, "solid", 2],
          ["realtime_linear_price", "线性预测", 0, "solid", 2],
          ["realtime_rf_price", "随机森林预测", 0, "solid", 2],
          ["realtime_bagging_price", "Bagging预测", 0, "solid", 2],
          ["realtime_catboost_price", "CatBoost预测", 0, "solid", 2],
          ["realtime_lightgbm_price", "LightGBM预测", 0, "solid", 2],
          ["realtime_xgboost_price", "XGBoost预测", 0, "solid", 2],
        ]),
      ], chartTimes),
      marketPrice: buildChartModel([
        ...definitions(clearing, [
          ["day_ahead_price", "日前节点电价"],
          ["realtime_price", "实时节点电价"],
        ]),
        ...definitions(rolling, [
          ["d2_mid_price", "D-2滚撮中位价"],
          ["d2_low_price", "D-2滚撮最低价", 0, "dashed"],
          ["d2_high_price", "D-2滚撮最高价", 0, "dashed"],
        ]),
      ], chartTimes),
      clearing: buildChartModel(definitions(clearing, [
        ["storage_mw", "储能"],
        ["other_mw", "其他"],
        ["distributed_pv_mw", "分布式光伏"],
        ["solar_mw", "光伏"],
        ["nuclear_mw", "核电"],
        ["hydro_mw", "水电"],
        ["gas_mw", "燃气"],
        ["oil_mw", "燃油"],
        ["coal_mw", "燃煤出力"],
        ["wind_mw", "风电"],
      ]), chartTimes),
      weatherCoal: buildChartModel(definitions(coalForecast, [
          ["coal_forecast_mw", "集合燃煤预测", 0, "solid", 0],
          ["coal_linear_mw", "线性燃煤预测", 0, "solid", 0],
          ["coal_rf_mw", "随机森林燃煤预测", 0, "solid", 0],
          ["coal_bagging_mw", "Bagging燃煤预测", 0, "solid", 0],
          ["coal_catboost_mw", "CatBoost燃煤预测", 0, "solid", 0],
          ["coal_lightgbm_mw", "LightGBM燃煤预测", 0, "solid", 0],
          ["coal_xgboost_mw", "XGBoost燃煤预测", 0, "solid", 0],
      ]), chartTimes),
    };
  }

  const exported = {
    buildOverviewModels,
    candidateLocalUrls,
    chartAxisLabelInterval,
    collectTableColumns,
    collectDatasetTableColumns,
    createEmptyOverviewPayload,
    DATASET_LABELS,
    FIELD_LABELS,
    datasetRows,
    datesInRange,
    findAdjacentDate,
    formatOverviewValue,
    initializeOverviewPage,
    mergeTemperatureRows,
    mergeOverviewPayloads,
    sortTimeSlots,
    VISIBLE_DATASET_NAMES,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }
  if (root) root.OverviewData = exported;

  function initializeOverviewPage(pageRoot) {
  const root = pageRoot;
  if (!root?.document) return null;

  const page = root.document.querySelector('[data-page="overview"]');
  if (!page) return;

  const elements = {
    date: root.document.getElementById("overviewDate"),
    endDate: root.document.getElementById("overviewEndDate"),
    detailDate: root.document.getElementById("overviewDetailDate"),
    previous: root.document.getElementById("overviewPreviousDate"),
    next: root.document.getElementById("overviewNextDate"),
    coverage: root.document.getElementById("overviewCoverage"),
    status: root.document.getElementById("overviewStatus"),
    tabs: root.document.getElementById("overviewDatasetTabs"),
    table: root.document.getElementById("overviewTable"),
    range: root.document.getElementById("overviewRange"),
    chartDialog: root.document.getElementById("overviewChartDialog"),
    chartDialogTitle: root.document.getElementById("overviewChartDialogTitle"),
    chartDialogClose: root.document.getElementById("overviewChartDialogClose"),
    expandedChart: root.document.getElementById("overviewExpandedChart"),
  };
  const chartElements = {
    system: root.document.getElementById("overviewSystemChart"),
    loadTemperature: root.document.getElementById("overviewLoadTemperatureChart"),
    priceForecast: root.document.getElementById("overviewPriceForecastChart"),
    marketPrice: root.document.getElementById("overviewMarketPriceChart"),
    clearing: root.document.getElementById("overviewClearingChart"),
    weatherCoal: root.document.getElementById("overviewWeatherCoalChart"),
  };
  const chartMetadata = {
    system: ["系统供需与披露预测", root.document.getElementById("overviewSystemExpand")],
    weatherCoal: ["燃煤出力预测", root.document.getElementById("overviewWeatherCoalExpand")],
    marketPrice: ["节点电价与日滚撮价格", root.document.getElementById("overviewMarketPriceExpand")],
    priceForecast: ["实时节点电价预测", root.document.getElementById("overviewPriceForecastExpand")],
    clearing: ["市场出清电源结构", root.document.getElementById("overviewClearingExpand")],
    loadTemperature: ["负荷与温度", root.document.getElementById("overviewLoadTemperatureExpand")],
  };
  const charts = {};
  const chartOptionsByName = {};
  const payloadsByDate = new Map();
  let expandedChart = null;
  let manifest = null;
  let currentPayload = null;
  let currentRangeDates = [];
  let currentDataset = "forecast";
  let requestGeneration = 0;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function setStatus(message, type = "") {
    elements.status.textContent = message;
    elements.status.dataset.type = type;
  }

  async function fetchLocalPayload(url, version) {
    let lastError = null;
    for (const candidate of candidateLocalUrls(url)) {
      try {
        const response = await root.fetch(
          `${candidate}?v=${encodeURIComponent(version || Date.now())}`,
          { cache: "no-store" },
        );
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

  function renderCoverage(payload) {
    const populated = Object.entries(DATASET_LABELS)
      .map(([name, label]) => ({ name, label, rows: datasetRows(payload, name) }))
      .filter(({ rows }) => rows.length > 0);
    elements.coverage.innerHTML = populated.length
      ? populated.map(({ label, rows }) => (
        `<span><strong>${rows.length.toLocaleString("zh-CN")}</strong>${label}</span>`
      )).join("")
      : "<span>该日期没有本地数据</span>";
  }

  function renderTabs(payload) {
    const datasets = Object.entries(DATASET_LABELS)
      .map(([name, label]) => ({ name, label, rows: datasetRows(payload, name) }));
    if (!datasets.find(({ name }) => name === currentDataset)?.rows.length) {
      currentDataset = Object.keys(DATASET_LABELS)
        .find((name) => datasets.find((dataset) => dataset.name === name).rows.length > 0) || "forecast";
    }
    elements.tabs.innerHTML = datasets.map(({ name, label, rows }) => (
      `<button type="button" data-overview-dataset="${name}" `
      + `aria-pressed="${name === currentDataset}">`
      + `${label}<span>${rows.length.toLocaleString("zh-CN")}</span></button>`
    )).join("");
  }

  function renderTable(datasetName) {
    currentDataset = datasetName;
    const rows = datasetRows(currentPayload, datasetName);
    const columns = collectDatasetTableColumns(datasetName, rows);
    elements.tabs.querySelectorAll("[data-overview-dataset]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.overviewDataset === datasetName));
    });
    if (!rows.length || !columns.length) {
      elements.table.innerHTML = '<tbody><tr><td class="overview-empty-cell">该日期无此类数据</td></tr></tbody>';
      return;
    }
    let head;
    if (datasetName === "realtime" && columns.includes("renewable_gen_mw")) {
      const componentColumns = new Set([
        "renewable_gen_mw", "renewable_solar_gen_mw", "renewable_wind_gen_mw",
      ]);
      const firstRow = columns.map((column) => {
        if (column === "renewable_gen_mw") {
          return '<th colspan="3" title="renewable output">新能源出力(MW)</th>';
        }
        if (componentColumns.has(column)) return "";
        return `<th rowspan="2" title="${escapeHtml(column)}">${escapeHtml(FIELD_LABELS[column] || column)}</th>`;
      }).join("");
      const secondRow = ["风光合计", "光伏", "风电"]
        .map((label) => `<th>${label}</th>`)
        .join("");
      head = `<tr>${firstRow}</tr><tr>${secondRow}</tr>`;
    } else {
      head = `<tr>${columns.map((column) => (
        `<th title="${escapeHtml(column)}">${escapeHtml(FIELD_LABELS[column] || column)}</th>`
      )).join("")}</tr>`;
    }
    const body = rows.map((row) => (
      `<tr>${columns.map((column) => (
        `<td>${escapeHtml(formatOverviewValue(datasetName, column, row[column]))}</td>`
      )).join("")}</tr>`
    )).join("");
    elements.table.innerHTML = `<thead>${head}</thead><tbody>${body}</tbody>`;
  }

  function tooltipPosition(point, _params, _dom, _rect, size) {
    const left = point[0] > size.viewSize[0] / 2
      ? 12
      : Math.max(12, size.viewSize[0] - size.contentSize[0] - 12);
    return [left, 12];
  }

  function colorWithAlpha(color, alpha) {
    const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color || "");
    return match
      ? `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${alpha})`
      : color;
  }

  function buildPairedBandSeries(model, colorKeys = []) {
    return colorKeys.flatMap((colorKey) => {
      const forecast = model.series.find((series) => (
        series.colorKey === colorKey && series.lineType === "dashed"
      ));
      const actual = model.series.find((series) => (
        series.colorKey === colorKey && series.lineType === "solid"
      ));
      if (!forecast || !actual) return [];
      const color = PAIRED_SERIES_COLORS[colorKey];
      const polygon = (actualPoints, forecastPoints) => ({
        type: "polygon",
        shape: { points: [...actualPoints, ...forecastPoints.slice().reverse()] },
        style: {
          fill: {
            type: "linear",
            x: (actualPoints[0][0] + actualPoints.at(-1)[0]) / 2,
            y: (actualPoints[0][1] + actualPoints.at(-1)[1]) / 2,
            x2: (forecastPoints[0][0] + forecastPoints.at(-1)[0]) / 2,
            y2: (forecastPoints[0][1] + forecastPoints.at(-1)[1]) / 2,
            colorStops: [
              { offset: 0, color: colorWithAlpha(color, 0.32) },
              { offset: 1, color: colorWithAlpha(color, 0.06) },
            ],
            global: true,
          },
          stroke: "none",
        },
      });
      return [{
        name: `${forecast.name}与${actual.name}区间`,
        type: "custom",
        coordinateSystem: "cartesian2d",
        yAxisIndex: actual.axis,
        data: Array.from({ length: Math.max(0, model.times.length - 1) }, (_, index) => index),
        silent: true,
        tooltip: { show: false },
        z: 1,
        renderItem(_params, api) {
          const index = Number(api.value(0));
          const actualValues = [actual.data[index], actual.data[index + 1]];
          const forecastValues = [forecast.data[index], forecast.data[index + 1]];
          if (![...actualValues, ...forecastValues].every(Number.isFinite)) return null;
          const actualPoints = actualValues.map((value, offset) => api.coord([index + offset, value]));
          const forecastPoints = forecastValues.map((value, offset) => api.coord([index + offset, value]));
          const differences = actualValues.map((value, offset) => value - forecastValues[offset]);
          if (differences[0] * differences[1] >= 0) {
            return polygon(actualPoints, forecastPoints);
          }
          const ratio = Math.abs(differences[0])
            / (Math.abs(differences[0]) + Math.abs(differences[1]));
          const crossing = actualPoints[0].map((value, axis) => (
            value + (actualPoints[1][axis] - value) * ratio
          ));
          return {
            type: "group",
            children: [
              polygon([actualPoints[0], crossing], [forecastPoints[0], crossing]),
              polygon([crossing, actualPoints[1]], [crossing, forecastPoints[1]]),
            ],
          };
        },
      }];
    });
  }

  function chartOption(model, units, options = {}) {
    const hasValues = model.series.some((series) => series.data.some((value) => value !== null));
    const dualAxis = model.axes.includes(1);
    const renderSeries = options.stackedArea
      ? model.series.map((series, index) => ({
        series,
        index,
        absoluteTotal: series.data.reduce((total, value) => (
          Number.isFinite(value) ? total + Math.abs(value) : total
        ), 0),
      })).sort((left, right) => (
        right.absoluteTotal - left.absoluteTotal || left.index - right.index
      )).map(({ series }) => series)
      : model.series;
    const renderOrder = new Map(renderSeries.map((series, index) => [series.name, index]));
    return {
      animation: false,
      color: CHART_COLORS,
      tooltip: {
        trigger: "axis",
        confine: true,
        backgroundColor: "rgba(15, 23, 42, 0.82)",
        borderWidth: 0,
        textStyle: { color: "#ffffff", fontSize: 12 },
        position: tooltipPosition,
        ...(options.stackedArea ? {
          formatter: (params) => {
            const items = Array.isArray(params) ? params : [params];
            const firstItem = items[0];
            if (!firstItem) return "";
            const orderedItems = items.slice().sort((left, right) => (
              Number(Number(left.value) < 0) - Number(Number(right.value) < 0)
              || renderOrder.get(left.seriesName) - renderOrder.get(right.seriesName)
            ));
            return [
              firstItem.axisValueLabel ?? firstItem.axisValue ?? "",
              ...orderedItems.map((item) => (
                `${item.marker || ""}${item.seriesName}: ${formatOverviewValue("clearing", "", item.value)}`
              )),
            ].join("<br/>");
          },
        } : {}),
      },
      legend: {
        type: "scroll",
        data: renderSeries.map((series) => series.name),
        top: 4,
        left: 12,
        right: 12,
        textStyle: { color: "#475569", fontSize: 11 },
      },
      grid: {
        top: 68,
        left: 58,
        right: dualAxis ? 58 : 22,
        bottom: 38,
      },
      xAxis: {
        type: "category",
        boundaryGap: false,
        data: model.times,
        axisLabel: {
          color: "#64748b",
          interval: chartAxisLabelInterval(model.times),
          hideOverlap: true,
          fontSize: 10,
        },
        axisLine: { lineStyle: { color: "#cbd5e1" } },
      },
      yAxis: [
        {
          type: "value",
          name: units[0],
          scale: true,
          nameTextStyle: { color: "#64748b" },
          axisLabel: { color: "#64748b", fontSize: 10 },
          splitLine: { lineStyle: { color: "#e2e8f0" } },
        },
        ...(dualAxis ? [{
          type: "value",
          name: units[1],
          scale: true,
          nameTextStyle: { color: "#64748b" },
          axisLabel: { color: "#64748b", fontSize: 10 },
          splitLine: { show: false },
        }] : []),
      ],
      series: [
        ...buildPairedBandSeries(model, options.pairedBands),
        ...renderSeries.map((series) => {
        const pairedColor = PAIRED_SERIES_COLORS[series.colorKey];
        const originalColor = options.stackedArea
          ? CHART_COLORS[model.series.indexOf(series)]
          : undefined;
        return {
          name: series.name,
          type: "line",
          ...(options.stackedArea ? {
            stack: "clearing-supply",
            areaStyle: { color: colorWithAlpha(originalColor, 0.2), opacity: 1 },
          } : {}),
          yAxisIndex: series.axis,
          data: series.data,
          tooltip: series.decimalPlaces === null ? undefined : {
            valueFormatter: (value) => formatOverviewValue(
              series.decimalPlaces === 0 ? "coalForecast" : "priceForecast",
              series.decimalPlaces === 0 ? "coal_forecast_mw" : "realtime_ensemble_price",
              value,
            ),
          },
          showSymbol: false,
          connectNulls: false,
          itemStyle: pairedColor
            ? { color: pairedColor }
            : originalColor
              ? { color: originalColor }
              : undefined,
          lineStyle: {
            width: 1.7,
            type: series.lineType,
            ...(pairedColor
              ? { color: pairedColor }
              : originalColor
                ? { color: originalColor }
                : {}),
          },
          z: 2,
          emphasis: { focus: "series", lineStyle: { width: 2.5 } },
        };
        }),
      ],
      graphic: hasValues ? [] : [{
        type: "text",
        left: "center",
        top: "middle",
        style: { text: "该日期无此类数据", fill: "#94a3b8", fontSize: 13 },
      }],
    };
  }

  function renderCharts(payload) {
    if (!root.echarts) {
      setStatus("本地图表组件加载失败", "error");
      return;
    }
    const models = buildOverviewModels(payload);
    const chartSettings = {
      system: [models.system, ["MW"], {
        pairedBands: ["load", "nonMarket", "renewable", "tieLine"],
      }],
      loadTemperature: [models.loadTemperature, ["MW", "℃"], { pairedBands: ["load"] }],
      priceForecast: [models.priceForecast, ["元/MWh"]],
      marketPrice: [models.marketPrice, ["元/MWh"]],
      clearing: [models.clearing, ["MW"], { stackedArea: true }],
      weatherCoal: [models.weatherCoal, ["MW"]],
    };
    Object.entries(chartSettings).forEach(([name, [model, units, options]]) => {
      if (!charts[name]) charts[name] = root.echarts.init(chartElements[name]);
      const option = chartOption(model, units, options);
      chartOptionsByName[name] = option;
      charts[name].setOption(option, true);
    });
  }

  function updateDateButtons() {
    const dates = manifest?.availableDates || [];
    const singleDate = elements.date.value === elements.endDate.value;
    elements.previous.disabled = !singleDate
      || !findAdjacentDate(dates, elements.date.value, -1);
    elements.next.disabled = !singleDate
      || !findAdjacentDate(dates, elements.endDate.value, 1);
  }

  async function loadDatePayload(tradingDate) {
    if (payloadsByDate.has(tradingDate)) return payloadsByDate.get(tradingDate);
    const entry = manifest?.entries?.[tradingDate];
    const payload = entry
      ? await fetchLocalPayload(entry, manifest.generatedAt)
      : createEmptyOverviewPayload(tradingDate);
    payloadsByDate.set(tradingDate, payload);
    return payload;
  }

  function renderDetailDateOptions(selectedDates, selectedDate) {
    elements.detailDate.innerHTML = selectedDates.map((tradingDate) => (
      `<option value="${tradingDate}">${tradingDate}</option>`
    )).join("");
    elements.detailDate.value = selectedDate;
    elements.detailDate.disabled = selectedDates.length <= 1;
  }

  function renderDetailDate(tradingDate) {
    currentPayload = payloadsByDate.get(tradingDate) || createEmptyOverviewPayload(tradingDate);
    elements.detailDate.value = tradingDate;
    renderTabs(currentPayload);
    renderTable(currentDataset);
  }

  async function loadOverviewRange(startDate, endDate) {
    const selectedDates = datesInRange(startDate, endDate);
    if (!selectedDates.length) {
      setStatus("起始日期不能晚于结束日期", "error");
      return;
    }
    const generation = ++requestGeneration;
    const availableCount = selectedDates.filter((tradingDate) => (
      manifest?.entries?.[tradingDate]
    )).length;
    setStatus(`正在读取 ${startDate} 至 ${endDate} 的本地历史数据...`);
    try {
      const [payloads, lookaheadPayload] = await Promise.all([
        Promise.all(selectedDates.map(loadDatePayload)),
        loadDatePayload(nextIsoDate(endDate)),
      ]);
      if (generation !== requestGeneration) return;
      currentRangeDates = selectedDates;
      const chartPayload = mergeOverviewPayloads(payloads, selectedDates, lookaheadPayload);
      elements.date.value = startDate;
      elements.endDate.value = endDate;
      renderCoverage(chartPayload);
      renderDetailDateOptions(selectedDates, endDate);
      renderDetailDate(endDate);
      renderCharts(chartPayload);
      updateDateButtons();
      setStatus(
        availableCount
          ? `已显示 ${startDate} 至 ${endDate} 的数据，共 ${availableCount} 个有数据日期；明细日期为 ${endDate}`
          : `${startDate} 至 ${endDate} 暂无本地历史数据，已显示空白概览`,
        availableCount ? "success" : "empty",
      );
    } catch (error) {
      if (generation !== requestGeneration) return;
      setStatus(error.message || "本地历史数据读取失败", "error");
    }
  }

  function loadOverviewDate(tradingDate) {
    return loadOverviewRange(tradingDate, tradingDate);
  }

  function openExpandedChart(chartName) {
    const option = chartOptionsByName[chartName];
    if (!option || !root.echarts) return;
    elements.chartDialogTitle.textContent = chartMetadata[chartName][0];
    elements.chartDialog.hidden = false;
    if (!expandedChart) expandedChart = root.echarts.init(elements.expandedChart);
    expandedChart.setOption({
      ...option,
      grid: { ...option.grid, bottom: 76 },
      dataZoom: [{
        type: "slider",
        xAxisIndex: 0,
        start: 0,
        end: 100,
        bottom: 12,
        height: 24,
        brushSelect: false,
        showDataShadow: false,
      }],
    }, true);
    root.setTimeout(() => {
      expandedChart.resize();
      elements.chartDialog.focus();
    }, 0);
  }

  function closeExpandedChart() {
    elements.chartDialog.hidden = true;
  }

  async function loadOverviewManifest() {
    const manifestUrl = page.dataset.overviewManifest || "overview-data/index.json";
    setStatus("正在读取本地历史数据索引...");
    try {
      manifest = await fetchLocalPayload(manifestUrl, Date.now());
      const dates = manifest.availableDates || [];
      const currentDateResponse = await root.fetch("/api/overview-current-date", {
        cache: "no-store",
      });
      if (!currentDateResponse.ok) throw new Error("服务器当日读取失败");
      const currentDatePayload = await currentDateResponse.json();
      if (!currentDatePayload?.ok || !/^\d{4}-\d{2}-\d{2}$/.test(currentDatePayload.currentDate || "")) {
        throw new Error("服务器当日读取失败");
      }
      const rangeDates = [manifest.startDate, manifest.endDate, currentDatePayload.currentDate]
        .filter(Boolean)
        .sort();
      elements.date.min = rangeDates[0];
      elements.date.max = rangeDates.at(-1);
      elements.endDate.min = rangeDates[0];
      elements.endDate.max = rangeDates.at(-1);
      elements.range.textContent = `${rangeDates[0]} 至 ${rangeDates.at(-1)}，历史数据共 ${dates.length} 个日期`;
      await loadOverviewDate(currentDatePayload.currentDate);
    } catch (error) {
      setStatus(error.message || "本地历史数据索引读取失败", "error");
    }
  }

  elements.date.addEventListener("change", () => {
    if (!elements.endDate.value || elements.date.value > elements.endDate.value) {
      elements.endDate.value = elements.date.value;
    }
    return loadOverviewRange(elements.date.value, elements.endDate.value);
  });
  elements.endDate.addEventListener("change", () => {
    if (!elements.date.value || elements.endDate.value < elements.date.value) {
      elements.date.value = elements.endDate.value;
    }
    return loadOverviewRange(elements.date.value, elements.endDate.value);
  });
  elements.detailDate.addEventListener("change", () => {
    if (!currentRangeDates.includes(elements.detailDate.value)) return;
    renderDetailDate(elements.detailDate.value);
    setStatus(`已切换为 ${elements.detailDate.value} 的历史数据明细`, "success");
  });
  elements.previous.addEventListener("click", () => {
    const adjacentDate = findAdjacentDate(manifest?.availableDates || [], elements.date.value, -1);
    if (adjacentDate) return loadOverviewDate(adjacentDate);
  });
  elements.next.addEventListener("click", () => {
    const adjacentDate = findAdjacentDate(manifest?.availableDates || [], elements.date.value, 1);
    if (adjacentDate) return loadOverviewDate(adjacentDate);
  });
  elements.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-overview-dataset]");
    if (button) renderTable(button.dataset.overviewDataset);
  });
  Object.entries(chartMetadata).forEach(([chartName, [, button]]) => {
    button?.addEventListener("click", () => openExpandedChart(chartName));
  });
  elements.chartDialogClose.addEventListener("click", closeExpandedChart);
  elements.chartDialog.addEventListener("click", (event) => {
    if (event.target === elements.chartDialog) closeExpandedChart();
  });
  root.document.querySelectorAll('[data-page-target="overview"]').forEach((tab) => {
    tab.addEventListener("click", () => root.setTimeout(() => {
      Object.values(charts).forEach((chart) => chart.resize());
    }, 0));
  });
  root.addEventListener("resize", () => {
    Object.values(charts).forEach((chart) => chart.resize());
    if (!elements.chartDialog.hidden) expandedChart?.resize();
  });
  root.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.chartDialog.hidden) closeExpandedChart();
  });

  const ready = loadOverviewManifest();
  return { loadOverviewDate, loadOverviewRange, loadOverviewManifest, ready };
  }

  initializeOverviewPage(root);
}(typeof window !== "undefined" ? window : null));
