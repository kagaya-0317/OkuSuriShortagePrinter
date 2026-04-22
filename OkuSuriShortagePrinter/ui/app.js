(function () {
  const MAX_DRUG_TABS = 4;
  const DEFAULT_SHORTAGE_UNIT = "日分";
  const MIXED_OINTMENT_UNIT = "g";
  const MIXED_SYRUP_UNIT = "mL";
  const DEFAULT_ARRIVE = "arriveUndecided";
  const DEFAULT_DEST = "destUnknown";
  const MAX_NOTES_LINES = 3;
  const DESIGN_VIEWPORT_WIDTH = 1000;
  const DESIGN_VIEWPORT_HEIGHT = 800;
  const MIN_UI_SCALE = 0.72;
  const MAX_UI_SCALE = 1.8;
  const DEFAULT_STARTUP_WINDOW_SCALE_PERCENT = 100;
  const DEFAULT_UI_SCALE_PERCENT = 100;
  const MIN_STARTUP_WINDOW_SCALE_PERCENT = 75;
  const MAX_STARTUP_WINDOW_SCALE_PERCENT = 150;
  const MIN_UI_SCALE_PERCENT = 75;
  const MAX_UI_SCALE_PERCENT = 150;
  const DEFAULT_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM = 30;
  const MIN_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM = 30;
  const MAX_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM = 120;
  const PANEL_OPEN_DURATION_MS = 220;
  const PANEL_HEIGHT_TRANSITION_DURATION_MS = 260;
  const MIN_PANEL_OPEN_OFFSET_PX = 6;
  const MAX_PANEL_OPEN_OFFSET_PX = 14;

  const $ = (id) => document.getElementById(id);
  const post = (obj) => {
    try {
      window.chrome?.webview?.postMessage(obj);
    } catch (_) {
      // no-op
    }
  };

  const elPrinterName = $("printerName");
  const elPatient = $("patient");
  const elDrug = $("drug");
  const elDrugNameQuestion = document.querySelector("label[for='drug'].question");
  const elShortageCount = $("shortageCount");
  const elShortageDays = $("shortageDays");
  const elShortageUnit = $("shortageUnit");
  const elShortageUnitOther = $("shortageUnitOther");
  const elUnitOtherWrap = $("unitOtherWrap");
  const elShortageQuestion = $("shortageQuestion");
  const elArrivalQuestion = $("arrivalQuestion");
  const elDestinationQuestion = $("destinationQuestion");
  const elDrugUsageWrap = $("drugUsageWrap");
  const elDrugUsageQuestion = $("drugUsageQuestion");
  const elDrugUsage = $("drugUsage");
  const elArriveOtherText = $("arriveOtherText");
  const elDestSmallText = $("destSmallText");
  const elDestOtherText = $("destOtherText");
  const elNotes = $("notes");
  const elDrugTabs = $("drugTabs");
  const drugTypeButtons = Array.from(document.querySelectorAll("[data-drug-type]"));

  const elSummaryPatient = $("summaryPatient");
  const elSummaryDrug = $("summaryDrug");
  const elSummaryShortage = $("summaryShortage");
  const elSummaryArrive = $("summaryArrive");
  const elSummaryDest = $("summaryDest");
  const elSummaryNotes = $("summaryNotes");

  const elBtnPreview = $("btnPreview");
  const elBtnPrintWrap = $("btnPrintWrap");
  const elBtnPrint = $("btnPrint");
  const elPreviewPrintWrap = $("btnPreviewPrintWrap");
  const elPreviewPrint = $("btnPreviewPrint");
  const elBtnClear = $("btnClear");
  const elBtnSettings = $("btnSettings");
  const elPrintMissingTip = $("printMissingTip");
  const elPrintMissingTipText = elPrintMissingTip?.querySelector(".tip-text");
  const elPreviewPrintMissingTip = $("previewPrintMissingTip");
  const elPreviewPrintMissingTipText = elPreviewPrintMissingTip?.querySelector(".tip-text");
  const elWarn = $("missingWarn");
  const elBusy = $("busyOverlay");
  const elToast = $("toast");
  const elError = $("error");

  const elSettingsModal = $("settingsModal");
  const elBtnSettingsClose = $("btnSettingsClose");
  const elStartupWindowScale = $("startupWindowScale");
  const elStartupWindowScaleValue = $("startupWindowScaleValue");
  const elUiScale = $("uiScale");
  const elUiScaleValue = $("uiScaleValue");
  const elPage1YellowFrameThickness = $("page1YellowFrameThickness");
  const elPage1YellowFrameThicknessValue = $("page1YellowFrameThicknessValue");

  const elPreviewModal = $("previewModal");
  const elPreviewFrame = $("previewFrame");
  const elPreviewTitle = $("previewTitle");
  const elPreviewClose = $("btnPreviewClose");

  const items = Array.from(document.querySelectorAll(".qa-item"));
  let activeStep = 0;
  let isBusy = false;
  let devDefaultsApplied = false;
  let toastFadeTimerId = 0;
  let toastHideTimerId = 0;
  let toastFireworkTimerId = 0;
  let busyDotsTimerId = 0;
  let busyDotsIndex = 0;
  let elToastLabel = null;
  const TOAST_CHECK_POP_MS = 480;
  const TOAST_FIREWORK_DELAY_MS = 80;
  const BUSY_DOT_STATES = [".", "..", "..."];
  const BUSY_DOT_STEP_MS = 333;
  let responsiveScaleRafId = 0;
  let startupWindowScalePercent = DEFAULT_STARTUP_WINDOW_SCALE_PERCENT;
  let userUiScalePercent = DEFAULT_UI_SCALE_PERCENT;
  let page1YellowFrameThicknessTenthsMm = DEFAULT_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM;
  let previewScrollSource = null;
  let previewWindowSource = null;
  let previewSheetObserver = null;

  let drugs = [createEmptyDrug()];
  let activeDrugIndex = 0;

  const defaultMissingWarnText = (elWarn?.textContent || "").trim();
  const SVG_NS = "http://www.w3.org/2000/svg";

  function createEmptyDrug() {
    return {
      drug: "",
      drugType: "",
      drugUsage: "",
      shortageCount: "",
      shortageDays: "",
      shortageUnit: DEFAULT_SHORTAGE_UNIT,
      shortageUnitOther: "",
      arrive: DEFAULT_ARRIVE,
      arriveOtherText: "",
      dest: DEFAULT_DEST,
      destSmallText: "",
      destOtherText: "",
      notes: ""
    };
  }

  function cloneDrug(drug) {
    return {
      drug: (drug.drug || "").trim(),
      drugType: (drug.drugType || "").trim(),
      drugUsage: (drug.drugUsage || "").trim(),
      shortageCount: (drug.shortageCount || "").trim(),
      shortageDays: (drug.shortageDays || "").trim(),
      shortageUnit: (drug.shortageUnit || DEFAULT_SHORTAGE_UNIT).trim(),
      shortageUnitOther: (drug.shortageUnitOther || "").trim(),
      arrive: (drug.arrive || DEFAULT_ARRIVE).trim(),
      arriveOtherText: (drug.arriveOtherText || "").trim(),
      dest: (drug.dest || DEFAULT_DEST).trim(),
      destSmallText: (drug.destSmallText || "").trim(),
      destOtherText: (drug.destOtherText || "").trim(),
      notes: (drug.notes || "").trim()
    };
  }

  function currentDrug() {
    return drugs[activeDrugIndex] || drugs[0];
  }

  function renderBusyOverlayText() {
    if (!elBusy) return;
    elBusy.textContent = `印刷中${BUSY_DOT_STATES[busyDotsIndex]}`;
  }

  function startBusyOverlayAnimation() {
    if (!elBusy) return;
    if (busyDotsTimerId) window.clearInterval(busyDotsTimerId);
    busyDotsIndex = 0;
    renderBusyOverlayText();
    busyDotsTimerId = window.setInterval(() => {
      busyDotsIndex = (busyDotsIndex + 1) % BUSY_DOT_STATES.length;
      renderBusyOverlayText();
    }, BUSY_DOT_STEP_MS);
  }

  function stopBusyOverlayAnimation() {
    if (busyDotsTimerId) {
      window.clearInterval(busyDotsTimerId);
      busyDotsTimerId = 0;
    }
    busyDotsIndex = 0;
    renderBusyOverlayText();
  }

  function setBusy(on) {
    isBusy = !!on;
    if (elBusy) elBusy.hidden = !isBusy;
    if (isBusy) {
      startBusyOverlayAnimation();
    } else {
      stopBusyOverlayAnimation();
    }
    const printable = canPrint();
    if (elBtnPrint) elBtnPrint.disabled = isBusy || !printable;
    if (elPreviewPrint) elPreviewPrint.disabled = isBusy || !printable;
    if (elBtnPreview) elBtnPreview.disabled = isBusy;
    if (elBtnClear) elBtnClear.disabled = isBusy;
    if (isBusy) {
      hidePrintReadyTip();
      hidePrintMissingTip();
      hidePreviewPrintMissingTip();
      hideDrugAddTip();
    }
  }

  function setPreviewTitle(currentPage, totalPages) {
    if (!elPreviewTitle) return;
    const total = Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 0;
    const current = Number.isFinite(currentPage) && currentPage > 0 ? Math.floor(currentPage) : 0;
    if (total <= 0 || current <= 0) {
      elPreviewTitle.textContent = "印刷プレビュー（A4）";
      return;
    }
    const safeCurrent = Math.max(1, Math.min(total, current));
    elPreviewTitle.textContent = `印刷プレビュー（A4 ${safeCurrent}/${total}ページ）`;
  }

  function getPreviewSheetElements() {
    if (!elPreviewFrame?.contentDocument) return [];
    return Array.from(elPreviewFrame.contentDocument.querySelectorAll(".sheet"));
  }

  function calculateCurrentPreviewPage(sheets, contentWindow) {
    if (!Array.isArray(sheets) || sheets.length === 0) return 0;
    if (!contentWindow) return 1;

    const viewportMidY = contentWindow.innerHeight / 2;
    let nearestPage = 1;
    let nearestDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < sheets.length; index += 1) {
      const rect = sheets[index].getBoundingClientRect();
      if (rect.top <= viewportMidY && rect.bottom >= viewportMidY) {
        return index + 1;
      }

      const distance = viewportMidY < rect.top
        ? rect.top - viewportMidY
        : viewportMidY - rect.bottom;

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPage = index + 1;
      }
    }

    return nearestPage;
  }

  function updatePreviewPageIndicator() {
    if (!elPreviewModal || elPreviewModal.hidden) return;
    const sheets = getPreviewSheetElements();
    const totalPages = sheets.length;
    const currentPage = calculateCurrentPreviewPage(sheets, elPreviewFrame?.contentWindow || null);
    setPreviewTitle(currentPage, totalPages);
  }

  function teardownPreviewTracking() {
    if (previewScrollSource && typeof previewScrollSource.removeEventListener === "function") {
      previewScrollSource.removeEventListener("scroll", updatePreviewPageIndicator);
    }
    if (previewWindowSource && typeof previewWindowSource.removeEventListener === "function") {
      previewWindowSource.removeEventListener("resize", updatePreviewPageIndicator);
      previewWindowSource.removeEventListener("scroll", updatePreviewPageIndicator);
    }
    if (previewSheetObserver) {
      previewSheetObserver.disconnect();
      previewSheetObserver = null;
    }
    previewScrollSource = null;
    previewWindowSource = null;
  }

  function setupPreviewTracking() {
    teardownPreviewTracking();
    if (!elPreviewFrame?.contentWindow || !elPreviewFrame?.contentDocument) return;

    const doc = elPreviewFrame.contentDocument;
    const win = elPreviewFrame.contentWindow;
    const previewRoot = doc.querySelector(".preview-root");

    previewWindowSource = win;
    previewScrollSource = previewRoot instanceof HTMLElement ? previewRoot : win;

    if (typeof previewScrollSource.addEventListener === "function") {
      previewScrollSource.addEventListener("scroll", updatePreviewPageIndicator, { passive: true });
    }
    if (typeof win.addEventListener === "function") {
      win.addEventListener("resize", updatePreviewPageIndicator);
      win.addEventListener("scroll", updatePreviewPageIndicator, { passive: true });
    }

    if (previewRoot instanceof HTMLElement && typeof MutationObserver !== "undefined") {
      previewSheetObserver = new MutationObserver(() => {
        updatePreviewPageIndicator();
      });
      previewSheetObserver.observe(previewRoot, { childList: true, subtree: true });
    }

    window.setTimeout(updatePreviewPageIndicator, 0);
    window.setTimeout(updatePreviewPageIndicator, 120);
  }

  function setPrinterOptions(printers, defaultPrinter, preferredPrinter) {
    if (!(elPrinterName instanceof HTMLSelectElement)) return;

    const names = Array.isArray(printers)
      ? printers
        .filter((name) => typeof name === "string")
        .map((name) => name.trim())
        .filter((name) => name.length > 0)
      : [];
    const uniqueNames = Array.from(new Set(names));

    if (!uniqueNames.length && typeof defaultPrinter === "string" && defaultPrinter.trim()) {
      uniqueNames.push(defaultPrinter.trim());
    }

    const prevSelected = (elPrinterName.value || "").trim();
    elPrinterName.innerHTML = "";

    uniqueNames.forEach((name) => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      elPrinterName.appendChild(option);
    });

    if (!uniqueNames.length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "(利用可能なプリンタなし)";
      elPrinterName.appendChild(option);
      elPrinterName.disabled = true;
      return;
    }

    elPrinterName.disabled = false;
    const preferredName = (preferredPrinter || "").trim();
    const defaultName = (defaultPrinter || "").trim();
    const nextSelected = uniqueNames.includes(preferredName)
      ? preferredName
      : uniqueNames.includes(defaultName)
        ? defaultName
      : uniqueNames.includes(prevSelected)
        ? prevSelected
        : uniqueNames[0];
    elPrinterName.value = nextSelected;
  }

  function normalizePercent(value, min, max, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
  }

  function getUiScaleRatioForAnimation() {
    const span = MAX_UI_SCALE_PERCENT - MIN_UI_SCALE_PERCENT;
    if (span <= 0) return 0.5;
    return (userUiScalePercent - MIN_UI_SCALE_PERCENT) / span;
  }

  function getPanelOpenDurationMs() {
    return PANEL_OPEN_DURATION_MS;
  }

  function getPanelHeightTransitionDurationMs() {
    return PANEL_HEIGHT_TRANSITION_DURATION_MS;
  }

  function updateAccordionAnimationProfile() {
    const root = document.documentElement;
    if (!(root instanceof HTMLElement)) return;

    const openDurationMs = getPanelOpenDurationMs();
    const heightDurationMs = getPanelHeightTransitionDurationMs();
    const ratio = getUiScaleRatioForAnimation();
    const offsetPx = Math.round(
      MIN_PANEL_OPEN_OFFSET_PX + ((MAX_PANEL_OPEN_OFFSET_PX - MIN_PANEL_OPEN_OFFSET_PX) * ratio)
    );

    root.style.setProperty("--panel-open-duration-ms", String(openDurationMs));
    root.style.setProperty("--panel-open-duration", `${openDurationMs}ms`);
    root.style.setProperty("--panel-height-transition-duration-ms", String(heightDurationMs));
    root.style.setProperty("--panel-open-offset", `${offsetPx}px`);
  }

  function updateSettingsValueLabels() {
    if (elStartupWindowScaleValue) elStartupWindowScaleValue.textContent = `${startupWindowScalePercent}%`;
    if (elUiScaleValue) elUiScaleValue.textContent = `${userUiScalePercent}%`;
    if (elPage1YellowFrameThicknessValue) {
      elPage1YellowFrameThicknessValue.textContent = `${(page1YellowFrameThicknessTenthsMm / 10).toFixed(1)} mm`;
    }
  }

  function applySettingsState(settings) {
    const startupMin = normalizePercent(settings?.startupWindowScaleMin, 50, 300, MIN_STARTUP_WINDOW_SCALE_PERCENT);
    const startupMax = normalizePercent(settings?.startupWindowScaleMax, startupMin, 300, MAX_STARTUP_WINDOW_SCALE_PERCENT);
    const uiMin = normalizePercent(settings?.uiScaleMin, 50, 300, MIN_UI_SCALE_PERCENT);
    const uiMax = normalizePercent(settings?.uiScaleMax, uiMin, 300, MAX_UI_SCALE_PERCENT);
    const page1YellowFrameThicknessMinTenthsMm = normalizePercent(
      settings?.page1YellowFrameThicknessMinTenthsMm,
      1,
      200,
      MIN_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM
    );
    const page1YellowFrameThicknessMaxTenthsMm = normalizePercent(
      settings?.page1YellowFrameThicknessMaxTenthsMm,
      page1YellowFrameThicknessMinTenthsMm,
      200,
      MAX_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM
    );

    startupWindowScalePercent = normalizePercent(
      settings?.startupWindowScalePercent,
      startupMin,
      startupMax,
      DEFAULT_STARTUP_WINDOW_SCALE_PERCENT
    );
    userUiScalePercent = normalizePercent(
      settings?.uiScalePercent,
      uiMin,
      uiMax,
      DEFAULT_UI_SCALE_PERCENT
    );
    page1YellowFrameThicknessTenthsMm = normalizePercent(
      settings?.page1YellowFrameThicknessTenthsMm,
      page1YellowFrameThicknessMinTenthsMm,
      page1YellowFrameThicknessMaxTenthsMm,
      DEFAULT_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM
    );

    if (elStartupWindowScale) {
      elStartupWindowScale.min = String(startupMin);
      elStartupWindowScale.max = String(startupMax);
      elStartupWindowScale.value = String(startupWindowScalePercent);
    }

    if (elUiScale) {
      elUiScale.min = String(uiMin);
      elUiScale.max = String(uiMax);
      elUiScale.value = String(userUiScalePercent);
    }

    if (elPage1YellowFrameThickness) {
      elPage1YellowFrameThickness.min = String(page1YellowFrameThicknessMinTenthsMm);
      elPage1YellowFrameThickness.max = String(page1YellowFrameThicknessMaxTenthsMm);
      elPage1YellowFrameThickness.value = String(page1YellowFrameThicknessTenthsMm);
    }

    updateSettingsValueLabels();
    updateAccordionAnimationProfile();
    requestResponsiveScale();
  }

  function postSettingsToHost() {
    post({
      cmd: "saveSettings",
      printerName: (elPrinterName?.value || "").trim(),
      startupWindowScalePercent,
      uiScalePercent: userUiScalePercent,
      page1YellowFrameThicknessTenthsMm
    });
  }

  function ensureToastLabelElement() {
    if (!elToast) return null;
    if (elToastLabel instanceof HTMLElement) return elToastLabel;

    elToast.innerHTML = [
      '<span class="toast-check" aria-hidden="true">',
      '  <span class="toast-firework" aria-hidden="true">',
      '    <span class="toast-firework-ray" style="--ray-angle:0deg"></span>',
      '    <span class="toast-firework-ray" style="--ray-angle:45deg"></span>',
      '    <span class="toast-firework-ray" style="--ray-angle:90deg"></span>',
      '    <span class="toast-firework-ray" style="--ray-angle:135deg"></span>',
      '    <span class="toast-firework-ray" style="--ray-angle:180deg"></span>',
      '    <span class="toast-firework-ray" style="--ray-angle:225deg"></span>',
      '    <span class="toast-firework-ray" style="--ray-angle:270deg"></span>',
      '    <span class="toast-firework-ray" style="--ray-angle:315deg"></span>',
      "  </span>",
      '  <span class="toast-check-short"></span>',
      '  <span class="toast-check-long"></span>',
      "</span>",
      '<span class="toast-label"></span>'
    ].join("");

    const label = elToast.querySelector(".toast-label");
    elToastLabel = label instanceof HTMLElement ? label : null;
    return elToastLabel;
  }

  function showToast(message) {
    if (!elToast) return;

    if (toastFadeTimerId) {
      window.clearTimeout(toastFadeTimerId);
      toastFadeTimerId = 0;
    }
    if (toastHideTimerId) {
      window.clearTimeout(toastHideTimerId);
      toastHideTimerId = 0;
    }
    if (toastFireworkTimerId) {
      window.clearTimeout(toastFireworkTimerId);
      toastFireworkTimerId = 0;
    }

    const normalizedMessage = (message || "").trim();
    const label = ensureToastLabelElement();
    if (!label) return;

    label.textContent = normalizedMessage.startsWith("印刷しました")
      ? "印刷しました！"
      : (normalizedMessage || "印刷しました！");
    elToast.classList.remove("is-fading");
    elToast.style.display = "flex";
    void elToast.offsetWidth;

    const check = elToast.querySelector(".toast-check");
    if (check instanceof HTMLElement) {
      check.classList.remove("is-pop");
      check.classList.remove("is-firework");
      void check.offsetWidth;
      check.classList.add("is-pop");

      toastFireworkTimerId = window.setTimeout(() => {
        if (!elToast || elToast.style.display === "none") return;
        check.classList.remove("is-firework");
        void check.offsetWidth;
        check.classList.add("is-firework");
        toastFireworkTimerId = 0;
      }, TOAST_FIREWORK_DELAY_MS);
    }

    toastFadeTimerId = window.setTimeout(() => {
      if (!elToast) return;
      elToast.classList.add("is-fading");
      toastFadeTimerId = 0;
    }, 2000);

    toastHideTimerId = window.setTimeout(() => {
      if (!elToast) return;
      elToast.style.display = "none";
      elToast.classList.remove("is-fading");
      const activeCheck = elToast.querySelector(".toast-check");
      if (activeCheck instanceof HTMLElement) {
        activeCheck.classList.remove("is-pop");
        activeCheck.classList.remove("is-firework");
      }
      toastHideTimerId = 0;
    }, 2400);
  }

  function showError(message) {
    if (!elError) return;
    elError.textContent = message || "エラーが発生しました。";
    elError.style.display = "block";
    setTimeout(() => {
      if (elError) elError.style.display = "none";
    }, 4200);
  }

  function hidePrintReadyTip() {
    if (elBtnPrint) elBtnPrint.classList.remove("show-print-ready-tip");
  }

  function hidePrintMissingTip() {
    if (elBtnPrintWrap) elBtnPrintWrap.classList.remove("show-print-missing-tip");
  }

  function hidePreviewPrintMissingTip() {
    if (elPreviewPrintWrap) elPreviewPrintWrap.classList.remove("show-print-missing-tip");
  }

  function updatePrintMissingTipLabel(targetTextEl) {
    const label = getPrintMissingFieldLabel();
    if (targetTextEl instanceof HTMLElement) {
      targetTextEl.textContent = label ? `${label}が未記入です` : "";
    }
    return label;
  }

  function showPrintReadyTip() {
    if (!elBtnPrint || elBtnPrint.disabled) return;

    hidePrintReadyTip();
    void elBtnPrint.offsetWidth;
    elBtnPrint.classList.add("show-print-ready-tip");
    window.requestAnimationFrame(layoutVisibleTipBubbles);
  }

  function showPrintMissingTip() {
    if (!(elBtnPrintWrap instanceof HTMLElement) || isBusy) return;

    const missingLabel = updatePrintMissingTipLabel(elPrintMissingTipText);
    if (!missingLabel) return;

    hidePrintMissingTip();
    void elBtnPrintWrap.offsetWidth;
    elBtnPrintWrap.classList.add("show-print-missing-tip");
    window.requestAnimationFrame(layoutVisibleTipBubbles);
  }

  function showPreviewPrintMissingTip() {
    if (!(elPreviewPrintWrap instanceof HTMLElement) || isBusy) return;

    const missingLabel = updatePrintMissingTipLabel(elPreviewPrintMissingTipText);
    if (!missingLabel) return;

    hidePreviewPrintMissingTip();
    void elPreviewPrintWrap.offsetWidth;
    elPreviewPrintWrap.classList.add("show-print-missing-tip");
    window.requestAnimationFrame(layoutVisibleTipBubbles);
  }

  function hideDrugAddTip() {
    const addButton = elDrugTabs?.querySelector(".drug-tab-add");
    if (addButton instanceof HTMLElement) addButton.classList.remove("show-drug-add-tip");
  }

  function showDrugAddTip() {
    const addButton = elDrugTabs?.querySelector(".drug-tab-add");
    if (!(addButton instanceof HTMLElement)) return;

    hideDrugAddTip();
    void addButton.offsetWidth;
    addButton.classList.add("show-drug-add-tip");
    window.requestAnimationFrame(layoutVisibleTipBubbles);
  }

  function setTipBubblePath(svg, d, width, height) {
    if (!(svg instanceof SVGElement)) return;
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const paths = svg.querySelectorAll("path");
    paths.forEach((path) => {
      path.setAttribute("d", d);
    });
  }

  function layoutDrugAddTipBubble() {
    const bubble = elDrugTabs?.querySelector(".drug-tab-add.show-drug-add-tip .drug-add-tip-bubble");
    if (!(bubble instanceof HTMLElement)) return;

    const svg = bubble.querySelector(".tip-svg");
    if (!(svg instanceof SVGElement)) return;

    const width = Math.ceil(bubble.offsetWidth);
    const height = Math.ceil(bubble.offsetHeight);
    if (width < 8 || height < 8) return;

    const strokeHalf = 1.5;
    const bodyLeft = 16;
    const centerY = Math.round(height / 2);
    const tailHalf = Math.min(4, Math.max(2, Math.floor((height - 8) / 4)));
    const tailTipX = strokeHalf;

    const d = [
      `M ${bodyLeft} ${strokeHalf}`,
      `H ${width - strokeHalf}`,
      `V ${height - strokeHalf}`,
      `H ${bodyLeft}`,
      `V ${centerY + tailHalf}`,
      `L ${tailTipX} ${centerY}`,
      `L ${bodyLeft} ${centerY - tailHalf}`,
      "Z"
    ].join(" ");

    setTipBubblePath(svg, d, width, height);
  }

  function layoutPrintReadyTipBubble() {
    if (!(elBtnPrint instanceof HTMLElement) || !elBtnPrint.classList.contains("show-print-ready-tip")) return;
    const bubble = elBtnPrint.querySelector(".print-ready-tip-bubble");
    if (!(bubble instanceof HTMLElement)) return;

    const svg = bubble.querySelector(".tip-svg");
    if (!(svg instanceof SVGElement)) return;

    const width = Math.ceil(bubble.offsetWidth);
    const height = Math.ceil(bubble.offsetHeight);
    if (width < 8 || height < 8) return;

    const strokeHalf = 1.5;
    const tailBaseY = Math.max(strokeHalf + 6, height - 12);
    const centerX = Math.round(width / 2);
    const maxTailHalf = Math.max(3, Math.floor(width / 2 - strokeHalf - 4));
    const tailHalf = Math.min(6, maxTailHalf);

    const d = [
      `M ${strokeHalf} ${strokeHalf}`,
      `H ${width - strokeHalf}`,
      `V ${tailBaseY}`,
      `H ${centerX + tailHalf}`,
      `L ${centerX} ${height - strokeHalf}`,
      `L ${centerX - tailHalf} ${tailBaseY}`,
      `H ${strokeHalf}`,
      "Z"
    ].join(" ");

    setTipBubblePath(svg, d, width, height);
  }

  function layoutPrintMissingTipBubble() {
    if (!(elBtnPrintWrap instanceof HTMLElement) || !elBtnPrintWrap.classList.contains("show-print-missing-tip")) return;
    const bubble = elBtnPrintWrap.querySelector(".print-missing-tip-bubble");
    if (!(bubble instanceof HTMLElement)) return;

    const svg = bubble.querySelector(".tip-svg");
    if (!(svg instanceof SVGElement)) return;

    const width = Math.ceil(bubble.offsetWidth);
    const height = Math.ceil(bubble.offsetHeight);
    if (width < 8 || height < 8) return;

    const strokeHalf = 1.5;
    const tailBaseY = Math.max(strokeHalf + 6, height - 12);
    const centerX = Math.round(width / 2);
    const maxTailHalf = Math.max(3, Math.floor(width / 2 - strokeHalf - 4));
    const tailHalf = Math.min(6, maxTailHalf);

    const d = [
      `M ${strokeHalf} ${strokeHalf}`,
      `H ${width - strokeHalf}`,
      `V ${tailBaseY}`,
      `H ${centerX + tailHalf}`,
      `L ${centerX} ${height - strokeHalf}`,
      `L ${centerX - tailHalf} ${tailBaseY}`,
      `H ${strokeHalf}`,
      "Z"
    ].join(" ");

    setTipBubblePath(svg, d, width, height);
  }

  function layoutPreviewPrintMissingTipBubble() {
    if (!(elPreviewPrintWrap instanceof HTMLElement) || !elPreviewPrintWrap.classList.contains("show-print-missing-tip")) return;
    const bubble = elPreviewPrintWrap.querySelector(".print-missing-tip-bubble");
    if (!(bubble instanceof HTMLElement)) return;

    const svg = bubble.querySelector(".tip-svg");
    if (!(svg instanceof SVGElement)) return;

    const width = Math.ceil(bubble.offsetWidth);
    const height = Math.ceil(bubble.offsetHeight);
    if (width < 8 || height < 8) return;

    const strokeHalf = 1.5;
    const tailBaseY = Math.max(strokeHalf + 6, height - 12);
    const centerX = Math.round(width / 2);
    const maxTailHalf = Math.max(3, Math.floor(width / 2 - strokeHalf - 4));
    const tailHalf = Math.min(6, maxTailHalf);

    const d = [
      `M ${strokeHalf} ${strokeHalf}`,
      `H ${width - strokeHalf}`,
      `V ${tailBaseY}`,
      `H ${centerX + tailHalf}`,
      `L ${centerX} ${height - strokeHalf}`,
      `L ${centerX - tailHalf} ${tailBaseY}`,
      `H ${strokeHalf}`,
      "Z"
    ].join(" ");

    setTipBubblePath(svg, d, width, height);
  }

  function layoutVisibleTipBubbles() {
    layoutDrugAddTipBubble();
    layoutPrintReadyTipBubble();
    layoutPrintMissingTipBubble();
    layoutPreviewPrintMissingTipBubble();
  }

  function applyResponsiveScale() {
    const root = document.documentElement;
    if (!(root instanceof HTMLElement)) return;

    const widthScale = window.innerWidth / DESIGN_VIEWPORT_WIDTH;
    const heightScale = window.innerHeight / DESIGN_VIEWPORT_HEIGHT;
    const targetScale = Math.min(widthScale, heightScale);
    const clampedScale = Math.max(MIN_UI_SCALE, Math.min(MAX_UI_SCALE, targetScale));
    const userScale = userUiScalePercent / 100;
    root.style.zoom = (clampedScale * userScale).toFixed(3);
  }

  function requestResponsiveScale() {
    if (responsiveScaleRafId) return;
    responsiveScaleRafId = window.requestAnimationFrame(() => {
      responsiveScaleRafId = 0;
      applyResponsiveScale();
      layoutVisibleTipBubbles();
    });
  }

  function createTipBubbleSvg(pathD, fillColor, strokeColor) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "tip-svg");
    svg.setAttribute("viewBox", "0 0 100 100");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.setAttribute("aria-hidden", "true");

    const fillPath = document.createElementNS(SVG_NS, "path");
    fillPath.setAttribute("d", pathD);
    fillPath.setAttribute("fill", fillColor);

    const strokePath = document.createElementNS(SVG_NS, "path");
    strokePath.setAttribute("d", pathD);
    strokePath.setAttribute("fill", "none");
    strokePath.setAttribute("stroke", strokeColor);
    strokePath.setAttribute("stroke-width", "3");
    strokePath.setAttribute("vector-effect", "non-scaling-stroke");
    strokePath.setAttribute("stroke-linejoin", "round");

    svg.appendChild(fillPath);
    svg.appendChild(strokePath);
    return svg;
  }

  function createDrugAddTipBubbleElement() {
    const bubble = document.createElement("span");
    bubble.className = "drug-add-tip-bubble";
    bubble.setAttribute("aria-hidden", "true");

    bubble.appendChild(
      createTipBubbleSvg("M13 1.5H98.5V98.5H13V54L1.5 50L13 46Z", "#ffe4ef", "#e7aeca")
    );

    const text = document.createElement("span");
    text.className = "tip-text";
    text.textContent = "不足薬品が他にもある場合はここから追加";
    bubble.appendChild(text);
    return bubble;
  }

  function cleanupHeightTransition(item) {
    item.style.removeProperty("height");
    item.style.removeProperty("transition");
    item.style.removeProperty("overflow");
  }

  function getLayoutZoomFactor() {
    const root = document.documentElement;
    if (!(root instanceof HTMLElement)) return 1;
    const raw = Number.parseFloat(root.style.zoom || "1");
    if (!Number.isFinite(raw) || raw <= 0) return 1;
    return raw;
  }

  function animateHeightChange(targetItems, mutate, animate) {
    const shouldAnimate = animate !== false;
    const elements = targetItems.filter((item) => item instanceof HTMLElement);
    const heightTransitionDurationMs = getPanelHeightTransitionDurationMs();

    if (!shouldAnimate || elements.length === 0) {
      mutate();
      return;
    }

    const zoomFactor = getLayoutZoomFactor();
    elements.forEach((item) => cleanupHeightTransition(item));
    const beforeHeights = elements.map((item) => item.getBoundingClientRect().height / zoomFactor);

    mutate();

    elements.forEach((item, idx) => {
      const from = beforeHeights[idx];
      const to = item.getBoundingClientRect().height / zoomFactor;
      if (!Number.isFinite(from) || !Number.isFinite(to) || Math.abs(from - to) < 0.5) return;

      item.style.height = `${from}px`;
      item.style.overflow = "hidden";
      void item.offsetHeight;
      item.style.transition = `height ${heightTransitionDurationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
      item.style.height = `${to}px`;

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        cleanupHeightTransition(item);
      };
      item.addEventListener("transitionend", cleanup, { once: true });
      window.setTimeout(cleanup, heightTransitionDurationMs + 80);
    });
  }

  function focusStepInput(step) {
    const panel = items[step]?.querySelector(".qa-panel");
    const target = panel?.querySelector("input,select,textarea");
    if (target instanceof HTMLElement) target.focus();
  }

  function openStep(step, focusInput, animate) {
    const nextStep = Math.max(0, Math.min(items.length - 1, step));
    const shouldAnimate = animate !== false;

    animateHeightChange(items, () => {
      activeStep = nextStep;
      items.forEach((item, idx) => {
        item.classList.toggle("open", idx === activeStep);
      });
    }, animate);

    if (!focusInput) return;

    if (!shouldAnimate) {
      focusStepInput(nextStep);
      return;
    }

    window.setTimeout(() => {
      if (activeStep !== nextStep) return;
      focusStepInput(nextStep);
    }, getPanelHeightTransitionDurationMs() + 20);
  }

  function closeStep(animate) {
    animateHeightChange(items, () => {
      activeStep = -1;
      items.forEach((item) => {
        item.classList.remove("open");
      });
    }, animate);
  }

  function nextStep() {
    openStep(Math.min(activeStep + 1, items.length - 1), true);
  }

  function digitsOnly(el) {
    if (!el) return;
    const next = (el.value || "").replace(/[^\d]/g, "").slice(0, 5);
    if (el.value !== next) el.value = next;
  }

  function adjustNumericByWheel(el, deltaY) {
    if (!el) return;
    const raw = (el.value || "").trim();
    const current = parseCount(raw) ?? 0;
    const next = Math.max(0, current + (deltaY < 0 ? 1 : -1));
    el.value = String(next);
  }

  function parseCount(value) {
    const text = (value || "").trim();
    if (!text) return null;
    const n = Number.parseInt(text, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
  }

  function normalizeLineBreaks(text) {
    return (text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  }

  function limitNotesLines(text) {
    const normalized = normalizeLineBreaks(text);
    const lines = normalized.split("\n");
    if (lines.length <= MAX_NOTES_LINES) return normalized;
    return lines.slice(0, MAX_NOTES_LINES).join("\n");
  }

  function selectedValue(name) {
    const selected = document.querySelector(`input[name='${name}']:checked`);
    return selected ? selected.value : "";
  }

  function setRadioValue(name, value, fallback) {
    const normalizedValue = value || fallback || "";
    const target = document.querySelector(`input[name='${name}'][value='${normalizedValue}']`);
    if (target) {
      target.checked = true;
      return;
    }
    if (!fallback) return;
    const fallbackInput = document.querySelector(`input[name='${name}'][value='${fallback}']`);
    if (fallbackInput) fallbackInput.checked = true;
  }

  function setDrugTypeButtons(nextType) {
    const selectedType = nextType || "";
    drugTypeButtons.forEach((btn) => {
      const value = btn.getAttribute("data-drug-type") || "";
      const isOn = value === selectedType;
      btn.classList.toggle("on", isOn);
      btn.setAttribute("aria-pressed", isOn ? "true" : "false");
    });
  }

  function buildDrugTypeLabel(drugType) {
    if (drugType === "pack") return "一包化";
    if (drugType === "powder") return "粉薬";
    if (drugType === "mixedOintment") return "混合軟膏";
    if (drugType === "mixedSyrup") return "混合シロップ";
    return "";
  }

  function buildDrugTypeDisplayName(drugState) {
    const type = (drugState?.drugType || "").trim();
    const label = buildDrugTypeLabel(type);
    if (!label) return "";

    if (type !== "pack" && type !== "powder") return label;

    const usage = (drugState?.drugUsage || "").trim();
    return usage ? `${label}（${usage}）` : label;
  }

  function buildDrugDisplayName(drugState) {
    const drugTypeDisplayName = buildDrugTypeDisplayName(drugState);
    if (drugTypeDisplayName) return drugTypeDisplayName;
    const drug = (drugState.drug || "").trim();
    return drug || "";
  }

  function buildDrugSummaryDisplayName(drugState) {
    const drug = (drugState.drug || "").trim();
    const drugTypeDisplayName = buildDrugTypeDisplayName(drugState);
    if (drug && drugTypeDisplayName) return `${drug}\u3000${drugTypeDisplayName}`;
    if (drugTypeDisplayName) return drugTypeDisplayName;
    return drug || "";
  }

  function buildDrugQuestionPrefix(drugState) {
    const displayName = buildDrugDisplayName(drugState);
    if (displayName) return displayName;
    return "不足薬品";
  }

  function buildDrugNameOrFallback(drugState) {
    const drug = (drugState.drug || "").trim();
    return drug || "不足薬品";
  }

  function buildDrugNameQuestionText() {
    if (drugs.length >= 2) return `不足薬品${activeDrugIndex + 1}個目の薬品名は？`;
    return "不足した薬品名は？";
  }

  function updateDrugNameQuestion() {
    if (!elDrugNameQuestion) return;
    elDrugNameQuestion.textContent = buildDrugNameQuestionText();
  }

  function updateDrugLinkedQuestions(drugState) {
    const shortagePrefix = buildDrugQuestionPrefix(drugState);
    const supplyPrefix = buildDrugNameOrFallback(drugState);
    if (elShortageQuestion) elShortageQuestion.textContent = `${shortagePrefix}をお渡しできる数は？`;
    if (elArrivalQuestion) elArrivalQuestion.textContent = `${supplyPrefix}の入荷予定日時は？`;
    if (elDestinationQuestion) elDestinationQuestion.textContent = `${supplyPrefix}の入荷先は？`;
  }

  function updateDrugUsageInput(drugState) {
    const label = buildDrugTypeLabel(drugState.drugType || "");
    const visible = drugState.drugType === "pack" || drugState.drugType === "powder";
    if (elDrugUsageWrap) elDrugUsageWrap.hidden = !visible;
    if (elDrugUsageQuestion) {
      elDrugUsageQuestion.textContent = visible
        ? `不足で渡す${label}の用法は？`
        : "不足で渡す薬の用法は？";
    }
    if (!visible) {
      drugState.drugUsage = "";
      if (elDrugUsage) elDrugUsage.value = "";
    }
  }

  function tomorrowAmLabelForSummary() {
    const today = new Date();
    let target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (today.getDay() === 5) target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3);
    if (today.getDay() === 6) target = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2);
    const dows = ["日", "月", "火", "水", "木", "金", "土"];
    return `${target.getMonth() + 1}/${target.getDate()}(${dows[target.getDay()]})AM`;
  }

  function buildUnitLabel(drugState) {
    const base = (drugState.shortageUnit || DEFAULT_SHORTAGE_UNIT).trim();
    if (base === "その他") return (drugState.shortageUnitOther || "").trim();
    return base;
  }

  function buildShortageSummary(drugState) {
    const count = (drugState.shortageCount || "").trim();
    const days = (drugState.shortageDays || "").trim();
    const unit = buildUnitLabel(drugState);
    if (!count && !days) return "";
    const left = count && unit ? `${count}${unit}` : count;
    const right = days && unit ? `${days}${unit}` : days;
    if (left && right) {
      const handoverCount = parseCount(count);
      const totalCount = parseCount(days);
      if (handoverCount !== null && totalCount !== null) {
        const shortageCount = totalCount - handoverCount;
        const shortage = unit ? `${shortageCount}${unit}` : `${shortageCount}`;
        return `${left} / 全体数${right} （不足数${shortage}）`;
      }
      return `${left} / 全体数${right}`;
    }
    return left || right;
  }

  function isShortageSummaryComplete(drugState) {
    const count = (drugState.shortageCount || "").trim();
    const days = (drugState.shortageDays || "").trim();
    if (!count || !days) return false;

    const unit = (drugState.shortageUnit || DEFAULT_SHORTAGE_UNIT).trim();
    if (unit === "その他" && !(drugState.shortageUnitOther || "").trim()) return false;

    return true;
  }

  function buildArriveSummary(drugState) {
    const val = drugState.arrive || DEFAULT_ARRIVE;
    if (val === "arriveUndecided") return "未定";
    if (val === "arriveTodayPm") return "本日PM";
    if (val === "arriveTomorrowAm") return tomorrowAmLabelForSummary();
    if (val === "arriveOther") return (drugState.arriveOtherText || "").trim();
    return "";
  }

  function buildDestSummary(drugState) {
    const val = drugState.dest || DEFAULT_DEST;
    if (val === "destUnknown") return "不明";
    if (val === "destMediceo") return "メディセオ";
    if (val === "destSuzuken") return "スズケン";
    if (val === "destVital") return "バイタル";
    if (val === "destAlfresa") return "アルフレッサ";
    if (val === "destSmall") {
      const small = (drugState.destSmallText || "").trim();
      return small ? `小分け（${small}）` : "小分け";
    }
    if (val === "destOther") {
      const other = (drugState.destOtherText || "").trim();
      return other;
    }
    return "";
  }

  function buildNotesSummary(notes) {
    return (notes || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .replace(/\s*\n\s*/g, " ")
      .trim();
  }

  function setSummary(el, value, options) {
    if (!el) return;
    const text = (value || "").trim();
    const summaryRow = el.closest(".qa-summary");
    const isComplete = options && typeof options.isComplete === "boolean"
      ? options.isComplete
      : !!text;
    const useEmptyTone = options && options.useEmptyTone === true;
    const isRequired = options && options.isRequired === true;
    const isRequiredMissing = isRequired && !isComplete;
    if (!text) {
      el.textContent = "未入力";
      el.classList.add("empty");
      summaryRow?.classList.remove("is-complete");
    } else {
      el.textContent = text;
      if (useEmptyTone) {
        el.classList.add("empty");
      } else {
        el.classList.remove("empty");
      }
      if (isComplete) {
        summaryRow?.classList.add("is-complete");
      } else {
        summaryRow?.classList.remove("is-complete");
      }
    }
    if (isRequiredMissing) {
      summaryRow?.classList.add("is-required-missing");
    } else {
      summaryRow?.classList.remove("is-required-missing");
    }
  }

  function updateDynamicInputs() {
    const drugState = currentDrug();
    if (!drugState) return;

    updateDrugUsageInput(drugState);

    const isUnitOther = (drugState.shortageUnit || "") === "その他";
    if (elUnitOtherWrap) elUnitOtherWrap.hidden = !isUnitOther;
    if (!isUnitOther) {
      drugState.shortageUnitOther = "";
      if (elShortageUnitOther) elShortageUnitOther.value = "";
    }

    const arrive = drugState.arrive || DEFAULT_ARRIVE;
    if (elArriveOtherText) {
      elArriveOtherText.hidden = arrive !== "arriveOther";
      if (arrive !== "arriveOther") {
        drugState.arriveOtherText = "";
        elArriveOtherText.value = "";
      }
    }

    const dest = drugState.dest || DEFAULT_DEST;
    if (elDestSmallText) {
      elDestSmallText.hidden = dest !== "destSmall";
      if (dest !== "destSmall") {
        drugState.destSmallText = "";
        elDestSmallText.value = "";
      }
    }
    if (elDestOtherText) {
      elDestOtherText.hidden = dest !== "destOther";
      if (dest !== "destOther") {
        drugState.destOtherText = "";
        elDestOtherText.value = "";
      }
    }
  }

  function updateSummariesAndState() {
    updateDrugNameQuestion();

    const drugState = currentDrug();
    if (drugState) {
      updateDrugLinkedQuestions(drugState);
      setSummary(elSummaryDrug, buildDrugSummaryDisplayName(drugState), {
        isComplete: !!(drugState.drug || "").trim(),
        isRequired: true
      });
      setSummary(elSummaryShortage, buildShortageSummary(drugState), {
        isComplete: isShortageSummaryComplete(drugState),
        isRequired: true
      });
      setSummary(elSummaryArrive, buildArriveSummary(drugState), {
        isComplete: (drugState.arrive || DEFAULT_ARRIVE) !== "arriveUndecided",
        useEmptyTone: (drugState.arrive || DEFAULT_ARRIVE) === "arriveUndecided"
      });
      setSummary(elSummaryDest, buildDestSummary(drugState), {
        isComplete: (drugState.dest || DEFAULT_DEST) !== "destUnknown",
        useEmptyTone: (drugState.dest || DEFAULT_DEST) === "destUnknown"
      });
      setSummary(elSummaryNotes, buildNotesSummary(drugState.notes || ""));
    }

    setSummary(elSummaryPatient, (elPatient?.value || "").trim(), {
      isRequired: true
    });

    const printable = canPrint();
    if (elBtnPrint) elBtnPrint.disabled = isBusy || !printable;
    if (elPreviewPrint) elPreviewPrint.disabled = isBusy || !printable;
    if (elWarn && printable) elWarn.hidden = true;
    if (printable || isBusy) {
      hidePrintMissingTip();
      hidePreviewPrintMissingTip();
    }
    if (!printable || isBusy) {
      hidePrintReadyTip();
      hideDrugAddTip();
    }
  }

  function loadCurrentDrugIntoInputs() {
    const drugState = currentDrug();
    if (!drugState) return;

    if (elDrug) elDrug.value = drugState.drug || "";
    if (elDrugUsage) elDrugUsage.value = drugState.drugUsage || "";
    if (elShortageCount) elShortageCount.value = drugState.shortageCount || "";
    if (elShortageDays) elShortageDays.value = drugState.shortageDays || "";
    if (elShortageUnit) elShortageUnit.value = drugState.shortageUnit || DEFAULT_SHORTAGE_UNIT;
    if (elShortageUnitOther) elShortageUnitOther.value = drugState.shortageUnitOther || "";
    if (elArriveOtherText) elArriveOtherText.value = drugState.arriveOtherText || "";
    if (elDestSmallText) elDestSmallText.value = drugState.destSmallText || "";
    if (elDestOtherText) elDestOtherText.value = drugState.destOtherText || "";
    if (elNotes) {
      const limitedNotes = limitNotesLines(drugState.notes || "");
      elNotes.value = limitedNotes;
      if (drugState.notes !== limitedNotes) drugState.notes = limitedNotes;
    }

    setRadioValue("arrive", drugState.arrive, DEFAULT_ARRIVE);
    setRadioValue("dest", drugState.dest, DEFAULT_DEST);
    setDrugTypeButtons(drugState.drugType);

    updateDynamicInputs();
    updateSummariesAndState();
  }

  function syncDrugFromInputs() {
    const drugState = currentDrug();
    if (!drugState) return;

    drugState.drug = elDrug?.value || "";
    drugState.drugUsage = elDrugUsage?.value || "";
    drugState.shortageCount = elShortageCount?.value || "";
    drugState.shortageDays = elShortageDays?.value || "";
    drugState.shortageUnit = elShortageUnit?.value || DEFAULT_SHORTAGE_UNIT;
    drugState.shortageUnitOther = elShortageUnitOther?.value || "";
    drugState.arrive = selectedValue("arrive") || DEFAULT_ARRIVE;
    drugState.arriveOtherText = elArriveOtherText?.value || "";
    drugState.dest = selectedValue("dest") || DEFAULT_DEST;
    drugState.destSmallText = elDestSmallText?.value || "";
    drugState.destOtherText = elDestOtherText?.value || "";
    const limitedNotes = limitNotesLines(elNotes?.value || "");
    if (elNotes && elNotes.value !== limitedNotes) elNotes.value = limitedNotes;
    drugState.notes = limitedNotes;
  }

  function focusCurrentStepInput() {
    const panel = items[activeStep]?.querySelector(".qa-panel");
    const target = panel?.querySelector("input,select,textarea");
    if (target instanceof HTMLElement) target.focus();
  }

  function selectDrug(index, focusInput) {
    syncDrugFromInputs();

    const nextIndex = Math.max(0, Math.min(drugs.length - 1, index));
    if (nextIndex === activeDrugIndex && !focusInput) return;

    activeDrugIndex = nextIndex;
    renderDrugTabs();
    loadCurrentDrugIntoInputs();

    if (focusInput) focusCurrentStepInput();
  }

  function addDrug(focusInput) {
    if (drugs.length >= MAX_DRUG_TABS) return false;
    const shouldFocusInput = focusInput !== false;
    syncDrugFromInputs();
    drugs.push(createEmptyDrug());
    activeDrugIndex = drugs.length - 1;
    renderDrugTabs();
    loadCurrentDrugIntoInputs();
    if (shouldFocusInput) {
      openStep(1, false, false);
      if (elDrug instanceof HTMLInputElement) {
        elDrug.focus();
        elDrug.select();
      }
    }
    return true;
  }

  function removeDrug(index) {
    if (drugs.length <= 1) return;

    syncDrugFromInputs();
    drugs.splice(index, 1);

    if (activeDrugIndex >= drugs.length) {
      activeDrugIndex = drugs.length - 1;
    } else if (index < activeDrugIndex) {
      activeDrugIndex -= 1;
    }

    renderDrugTabs();
    loadCurrentDrugIntoInputs();
  }

  function renderDrugTabs() {
    if (!elDrugTabs) return;
    elDrugTabs.innerHTML = "";

    drugs.forEach((_, index) => {
      const wrap = document.createElement("div");
      wrap.className = "drug-tab-wrap";
      if (index === activeDrugIndex) wrap.classList.add("active");

      const tabButton = document.createElement("button");
      tabButton.type = "button";
      tabButton.className = "drug-tab-btn";
      tabButton.setAttribute("role", "tab");
      tabButton.setAttribute("aria-selected", index === activeDrugIndex ? "true" : "false");
      tabButton.setAttribute("data-select-drug", String(index));
      tabButton.textContent = `不足薬品${index + 1}`;

      const closeButton = document.createElement("button");
      closeButton.type = "button";
      closeButton.className = "drug-tab-close";
      closeButton.setAttribute("data-remove-drug", String(index));
      closeButton.setAttribute("aria-label", `不足薬品${index + 1}を削除`);
      closeButton.textContent = "×";
      closeButton.disabled = drugs.length <= 1;

      wrap.appendChild(tabButton);
      wrap.appendChild(closeButton);
      elDrugTabs.appendChild(wrap);
    });

    if (drugs.length < MAX_DRUG_TABS) {
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "drug-tab-add";
      addButton.setAttribute("data-add-drug", "1");
      addButton.setAttribute("aria-label", "不足薬品を追加");
      addButton.textContent = "＋";
      addButton.appendChild(createDrugAddTipBubbleElement());
      elDrugTabs.appendChild(addButton);
    }

  }

  function validateDrugForPrint(drugState, index) {
    const label = `不足薬品${index + 1}`;

    if (!(drugState.drug || "").trim()) return `${label}の薬品名を入力してください。`;
    if (!(drugState.shortageCount || "").trim()) return `${label}のお渡し数を入力してください。`;
    if (!(drugState.shortageDays || "").trim()) return `${label}の全体数を入力してください。`;

    const unit = (drugState.shortageUnit || DEFAULT_SHORTAGE_UNIT).trim();
    if (unit === "その他" && !(drugState.shortageUnitOther || "").trim()) {
      return `${label}の単位（その他の時）を入力してください。`;
    }

    const handoverCount = parseCount(drugState.shortageCount || "");
    const totalCount = parseCount(drugState.shortageDays || "");
    if (handoverCount === null) return `${label}のお渡し数は0以上の整数で入力してください。`;
    if (totalCount === null) return `${label}の全体数は0以上の整数で入力してください。`;
    if (handoverCount > totalCount) return `${label}のお渡し数は全体数以下で入力してください。`;

    return "";
  }

  function getPrintMissingFieldLabel() {
    syncDrugFromInputs();

    const patient = (elPatient?.value || "").trim();
    if (!patient) return "患者氏名";

    if (drugs.length === 0) return "不足薬品";

    for (let index = 0; index < drugs.length; index += 1) {
      const drugState = drugs[index];
      const prefix = `不足薬品${index + 1}`;
      if (!(drugState.drug || "").trim()) return `${prefix}の薬品名`;
      if (!(drugState.shortageCount || "").trim()) return `${prefix}のお渡し数`;
      if (!(drugState.shortageDays || "").trim()) return `${prefix}の全体数`;

      const unit = (drugState.shortageUnit || DEFAULT_SHORTAGE_UNIT).trim();
      if (unit === "その他" && !(drugState.shortageUnitOther || "").trim()) {
        return `${prefix}の単位`;
      }
    }

    return "";
  }

  function getPrintValidationError() {
    const patient = (elPatient?.value || "").trim();
    if (!patient) return "患者氏名を入力してください。";

    if (drugs.length === 0) return "不足薬品を1件以上入力してください。";

    for (let index = 0; index < drugs.length; index += 1) {
      const error = validateDrugForPrint(drugs[index], index);
      if (error) return error;
    }

    return "";
  }

  function canPrint() {
    syncDrugFromInputs();
    return !getPrintValidationError();
  }

  function collectPayload() {
    syncDrugFromInputs();

    return {
      patient: (elPatient?.value || "").trim(),
      printerName: (elPrinterName?.value || "").trim(),
      drugs: drugs.map((drug) => cloneDrug(drug))
    };
  }

  function requestPrint() {
    hidePrintReadyTip();
    hidePrintMissingTip();
    hidePreviewPrintMissingTip();
    hideDrugAddTip();
    const validationError = getPrintValidationError();
    if (validationError) {
      if (elWarn) {
        elWarn.textContent = validationError;
        elWarn.hidden = false;
      }
      return false;
    }

    if (elWarn) {
      elWarn.textContent = defaultMissingWarnText;
      elWarn.hidden = true;
    }

    setBusy(true);
    post({ cmd: "print", ...collectPayload() });
    return true;
  }

  function clearAll() {
    if (elPatient) elPatient.value = "";

    drugs = [createEmptyDrug()];
    activeDrugIndex = 0;

    renderDrugTabs();
    loadCurrentDrugIntoInputs();

    if (elWarn) {
      elWarn.textContent = defaultMissingWarnText;
      elWarn.hidden = true;
    }
    hidePrintReadyTip();
    hidePrintMissingTip();
    hidePreviewPrintMissingTip();
    hideDrugAddTip();

    openStep(0, true, false);
  }

  function applyDevDefaults() {
    if (devDefaultsApplied) return;
    devDefaultsApplied = true;

    if (elPatient) elPatient.value = "テスト太郎";

    drugs = [createEmptyDrug()];
    activeDrugIndex = 0;
    drugs[0].drug = "アムロジピンOD錠5mg「サワイ」";
    drugs[0].drugType = "pack";
    drugs[0].drugUsage = "朝、昼、寝る前";
    drugs[0].shortageCount = "7";
    drugs[0].shortageDays = "14";
    drugs[0].arrive = "arriveTomorrowAm";
    drugs[0].dest = "destMediceo";
    drugs[0].notes = "run_dev.bat 起動時のテスト用初期値";

    renderDrugTabs();
    loadCurrentDrugIntoInputs();
    openStep(0, true, false);
  }

  function openPreview(html) {
    if (elPreviewFrame) {
      teardownPreviewTracking();
      elPreviewFrame.onload = () => {
        setupPreviewTracking();
      };
      elPreviewFrame.srcdoc = html || "";
    }
    if (elPreviewModal) elPreviewModal.hidden = false;
    if (elPreviewPrint) elPreviewPrint.disabled = isBusy || !canPrint();
    updatePreviewPageIndicator();
  }

  function closePreview() {
    if (elPreviewModal) elPreviewModal.hidden = true;
    teardownPreviewTracking();
    setPreviewTitle(0, 0);
  }

  function openSettings() {
    if (elSettingsModal) elSettingsModal.hidden = false;
  }

  function closeSettings() {
    if (elSettingsModal) elSettingsModal.hidden = true;
  }

  document.querySelectorAll("[data-open-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.getAttribute("data-open-step"));
      if (!Number.isFinite(step)) return;

      const isOpen = items[step]?.classList.contains("open");
      if (isOpen) {
        closeStep(true);
        return;
      }

      openStep(step, true);
    });
  });

  document.querySelectorAll("[data-next-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.getAttribute("data-next-step"));
      if (!Number.isFinite(step)) return;

      const fromStep = Number(btn.closest(".qa-item")?.getAttribute("data-step"));
      const shouldShowPrintReadyTip = fromStep === 4 && step === 5 && !isBusy && canPrint();

      openStep(step, true);

      if (shouldShowPrintReadyTip && elBtnPrint && !elBtnPrint.disabled) {
        showPrintReadyTip();
        showDrugAddTip();
      }
    });
  });

  document.querySelectorAll("[data-prev-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.getAttribute("data-prev-step"));
      if (!Number.isFinite(step)) return;
      openStep(step, true);
    });
  });

  if (elDrugTabs) {
    elDrugTabs.addEventListener("click", (e) => {
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;

      const removeBtn = target.closest("[data-remove-drug]");
      if (removeBtn instanceof HTMLElement) {
        const index = Number(removeBtn.getAttribute("data-remove-drug"));
        if (Number.isFinite(index)) removeDrug(index);
        return;
      }

      const selectBtn = target.closest("[data-select-drug]");
      if (selectBtn instanceof HTMLElement) {
        const index = Number(selectBtn.getAttribute("data-select-drug"));
        if (Number.isFinite(index)) selectDrug(index, true);
        return;
      }

      const addBtn = target.closest("[data-add-drug]");
      if (addBtn instanceof HTMLElement) addDrug();
    });
  }

  if (elPatient) {
    elPatient.addEventListener("input", updateSummariesAndState);
  }

  if (elDrug) {
    elDrug.addEventListener("input", () => {
      syncDrugFromInputs();
      updateSummariesAndState();
    });
  }

  [elShortageCount, elShortageDays].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      digitsOnly(el);
      syncDrugFromInputs();
      updateSummariesAndState();
    });
    el.addEventListener("wheel", (e) => {
      e.preventDefault();
      adjustNumericByWheel(el, e.deltaY);
      syncDrugFromInputs();
      updateSummariesAndState();
    }, { passive: false });
  });

  [elShortageUnitOther, elDrugUsage, elArriveOtherText, elDestSmallText, elDestOtherText].forEach((el) => {
    if (!el) return;
    el.addEventListener("input", () => {
      syncDrugFromInputs();
      updateSummariesAndState();
    });
  });

  if (elNotes) {
    elNotes.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (e.isComposing) return;
      const currentValue = normalizeLineBreaks(elNotes.value || "");
      const lines = currentValue.split("\n");
      if (lines.length >= MAX_NOTES_LINES) {
        e.preventDefault();
      }
    });

    elNotes.addEventListener("input", () => {
      const limitedNotes = limitNotesLines(elNotes.value || "");
      if (elNotes.value !== limitedNotes) elNotes.value = limitedNotes;
      syncDrugFromInputs();
      updateSummariesAndState();
    });
  }

  drugTypeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextType = btn.getAttribute("data-drug-type") || "";
      const drugState = currentDrug();
      if (!drugState) return;

      const step1Item = document.querySelector(".qa-item[data-step='1']");
      const shouldAnimate = step1Item instanceof HTMLElement && step1Item.classList.contains("open");

      animateHeightChange([step1Item], () => {
        drugState.drugType = drugState.drugType === nextType ? "" : nextType;
        if (drugState.drugType === "pack" || drugState.drugType === "powder") {
          drugState.shortageUnit = DEFAULT_SHORTAGE_UNIT;
          drugState.shortageUnitOther = "";
          if (elShortageUnit) elShortageUnit.value = DEFAULT_SHORTAGE_UNIT;
          if (elShortageUnitOther) elShortageUnitOther.value = "";
        } else if (drugState.drugType === "mixedOintment") {
          drugState.shortageUnit = MIXED_OINTMENT_UNIT;
          drugState.shortageUnitOther = "";
          if (elShortageUnit) elShortageUnit.value = MIXED_OINTMENT_UNIT;
          if (elShortageUnitOther) elShortageUnitOther.value = "";
        } else if (drugState.drugType === "mixedSyrup") {
          drugState.shortageUnit = MIXED_SYRUP_UNIT;
          drugState.shortageUnitOther = "";
          if (elShortageUnit) elShortageUnit.value = MIXED_SYRUP_UNIT;
          if (elShortageUnitOther) elShortageUnitOther.value = "";
        }
        setDrugTypeButtons(drugState.drugType);
        updateDynamicInputs();
        updateSummariesAndState();
      }, shouldAnimate);
    });
  });

  if (elShortageUnit) {
    elShortageUnit.addEventListener("change", () => {
      syncDrugFromInputs();
      updateDynamicInputs();
      updateSummariesAndState();
      if (elShortageUnit.value === "その他" && elShortageUnitOther) elShortageUnitOther.focus();
    });
  }

  document.querySelectorAll("input[name='arrive']").forEach((el) => {
    el.addEventListener("change", () => {
      const step3Item = document.querySelector(".qa-item[data-step='3']");
      const shouldAnimate = step3Item instanceof HTMLElement && step3Item.classList.contains("open");

      animateHeightChange([step3Item], () => {
        syncDrugFromInputs();
        updateDynamicInputs();
        updateSummariesAndState();
      }, shouldAnimate);

      if (selectedValue("arrive") === "arriveOther" && elArriveOtherText) elArriveOtherText.focus();
    });
  });

  document.querySelectorAll("input[name='dest']").forEach((el) => {
    el.addEventListener("change", () => {
      const step4Item = document.querySelector(".qa-item[data-step='4']");
      const shouldAnimate = step4Item instanceof HTMLElement && step4Item.classList.contains("open");

      animateHeightChange([step4Item], () => {
        syncDrugFromInputs();
        updateDynamicInputs();
        updateSummariesAndState();
      }, shouldAnimate);

      const selected = selectedValue("dest");
      if (selected === "destSmall" && elDestSmallText) elDestSmallText.focus();
      if (selected === "destOther" && elDestOtherText) elDestOtherText.focus();
    });
  });

  document.addEventListener("keydown", (e) => {
    if (isBusy) {
      e.preventDefault();
      return;
    }
    if (e.key === "Escape") {
      if (elSettingsModal && !elSettingsModal.hidden) {
        closeSettings();
        return;
      }
      if (elPreviewModal && !elPreviewModal.hidden) {
        closePreview();
      }
    }
  });

  document.addEventListener("click", (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (!target.closest("button, .qa-item")) return;
    hidePrintReadyTip();
    hidePrintMissingTip();
    hidePreviewPrintMissingTip();
    hideDrugAddTip();
  }, true);

  window.addEventListener("resize", requestResponsiveScale);

  if (elBtnSettings) {
    elBtnSettings.addEventListener("click", openSettings);
  }

  if (elBtnSettingsClose) {
    elBtnSettingsClose.addEventListener("click", closeSettings);
  }

  if (elSettingsModal) {
    elSettingsModal.addEventListener("click", (e) => {
      if (e.target === elSettingsModal) closeSettings();
    });
  }

  if (elPrinterName) {
    elPrinterName.addEventListener("change", () => {
      postSettingsToHost();
    });
  }

  if (elStartupWindowScale) {
    elStartupWindowScale.addEventListener("input", () => {
      startupWindowScalePercent = normalizePercent(
        elStartupWindowScale.value,
        Number.parseInt(elStartupWindowScale.min || "", 10) || MIN_STARTUP_WINDOW_SCALE_PERCENT,
        Number.parseInt(elStartupWindowScale.max || "", 10) || MAX_STARTUP_WINDOW_SCALE_PERCENT,
        startupWindowScalePercent
      );
      updateSettingsValueLabels();
    });
    elStartupWindowScale.addEventListener("change", () => {
      postSettingsToHost();
    });
  }

  if (elUiScale) {
    elUiScale.addEventListener("input", () => {
      userUiScalePercent = normalizePercent(
        elUiScale.value,
        Number.parseInt(elUiScale.min || "", 10) || MIN_UI_SCALE_PERCENT,
        Number.parseInt(elUiScale.max || "", 10) || MAX_UI_SCALE_PERCENT,
        userUiScalePercent
      );
      updateSettingsValueLabels();
      requestResponsiveScale();
    });
    elUiScale.addEventListener("change", () => {
      postSettingsToHost();
    });
  }

  if (elPage1YellowFrameThickness) {
    elPage1YellowFrameThickness.addEventListener("input", () => {
      page1YellowFrameThicknessTenthsMm = normalizePercent(
        elPage1YellowFrameThickness.value,
        Number.parseInt(elPage1YellowFrameThickness.min || "", 10) || MIN_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM,
        Number.parseInt(elPage1YellowFrameThickness.max || "", 10) || MAX_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM,
        page1YellowFrameThicknessTenthsMm
      );
      updateSettingsValueLabels();
    });
    elPage1YellowFrameThickness.addEventListener("change", () => {
      postSettingsToHost();
    });
  }

  if (elBtnPreview) {
    elBtnPreview.addEventListener("click", () => {
      if (elWarn) elWarn.hidden = true;
      post({ cmd: "preview", ...collectPayload() });
    });
  }

  if (elBtnPrintWrap) {
    elBtnPrintWrap.addEventListener("mouseenter", () => {
      showPrintMissingTip();
    });
    elBtnPrintWrap.addEventListener("mouseleave", () => {
      hidePrintMissingTip();
    });
  }

  if (elPreviewPrintWrap) {
    elPreviewPrintWrap.addEventListener("mouseenter", () => {
      showPreviewPrintMissingTip();
    });
    elPreviewPrintWrap.addEventListener("mouseleave", () => {
      hidePreviewPrintMissingTip();
    });
  }

  if (elBtnPrint) {
    elBtnPrint.addEventListener("click", () => {
      requestPrint();
    });
  }

  if (elBtnClear) {
    elBtnClear.addEventListener("click", clearAll);
  }

  if (elPreviewPrint) {
    elPreviewPrint.addEventListener("click", () => {
      requestPrint();
    });
  }

  if (elPreviewClose) {
    elPreviewClose.addEventListener("click", closePreview);
  }

  if (elPreviewModal) {
    elPreviewModal.addEventListener("click", (e) => {
      if (e.target === elPreviewModal) closePreview();
    });
  }

  if (window.chrome?.webview) {
    window.chrome.webview.addEventListener("message", (ev) => {
      const msg = ev.data || {};
      if (msg.cmd === "state") {
        applySettingsState(msg.settings || null);
        setPrinterOptions(msg.printers, msg.defaultPrinter || "", msg.preferredPrinter || "");
        if (msg.devMode === true) applyDevDefaults();
      } else if (msg.cmd === "showPreview") {
        openPreview(msg.html || "");
      } else if (msg.cmd === "toast") {
        setBusy(false);
        showToast(msg.message || "");
      } else if (msg.cmd === "error") {
        setBusy(false);
        showError(msg.message || "エラーが発生しました。");
      } else if (msg.cmd === "clearAll") {
        closePreview();
        closeSettings();
        clearAll();
      }
    });
    post({ cmd: "ready" });
  } else {
    showError("WebView2 が利用できません。");
  }

  applySettingsState({
    startupWindowScalePercent: DEFAULT_STARTUP_WINDOW_SCALE_PERCENT,
    startupWindowScaleMin: MIN_STARTUP_WINDOW_SCALE_PERCENT,
    startupWindowScaleMax: MAX_STARTUP_WINDOW_SCALE_PERCENT,
    uiScalePercent: DEFAULT_UI_SCALE_PERCENT,
    uiScaleMin: MIN_UI_SCALE_PERCENT,
    uiScaleMax: MAX_UI_SCALE_PERCENT,
    page1YellowFrameThicknessTenthsMm: DEFAULT_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM,
    page1YellowFrameThicknessMinTenthsMm: MIN_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM,
    page1YellowFrameThicknessMaxTenthsMm: MAX_PAGE1_YELLOW_FRAME_THICKNESS_TENTHS_MM
  });
  renderDrugTabs();
  loadCurrentDrugIntoInputs();
  openStep(0, true, false);
  requestResponsiveScale();
})();
