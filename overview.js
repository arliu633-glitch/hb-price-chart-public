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
  const CLEARING_HIDDEN_COLUMNS = new Set([
    "id",
    "province_code",
    "source_file",
    "uploaded_at",
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
    renewable_gen_mw: "新能源出力(MW)",
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

  function timeSlotValue(timeSlot) {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(timeSlot || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : Number.MAX_SAFE_INTEGER;
  }

  function sortTimeSlots(timeSlots) {
    return Array.from(new Set(timeSlots.filter(Boolean))).sort(
      (left, right) => timeSlotValue(left) - timeSlotValue(right),
    );
  }

  function findAdjacentDate(availableDates, selectedDate, direction) {
    if (!availableDates.length) return "";
    const currentIndex = availableDates.indexOf(selectedDate);
    if (currentIndex < 0) return direction < 0 ? availableDates[0] : availableDates.at(-1);
    const nextIndex = Math.max(
      0,
      Math.min(availableDates.length - 1, currentIndex + direction),
    );
    return availableDates[nextIndex];
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
    const columns = collectTableColumns(rows);
    return datasetName === "clearing"
      ? columns.filter((column) => !CLEARING_HIDDEN_COLUMNS.has(column))
      : columns;
  }

  function mergeTemperatureRows(datasets) {
    const temperatures = new Map();
    const addRows = (rows, fieldName) => {
      rows.forEach((row) => {
        const tradingDate = String(row?.trading_date || "");
        const timeSlot = String(row?.time_slot || "");
        const key = `${tradingDate}\u0000${timeSlot}`;
        if (!temperatures.has(key)) {
          temperatures.set(key, { trading_date: tradingDate, time_slot: timeSlot });
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

  function candidateLocalUrls(url) {
    const normalized = String(url || "").replace(/^\/+/, "");
    if (!normalized || normalized.startsWith("public/")) return [normalized];
    return [normalized, `public/${normalized}`];
  }

  function buildChartModel(definitions) {
    const times = sortTimeSlots(
      definitions.flatMap(({ rows }) => rows.map((row) => row.time_slot)),
    );
    const series = definitions.map((definition) => {
      const byTime = new Map(
        definition.rows.map((row) => [row.time_slot, row[definition.field]]),
      );
      return {
        name: definition.name,
        axis: definition.axis || 0,
        data: times.map((time) => {
          const value = byTime.get(time);
          return typeof value === "number" ? value : null;
        }),
      };
    });
    return { times, series, axes: Array.from(new Set(series.map((item) => item.axis))) };
  }

  function definitions(rows, fields) {
    return fields.map(([field, name, axis = 0]) => ({ rows, field, name, axis }));
  }

  function buildOverviewModels(payload) {
    const datasets = payload?.datasets || {};
    const forecast = datasets.forecast || [];
    const realtime = datasets.realtime || [];
    const clearing = datasets.clearing || [];
    const rolling = datasets.rollingAuction || [];
    const priceForecast = datasets.priceForecast || [];
    const temperatures = mergeTemperatureRows(datasets);
    const coalForecast = datasets.coalForecast || [];

    return {
      system: buildChartModel([
        ...definitions(forecast, [
          ["load_forecast_mw", "负荷预测"],
          ["non_market_forecast_mw", "非市场化机组预测"],
          ["renewable_forecast_mw", "新能源预测"],
          ["external_import_mw", "区外受电计划"],
        ]),
        ...definitions(realtime, [
          ["actual_load_mw", "实际负荷"],
          ["non_market_gen_mw", "非市场化机组出力"],
          ["renewable_gen_mw", "新能源出力"],
          ["tie_line_mw", "联络线电力"],
        ]),
      ]),
      market: buildChartModel([
        ...definitions(clearing, [
          ["day_ahead_price", "日前节点电价"],
          ["realtime_price", "实时节点电价"],
        ]),
        ...definitions(priceForecast, [
          ["realtime_ensemble_price", "集合实时电价预测"],
          ["realtime_linear_price", "线性预测"],
          ["realtime_rf_price", "随机森林预测"],
          ["realtime_bagging_price", "Bagging预测"],
          ["realtime_catboost_price", "CatBoost预测"],
          ["realtime_lightgbm_price", "LightGBM预测"],
          ["realtime_xgboost_price", "XGBoost预测"],
        ]),
        ...definitions(rolling, [
          ["d2_mid_price", "D-2滚撮中位价"],
          ["d2_low_price", "D-2滚撮最低价"],
          ["d2_high_price", "D-2滚撮最高价"],
        ]),
      ]),
      clearing: buildChartModel(definitions(clearing, [
        ["day_ahead_price", "日前节点电价"],
        ["realtime_price", "实时节点电价"],
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
        ["thermal_total_mw", "火电总出力"],
      ])),
      weatherCoal: buildChartModel([
        ...definitions(temperatures, [["actual_temperature_c", "实际温度", 1]]),
        ...definitions(temperatures, [["forecast_temperature_c", "预测温度", 1]]),
        ...definitions(coalForecast, [
          ["coal_forecast_mw", "集合燃煤预测"],
          ["coal_linear_mw", "线性燃煤预测"],
          ["coal_rf_mw", "随机森林燃煤预测"],
          ["coal_bagging_mw", "Bagging燃煤预测"],
          ["coal_catboost_mw", "CatBoost燃煤预测"],
          ["coal_lightgbm_mw", "LightGBM燃煤预测"],
          ["coal_xgboost_mw", "XGBoost燃煤预测"],
        ]),
      ]),
    };
  }

  const exported = {
    buildOverviewModels,
    candidateLocalUrls,
    collectTableColumns,
    collectDatasetTableColumns,
    DATASET_LABELS,
    datasetRows,
    findAdjacentDate,
    mergeTemperatureRows,
    sortTimeSlots,
    VISIBLE_DATASET_NAMES,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = exported;
  }

  if (!root?.document) return;

  const page = root.document.querySelector('[data-page="overview"]');
  if (!page) return;

  const elements = {
    date: root.document.getElementById("overviewDate"),
    previous: root.document.getElementById("overviewPreviousDate"),
    next: root.document.getElementById("overviewNextDate"),
    coverage: root.document.getElementById("overviewCoverage"),
    status: root.document.getElementById("overviewStatus"),
    tabs: root.document.getElementById("overviewDatasetTabs"),
    table: root.document.getElementById("overviewTable"),
    range: root.document.getElementById("overviewRange"),
  };
  const chartElements = {
    system: root.document.getElementById("overviewSystemChart"),
    market: root.document.getElementById("overviewMarketChart"),
    clearing: root.document.getElementById("overviewClearingChart"),
    weatherCoal: root.document.getElementById("overviewWeatherCoalChart"),
  };
  const charts = {};
  let manifest = null;
  let currentPayload = null;
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
    const head = columns.map((column) => (
      `<th title="${escapeHtml(column)}">${escapeHtml(FIELD_LABELS[column] || column)}</th>`
    )).join("");
    const body = rows.map((row) => (
      `<tr>${columns.map((column) => `<td>${escapeHtml(row[column])}</td>`).join("")}</tr>`
    )).join("");
    elements.table.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>`;
  }

  function tooltipPosition(point, _params, _dom, _rect, size) {
    const left = point[0] > size.viewSize[0] / 2
      ? 12
      : Math.max(12, size.viewSize[0] - size.contentSize[0] - 12);
    return [left, 12];
  }

  function chartOption(model, units) {
    const hasValues = model.series.some((series) => series.data.some((value) => value !== null));
    const dualAxis = model.axes.includes(1);
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
      },
      legend: {
        type: "scroll",
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
        axisLabel: { color: "#64748b", interval: 7, fontSize: 10 },
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
      series: model.series.map((series) => ({
        name: series.name,
        type: "line",
        yAxisIndex: series.axis,
        data: series.data,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 1.7 },
        emphasis: { focus: "series", lineStyle: { width: 2.5 } },
      })),
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
      system: [models.system, ["MW"]],
      market: [models.market, ["元/MWh"]],
      clearing: [models.clearing, ["MW"]],
      weatherCoal: [models.weatherCoal, ["MW", "℃"]],
    };
    Object.entries(chartSettings).forEach(([name, [model, units]]) => {
      if (!charts[name]) charts[name] = root.echarts.init(chartElements[name]);
      charts[name].setOption(chartOption(model, units), true);
    });
  }

  function updateDateButtons() {
    const dates = manifest?.availableDates || [];
    const index = dates.indexOf(elements.date.value);
    elements.previous.disabled = index <= 0;
    elements.next.disabled = index < 0 || index >= dates.length - 1;
  }

  async function loadOverviewDate(tradingDate) {
    if (!manifest?.entries?.[tradingDate]) {
      setStatus("所选日期没有本地历史数据", "error");
      return;
    }
    const generation = ++requestGeneration;
    setStatus(`正在读取 ${tradingDate} 的本地历史数据...`);
    try {
      const payload = await fetchLocalPayload(
        manifest.entries[tradingDate],
        manifest.generatedAt,
      );
      if (generation !== requestGeneration) return;
      currentPayload = payload;
      elements.date.value = tradingDate;
      renderCoverage(payload);
      renderTabs(payload);
      renderTable(currentDataset);
      renderCharts(payload);
      updateDateButtons();
      setStatus(`已显示 ${tradingDate} 的本地历史数据`, "success");
    } catch (error) {
      if (generation !== requestGeneration) return;
      setStatus(error.message || "本地历史数据读取失败", "error");
    }
  }

  async function loadOverviewManifest() {
    const manifestUrl = page.dataset.overviewManifest || "overview-data/index.json";
    setStatus("正在读取本地历史数据索引...");
    try {
      manifest = await fetchLocalPayload(manifestUrl, Date.now());
      const dates = manifest.availableDates || [];
      if (!dates.length) throw new Error("本地历史数据为空");
      elements.date.min = manifest.startDate;
      elements.date.max = manifest.endDate;
      elements.range.textContent = `${manifest.startDate} 至 ${manifest.endDate}，共 ${dates.length} 个日期`;
      await loadOverviewDate(manifest.latestDate || dates.at(-1));
    } catch (error) {
      setStatus(error.message || "本地历史数据索引读取失败", "error");
    }
  }

  elements.date.addEventListener("change", () => loadOverviewDate(elements.date.value));
  elements.previous.addEventListener("click", () => {
    loadOverviewDate(findAdjacentDate(manifest?.availableDates || [], elements.date.value, -1));
  });
  elements.next.addEventListener("click", () => {
    loadOverviewDate(findAdjacentDate(manifest?.availableDates || [], elements.date.value, 1));
  });
  elements.tabs.addEventListener("click", (event) => {
    const button = event.target.closest("[data-overview-dataset]");
    if (button) renderTable(button.dataset.overviewDataset);
  });
  root.document.querySelectorAll('[data-page-target="overview"]').forEach((tab) => {
    tab.addEventListener("click", () => root.setTimeout(() => {
      Object.values(charts).forEach((chart) => chart.resize());
    }, 0));
  });
  root.addEventListener("resize", () => {
    Object.values(charts).forEach((chart) => chart.resize());
  });

  loadOverviewManifest();
}(typeof window !== "undefined" ? window : null));
