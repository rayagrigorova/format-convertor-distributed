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

// Sample input & default settings
const SAMPLE_JSON = `{
  "name": "John Doe",
  "age": 30,
  "address": {
    "street": "123 Main St",
    "city": "Anytown"
  }
}`;

const DEFAULT_SETTINGS_TEXT = `inputformat=json
outputformat=yaml
savetohistory=false
align=true
case=none`;

// Input/output fields
const inputField = document.getElementById("input-field");
const outputField = document.getElementById("output-field");

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

    // Try to transform
    let result, meta;
    try {
      ({ result, meta } = await DataTransformer.convert(input, settingsString));
      outputField.value = result;
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
      renderHistory(); // Refresh history panel
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
