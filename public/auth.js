/**
 * auth.js
 *
 * This script handles user authentication (login, registration, logout).
 * It manages showing/hiding the auth modal, submitting credentials to the backend,
 * updating the UI based on user state, and initializing the app on login.
 */

// Set the base API path depending on whether we are inside a /public/ folder
const API_ROOT = window.location.pathname.includes("/public/") ? ".." : ".";

// Universal API call helper using fetch with JSON and credentials
window.api = (url, opts = {}) =>
  fetch(`${API_ROOT}/api/${url}`, {
    credentials: "include", // send cookies (session)
    headers: { "Content-Type": "application/json" },
    ...opts, // allow passing method, body, etc.
  }).then(
    (r) =>
      r.ok
        ? r.json() // parse response JSON if successful
        : r
            .json()
            .catch(() => ({})) // fallback if parsing fails
            .then((e) => Promise.reject(e)) // reject with error object
  );

// DOM references for auth modal and its elements
const authModal = document.getElementById("auth-modal");
const authForm = document.getElementById("auth-form");
const authTitle = document.getElementById("auth-title");
const authHelp = document.getElementById("auth-help");
const authSwitchLink = document.getElementById("auth-switch-link");
const authErr = document.getElementById("auth-error");

let mode = "login"; // Current mode: "login" or "register"

// Updates the UI to show current user's email (or clears it if not logged in)
function setLoggedUser(email = "") {
  const lbl = document.getElementById("current-user");
  lbl.textContent = email ? `Вписан като: ${email}` : "";
}

// Shows the authentication modal
function showAuth() {
  authModal.classList.remove("hidden");
}

// Hides the authentication modal
function hideAuth() {
  authModal.classList.add("hidden");
}

// Switches between login and registration modes and updates UI text accordingly
function setMode(m) {
  mode = m;
  authTitle.textContent = m === "login" ? "Вход" : "Регистрация";
  authHelp.textContent = m === "login" ? "Нямате акаунт?" : "Имате акаунт?";
  authSwitchLink.textContent = m === "login" ? "Регистрация" : "Вход";
}

// Handle click on the "switch mode" link
authSwitchLink.onclick = (e) => {
  e.preventDefault();
  setMode(mode === "login" ? "register" : "login");
};

// Handle auth form submission
authForm.addEventListener("submit", async (e) => {
  e.preventDefault(); // Prevent default form behavior
  authErr.classList.add("hidden"); // Hide any previous error message

  const form = new FormData(authForm);
  const body = JSON.stringify({
    email: form.get("email"),
    password: form.get("password"),
  });

  try {
    // Send login or registration request based on current mode
    if (mode === "login") await api("login.php", { method: "POST", body });
    if (mode === "register")
      await api("register.php", { method: "POST", body });

    // Fetch user info after successful login/register
    const me = await api("me.php"); // expects { id, email }
    setLoggedUser(me.email);

    hideAuth(); // Hide auth modal
    initApp(); // Start main application
    if (window.renderHistory) window.renderHistory(); // Load history if available
  } catch (err) {
    authErr.textContent = err.error || "Неизвестна грешка.";
    authErr.classList.remove("hidden");
  }
});

/* ------------ On initial page load ------------ */
window.addEventListener("DOMContentLoaded", async () => {
  try {
    // Try to fetch logged-in user info
    const me = await api("me.php");
    console.log("me:", me);
    setLoggedUser(me.email);
    initApp(); // Proceed directly to app
  } catch {
    showAuth(); // No session – show login/register
  }
});

// Handle logout button click
document.getElementById("logout-btn").addEventListener("click", async () => {
  try {
    await api("logout.php"); // Log out from session
  } catch {}

  // Reset input/output fields and settings
  document.getElementById("input-field").value = SAMPLE_JSON;
  document.getElementById("output-field").value = "";
  document.getElementById("manual-format-field").value = DEFAULT_SETTINGS_TEXT;

  const hist = document.getElementById("history-container");
  if (hist) hist.innerHTML = "";

  // Reset file upload UI
  const fileUpload = document.getElementById("file-upload");
  const fileInfo = document.querySelector(".file-info");
  const fileName = document.getElementById("file-name");

  if (fileUpload) fileUpload.value = "";
  if (fileInfo) fileInfo.style.display = "none";
  if (fileName) fileName.textContent = "";

  // Clear user info and return to auth screen
  setLoggedUser("");
  showAuth();
});
