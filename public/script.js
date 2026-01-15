/**
 * script.js – Main UI controller for the Format Converter app
 *
 * This file handles all UI interactions, UI behavior, and user actions
 * related to transforming data between formats.
 *
 * It handles:
 *   - Tab switching between Transform / History / Help
 *   - Switching between dropdown and manual mode for format settings
 *   - Invoking DataTransformer.convert() with user input
 *   - Displaying output and handling errors
 *   - Saving successful transformations to server-side history
 *   - Loading and displaying previous conversions
 *   - File upload and autofill for input
 *   - Toast notifications and logout handling
 *
 * Key components:
 *   initApp()                 -> sets up event listeners and renders history
 *   transformBtn click        -> triggers conversion and handles results
 *   renderHistory()           -> fetches and displays saved conversions
 *   showToast()               -> displays feedback messages
 *   Manual Save button        -> saves current conversion explicitly
 *   File input logic          -> handles loading from uploaded files
 */

window.refreshStatsIfVisible = window.refreshStatsIfVisible || function () {};
if (typeof refreshStatsIfVisible === "undefined") {
  var refreshStatsIfVisible = window.refreshStatsIfVisible;
}

console.log("SCRIPT LOADED: " + new Date().toISOString());

// Sample input & default settings
const SAMPLE_JSON = `{
  "name": "John Doe",
  "age": 30,
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}`;

// This way in manual mode the user will see engine=local and can switch to engine=rpc without new buttons
const DEFAULT_SETTINGS_TEXT = `inputformat=json
outputformat=yaml
engine=local
savetohistory=false
align=true
case=none`;

function getSettingValue(settingsText, key) {
  const lines = (settingsText || "").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const k = trimmed.slice(0, idx).trim();
    const v = trimmed.slice(idx + 1).trim();
    if (k === key) return v;
  }
  return null;
}

function stripEngineSetting(settingsText) {
  return (settingsText || "")
    .split("\n")
    .filter((line) => !/^\s*engine\s*=/i.test(line))
    .join("\n");
}

async function convertViaRpc(inputString, settingsStringWithoutEngine) {
  const data = await api("convert_rpc.php", {
    method: "POST",
    body: JSON.stringify({
      inputString,
      settingsString: settingsStringWithoutEngine,
    }),
  });

  if (!data.ok) throw new Error(data.error || "RPC convert failed");
  return data.output;
}

async function validateViaJava(format, text) {
  const data = await api("validate_java.php", {
    method: "POST",
    body: JSON.stringify({ format, text }),
  });

  return data;
}

function detectFormatForValidation(
  input,
  manualSettings,
  formatMode,
  inputFormatSelect
) {
  if (formatMode === "dropdown") {
    return (inputFormatSelect.value || "").trim().toLowerCase();
  }

  // manual mode
  const inputFmt = (getSettingValue(manualSettings, "inputformat") || "")
    .trim()
    .toLowerCase();

  if (inputFmt && inputFmt !== "auto") return inputFmt;

  try {
    if (
      window.DataTransformer &&
      typeof window.DataTransformer.detectFormat === "function"
    ) {
      const detected = window.DataTransformer.detectFormat(input);
      return (detected || "").toLowerCase();
    }
  } catch (_) {}

  // fallback
  return "";
}

// Input/output fields
const inputField = document.getElementById("input-field");
const outputField = document.getElementById("output-field");

async function fetchStats() {
  const data = await api("stats_dotnet.php");
  return data;
}

function refreshStatsIfVisible() {
  const statsTab = document.getElementById("stats-tab");
  if (statsTab && statsTab.classList.contains("active") && window.renderStats) {
    window.renderStats();
  }
}

window.refreshStatsIfVisible = refreshStatsIfVisible;

// Main app init function
window.initApp = function initApp() {
  if (window._appInitialized) return;
  window._appInitialized = true;

  // Tab switching logic
  const tabs = document.querySelectorAll(".tab");
  const tabContents = document.querySelectorAll(".tab-content");

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      tab.classList.add("active");
      tabContents[index].classList.add("active");

      const activeId = tabContents[index]?.id;
      if (
        activeId === "stats-tab" &&
        typeof window.renderStats === "function"
      ) {
        window.renderStats();
      }
    });
  });

  // Format mode (manual vs dropdown)
  const formatModeRadios = document.querySelectorAll(
    'input[name="format-mode"]'
  );
  const manualFormatContainer = document.getElementById(
    "manual-format-container"
  );
  const manualFormatField = document.getElementById("manual-format-field");
  const inputFormatSelect = document.getElementById("input-format-select");
  const outputFormatSelect = document.getElementById("output-format-select");
  const dropdownFormatsContainer = document.getElementById(
    "dropdown-formats-container"
  );

  // Toggle format mode display
  formatModeRadios.forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.value === "manual") {
        if (!manualFormatField.value.trim()) {
          manualFormatField.value = DEFAULT_SETTINGS_TEXT;
        }

        manualFormatContainer.style.display = "block";
        dropdownFormatsContainer.style.display = "none";
        document.getElementById("save-history-btn").style.display = "none";
      } else {
        manualFormatContainer.style.display = "none";
        dropdownFormatsContainer.style.display = "block";
        document.getElementById("save-history-btn").style.display =
          "inline-flex";
      }
    });
  });

  // Handle transform button click
  const transformBtn = document.getElementById("transform-btn");
  const historyContainer = document.getElementById("history-container");
  const validateBtn = document.getElementById("validate-btn");
  const statsContainer = document.getElementById("stats-container");

  transformBtn.addEventListener("click", async () => {
    const input = inputField.value;
    const formatMode = document.querySelector(
      'input[name="format-mode"]:checked'
    ).value;

    // Build settings string
    let settingsString = "";
    if (formatMode === "manual") {
      settingsString = manualFormatField.value.trim();
    } else {
      const inputFmt = inputFormatSelect.value.toLowerCase();
      const outputFmt = outputFormatSelect.value.toLowerCase();
      settingsString = `inputformat=${inputFmt}\noutputformat=${outputFmt}`;
    }

    // Show loading UI
    transformBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Обработва се...';
    transformBtn.disabled = true;

    // Try to transform (local or RPC)
    let result, meta;
    try {
      const engine = (
        getSettingValue(settingsString, "engine") || "local"
      ).toLowerCase();
      const transformerSettings = stripEngineSetting(settingsString); // <- ВАЖНО

      if (engine === "rpc") {
        result = await convertViaRpc(input, transformerSettings);

        // meta е нужно за save/history – извличаме го от settings
        const inMatch = transformerSettings.match(/inputformat=(\w+)/i);
        const outMatch = transformerSettings.match(/outputformat=(\w+)/i);
        meta = {
          inFmt: inMatch ? inMatch[1].toLowerCase() : "auto",
          outFmt: outMatch ? outMatch[1].toLowerCase() : "unknown",
        };
      } else {
        ({ result, meta } = await DataTransformer.convert(
          input,
          transformerSettings
        ));
      }

      outputField.value = result;

      window.refreshStatsIfVisible?.();
    } catch (err) {
      outputField.value = "⚠️ Грешка при трансформация:\n" + err.message;
    } finally {
      transformBtn.innerHTML = '<i class="fas fa-bolt"></i> Трансформирай';
      transformBtn.disabled = false;
    }

    // Save to server history if requested
    if (settingsString.includes("savetohistory=true")) {
      await api("save_conversion.php", {
        method: "POST",
        body: JSON.stringify({
          input_format: meta.inFmt,
          output_format: meta.outFmt,
          settings: settingsString,
          input,
          output: result,
        }),
      })
        .then(() => {
          showToast("Успешно запазено в историята!");
          renderHistory();
        })
        .catch(() => {
          showToast("Неуспешен запис в историята.", "error");
        });
    }
  });

  // Handle validate button click (Java REST validator)
  validateBtn.addEventListener("click", async () => {
    const input = inputField.value || "";
    const formatMode = document.querySelector(
      'input[name="format-mode"]:checked'
    ).value;

    const manualSettings =
      formatMode === "manual" ? manualFormatField.value.trim() : "";

    if (!input.trim()) {
      showToast("Полето „Вход“ е празно.", "error");
      return;
    }

    const fmt = detectFormatForValidation(
      input,
      manualSettings,
      formatMode,
      inputFormatSelect
    );

    if (!fmt) {
      showToast(
        "Не мога да определя входния формат за валидиране. Избери inputformat или dropdown.",
        "error"
      );
      return;
    }

    const oldHtml = validateBtn.innerHTML;
    validateBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin"></i> Валидиране...';
    validateBtn.disabled = true;

    try {
      const res = await validateViaJava(fmt, input);

      if (res.ok) {
        showToast(`Валидацията беше успешна (${fmt.toUpperCase()})`, "success");
      } else {
        const errors = Array.isArray(res.errors)
          ? res.errors
          : ["Невалиден вход."];
        showToast(
          `Неуспешна валидация (${fmt.toUpperCase()}):<br>${errors
            .map((e) => `• ${e}`)
            .join("<br>")}`,
          "error"
        );
      }
    } catch (err) {
      showToast(
        "Грешка при връзка към Java валидатора (localhost:8082).",
        "error"
      );
      console.error(err);
    } finally {
      validateBtn.innerHTML = oldHtml;
      validateBtn.disabled = false;
    }
  });

  // Fetch and show saved transformations
  function renderHistory() {
    historyContainer.innerHTML = '<div class="empty-state">Зареждане…</div>';

    api("history.php")
      .then((history) => {
        if (history.length === 0) {
          historyContainer.innerHTML =
            '<div class="empty-state">Няма записана история</div>';
          return;
        }

        historyContainer.innerHTML = "";

        history.forEach((entry, index) => {
          const wrapper = document.createElement("div");
          wrapper.className = "history-item";

          const ts = new Date(entry.created_at).toLocaleString();

          // Populate saved entry
          wrapper.innerHTML = `
          <div class="history-item-header">
            <div class="history-item-title">${getFormatLabel(
              entry.settings
            )}</div>
            <div class="history-item-time">${ts}</div>
          </div>
          <div class="history-item-preview">${truncate(entry.input_text)}</div>
          <button class="btn btn-outline" data-index="${index}">Зареди</button>
        `;

          // Load entry into input
          wrapper.querySelector("button").addEventListener("click", () => {
            inputField.value = entry.input_text;
            manualFormatField.value = entry.settings;
            formatModeRadios.forEach((r) => {
              if (r.value === "manual") r.checked = true;
            });
            manualFormatContainer.style.display = "block";
            dropdownFormatsContainer.style.display = "none";

            outputField.value = entry.output_text;
            tabs[0].click(); // Switch to transform tab
          });

          historyContainer.appendChild(wrapper);
        });
      })
      .catch(() => {
        historyContainer.innerHTML =
          '<div class="empty-state">Грешка при зареждане на историята</div>';
      });
  }

  function renderStats() {
    if (!statsContainer) return;

    statsContainer.innerHTML = '<div class="empty-state">Зареждане…</div>';

    fetchStats()
      .then((data) => {
        if (!data || data.ok === false) {
          const msg = data?.error || "Грешка при зареждане на статистиката.";
          statsContainer.innerHTML = `<div class="empty-state">${msg}</div>`;
          return;
        }

        const total = data.total ?? 0;

        // .NET { key, count }
        const byInputArr = Array.isArray(data.byInput) ? data.byInput : [];
        const byOutputArr = Array.isArray(data.byOutput) ? data.byOutput : [];

        // .NET byPair: [{ input, output, count }]
        const byPairArr = Array.isArray(data.byPair) ? data.byPair : [];

        statsContainer.innerHTML = "";

        const makeCard = (title, rows) => {
          const card = document.createElement("div");
          card.className = "stats-card";

          const header = document.createElement("div");
          header.className = "stats-card-title";
          header.textContent = title;

          const body = document.createElement("div");
          body.className = "stats-rows";

          if (!rows.length) {
            body.innerHTML = `<div class="empty-state">Няма данни.</div>`;
          } else {
            body.innerHTML = rows
              .map(
                (r) => `
        <div class="stats-row">
          <span class="stats-key">${r.key}</span>
          <span class="stats-val">${r.val}</span>
        </div>`
              )
              .join("");
          }

          card.appendChild(header);
          card.appendChild(body);
          return card;
        };

        statsContainer.appendChild(
          makeCard("Общо трансформации", [{ key: "Общо", val: String(total) }])
        );

        const inputRows = byInputArr.map((r) => ({
          key: r.key,
          val: String(r.count),
        }));

        statsContainer.appendChild(makeCard("По входен формат", inputRows));

        const outputRows = byOutputArr.map((r) => ({
          key: r.key,
          val: String(r.count),
        }));

        statsContainer.appendChild(makeCard("По изходен формат", outputRows));

        if (byPairArr.length) {
          const pairRows = byPairArr.map((p) => ({
            key: `${p.input} → ${p.output}`,
            val: String(p.count),
          }));
          statsContainer.appendChild(
            makeCard("Най-чести трансформации", pairRows)
          );
        }
      })
      .catch((err) => {
        console.error(err);
        statsContainer.innerHTML =
          '<div class="empty-state">Грешка при връзка към статистиката (.NET).</div>';
      });
  }

  window.renderStats = renderStats;

  // Helper: shorten long preview strings
  function truncate(str) {
    return str.length > 80 ? str.substring(0, 77) + "..." : str;
  }

  // Helper: extract readable format info from settings
  function getFormatLabel(settings) {
    const inputMatch = settings.match(/inputformat=(\w+)/);
    const outputMatch = settings.match(/outputformat=(\w+)/);
    const from = inputMatch ? inputMatch[1] : "неизвестен";
    const to = outputMatch ? outputMatch[1] : "неизвестен";
    return `${from} → ${to}`;
  }

  // Logout logic
  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      try {
        await api("logout.php");
        historyContainer.innerHTML = "";
        showAuth(); // Show login modal again
      } catch (err) {
        showToast("Грешка при изход.", "error");
      }
    });
  }

  window.renderHistory = renderHistory;
  renderHistory();

  window.renderStats = renderStats;
};

// Show toast message (success or error)
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${
    type === "success" ? "fa-check-circle" : "fa-exclamation-triangle"
  }"></i> ${message}`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Save transformation to history manually
document
  .getElementById("save-history-btn")
  .addEventListener("click", async () => {
    // Get selected formats and input text
    const inputFormat = document
      .getElementById("input-format-select")
      .value.toLowerCase();
    const outputFormat = document
      .getElementById("output-format-select")
      .value.toLowerCase();
    const inputText = inputField.value.trim();

    // Abort if input is empty
    if (!inputText) {
      showToast("Полето „Вход“ е празно.", "error");
      return;
    }

    // Run conversion
    const settings = `
      inputformat=${inputFormat}
      outputformat=${outputFormat}
      savetohistory=true
    `.trim();

    let resultData, meta;
    try {
      const resultObj = await DataTransformer.convert(inputText, settings);
      resultData = resultObj.result;
      meta = resultObj.meta;
      outputField.value = resultData; // Display the result
    } catch (err) {
      showToast("Грешка при трансформацията: " + err.message, "error");
      return;
    }

    // Save to backend via API
    try {
      const response = await api("save_conversion.php", {
        method: "POST",
        body: JSON.stringify({
          input_format: meta.inFmt,
          output_format: meta.outFmt,
          settings,
          input: inputText,
          output: resultData,
        }),
      });

      showToast("Успешно запазено в историята!");
      // renderHistory(); // Refresh history panel
      // refreshStatsIfVisible();
      window.renderHistory?.();
      window.refreshStatsIfVisible?.();
    } catch (err) {
      showToast("Грешка при записа: " + err.message, "error");
    }
  });

// Handle file upload input
const fileUpload = document.getElementById("file-upload");
const fileInfo = document.querySelector(".file-info");
const removeFileBtn = document.getElementById("remove-file-btn");

fileUpload.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const allowedExtensions = [
    "json",
    "yaml",
    "yml",
    "xml",
    "csv",
    "emmet",
    "txt",
  ];
  const extension = file.name.split(".").pop().toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    showToast(`Неподдържан файлов формат: .${extension}`, "error");
    fileUpload.value = "";
    return;
  }

  try {
    const text = await file.text();
    inputField.value = text;
    fileInfo.style.display = "flex";
    document.getElementById(
      "file-name"
    ).textContent = `Качен файл: ${file.name}`;
    showToast(`Файлът „${file.name}“ беше зареден успешно.`);
  } catch (err) {
    showToast("Грешка при зареждане на файла.", "error");
  }
});

// Clear file input and reset UI when the 'remove file' button is clicked
removeFileBtn.addEventListener("click", () => {
  fileUpload.value = "";
  inputField.value = "";
  fileInfo.style.display = "none";
  document.getElementById("file-name").textContent = "";
});
