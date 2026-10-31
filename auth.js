```javascript
"use strict";

/* =========================================================
   EMBER & LEAF — AUTHENTICATION
   Supabase signup, login, email verification and logout
   ========================================================= */

(() => {
  const SITE_URL = "https://vedant23-debug.github.io/HTML/";

  let supabaseClient = null;
  let currentUser = null;

  // Wait until the page and deferred scripts are ready.
  document.addEventListener("DOMContentLoaded", initialiseAuth);

  function initialiseAuth() {
    supabaseClient = window.ELSupabase;

    if (!supabaseClient) {
      console.error(
        "EMBER & LEAF: Supabase client not found. Check supabase-client.js and script order."
      );
      return;
    }

    const headerActions = document.querySelector(".header-actions");

    if (!headerActions) {
      console.error(
        "EMBER & LEAF: Could not find .header-actions in index.html."
      );
      return;
    }

    addAuthStyles();
    createAccountButton(headerActions);
    createAuthModal();

    // Check whether a user is already signed in.
    checkExistingSession();

    // Listen for login, logout and session changes.
    supabaseClient.auth.onAuthStateChange((_event, session) => {
      currentUser = session?.user || null;
      updateAccountButton();
    });
  }

  /* =========================================================
     STYLES
     ========================================================= */

  function addAuthStyles() {
    if (document.getElementById("el-auth-styles")) return;

    const style = document.createElement("style");
    style.id = "el-auth-styles";

    style.textContent = `
      .el-auth-button {
        cursor: pointer;
        border: 1px solid currentColor;
        background: transparent;
        color: inherit;
        padding: 10px 17px;
        border-radius: 3px;
        font: inherit;
        font-size: 13px;
        letter-spacing: .04em;
      }

      .el-auth-button:hover {
        opacity: .75;
      }

      .el-auth-overlay {
        position: fixed;
        inset: 0;
        z-index: 99999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 18px;
        background: rgba(0, 0, 0, .65);
      }

      .el-auth-overlay.el-auth-visible {
        display: flex;
      }

      .el-auth-panel {
        position: relative;
        width: 100%;
        max-width: 440px;
        max-height: 90vh;
        overflow-y: auto;
        padding: 34px;
        background: #f7f4ec;
        color: #19382d;
        border-radius: 5px;
        box-shadow: 0 18px 65px rgba(0, 0, 0, .25);
      }

      .el-auth-close {
        position: absolute;
        top: 12px;
        right: 15px;
        border: 0;
        background: transparent;
        color: #19382d;
        font-size: 27px;
        cursor: pointer;
      }

      .el-auth-title {
        margin: 0 0 8px;
        font-family: Georgia, serif;
        font-size: 29px;
        font-weight: normal;
      }

      .el-auth-subtitle {
        margin: 0 0 24px;
        color: #64766b;
        font-size: 13px;
        line-height: 1.6;
      }

      .el-auth-form label {
        display: block;
        margin: 15px 0 7px;
        font-size: 12px;
        font-weight: 600;
      }

      .el-auth-form input {
        box-sizing: border-box;
        display: block;
        width: 100%;
        padding: 12px;
        border: 1px solid #c9d0c7;
        border-radius: 3px;
        background: #fff;
        color: #19382d;
        font: inherit;
        font-size: 14px;
      }

      .el-auth-form input:focus {
        outline: 2px solid #9b9b6c;
        outline-offset: 1px;
      }

      .el-auth-submit {
        width: 100%;
        margin-top: 22px;
        padding: 13px;
        border: 0;
        border-radius: 3px;
        background: #19382d;
        color: #fff;
        font: inherit;
        font-size: 13px;
        letter-spacing: .05em;
        cursor: pointer;
      }

      .el-auth-submit:disabled {
        opacity: .6;
        cursor: wait;
      }

      .el-auth-switch {
        margin-top: 18px;
        text-align: center;
        font-size: 13px;
      }

      .el-auth-link {
        border: 0;
        padding: 0;
        background: transparent;
        color: #526b48;
        text-decoration: underline;
        cursor: pointer;
        font: inherit;
      }

      .el-auth-message {
        display: none;
        margin-top: 16px;
        padding: 11px;
        border-radius: 3px;
        font-size: 13px;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }

      .el-auth-message.el-auth-message-visible {
        display: block;
      }

      .el-auth-message.success {
        background: #e4eee2;
        color: #244d32;
      }

      .el-auth-message.error {
        background: #f5e4df;
        color: #8b3024;
      }

      .el-auth-account-email {
        margin: 12px 0 20px;
        overflow-wrap: anywhere;
        color: #64766b;
        font-size: 13px;
      }

      .el-auth-secondary {
        width: 100%;
        padding: 12px;
        border: 1px solid #19382d;
        border-radius: 3px;
        background: transparent;
        color: #19382d;
        font: inherit;
        cursor: pointer;
      }

      @media (max-width: 480px) {
        .el-auth-panel {
          padding: 28px 22px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /* =========================================================
     ACCOUNT BUTTON
     ========================================================= */

  function createAccountButton(headerActions) {
    if (document.getElementById("el-account-button")) return;

    const button = document.createElement("button");
    button.id = "el-account-button";
    button.type = "button";
    button.className = "el-auth-button";
    button.textContent = "Account";

    button.addEventListener("click", () => {
      openAuthModal();
    });

    headerActions.appendChild(button);
  }

  function updateAccountButton() {
    const button = document.getElementById("el-account-button");
    if (!button) return;

    button.textContent = currentUser
      ? "My Account"
      : "Account";
  }

  /* =========================================================
     AUTHENTICATION MODAL
     ========================================================= */

  function createAuthModal() {
    if (document.getElementById("el-auth-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "el-auth-overlay";
    overlay.className = "el-auth-overlay";

    overlay.innerHTML = `
      <section
        class="el-auth-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="el-auth-title"
      >
        <button
          type="button"
          class="el-auth-close"
          id="el-auth-close"
          aria-label="Close"
        >&times;</button>

        <div id="el-auth-content"></div>
      </section>
    `;

    document.body.appendChild(overlay);

    document
      .getElementById("el-auth-close")
      .addEventListener("click", closeAuthModal);

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeAuthModal();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (
        event.key === "Escape" &&
        overlay.classList.contains("el-auth-visible")
      ) {
        closeAuthModal();
      }
    });
  }

  function openAuthModal() {
    const overlay = document.getElementById("el-auth-overlay");

    if (!overlay) return;

    overlay.classList.add("el-auth-visible");

    if (currentUser) {
      showAccountView();
    } else {
      showLoginView();
    }
  }

  function closeAuthModal() {
    const overlay = document.getElementById("el-auth-overlay");

    if (overlay) {
      overlay.classList.remove("el-auth-visible");
    }
  }

  function setAuthContent(html) {
    const content = document.getElementById("el-auth-content");

    if (content) {
      content.innerHTML = html;
    }
  }

  /* =========================================================
     LOGIN VIEW
     ========================================================= */

  function showLoginView(message = "") {
    setAuthContent(`
      <h2 class="el-auth-title" id="el-auth-title">
        Welcome Back
      </h2>

      <p class="el-auth-subtitle">
        Sign in to manage your EMBER & LEAF account and subscriptions.
      </p>

      <form class="el-auth-form" id="el-login-form">
        <label for="el-login-email">Email Address</label>
        <input
          type="email"
          id="el-login-email"
          autocomplete="email"
          placeholder="you@example.com"
          required
        >

        <label for="el-login-password">Password</label>
        <input
          type="password"
          id="el-login-password"
          autocomplete="current-password"
          placeholder="Enter your password"
          required
        >

        <button class="el-auth-submit" type="submit">
          SIGN IN
        </button>
      </form>

      <div class="el-auth-message" id="el-auth-message"></div>

      <div class="el-auth-switch">
        Don't have an account?
        <button class="el-auth-link" id="el-show-signup" type="button">
          Create account
        </button>
      </div>

      <div class="el-auth-switch">
        <button class="el-auth-link" id="el-show-resend" type="button">
          Resend verification email
        </button>
      </div>
    `);

    document
      .getElementById("el-login-form")
      .addEventListener("submit", handleLogin);

    document
      .getElementById("el-show-signup")
      .addEventListener("click", () => showSignupView());

    document
      .getElementById("el-show-resend")
      .addEventListener("click", showResendView);

    if (message) {
      showMessage(message, "success");
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const email = document
      .getElementById("el-login-email")
      .value.trim();

    const password = document
      .getElementById("el-login-password")
      .value;

    const submitButton = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    setLoading(submitButton, true, "SIGNING IN...");

    try {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      currentUser = data.user;
      updateAccountButton();
      showAccountView();

    } catch (error) {
      showMessage(error.message || "Unable to sign in.", "error");
    } finally {
      setLoading(submitButton, false, "SIGN IN");
    }
  }

  /* =========================================================
     SIGNUP VIEW
     ========================================================= */

  function showSignupView() {
    setAuthContent(`
      <h2 class="el-auth-title" id="el-auth-title">
        Create Account
      </h2>

      <p class="el-auth-subtitle">
        Join EMBER & LEAF and begin your personal tea and coffee ritual.
      </p>

      <form class="el-auth-form" id="el-signup-form">
        <label for="el-signup-name">Full Name</label>
        <input
          type="text"
          id="el-signup-name"
          autocomplete="name"
          placeholder="Your full name"
          required
        >

        <label for="el-signup-email">Email Address</label>
        <input
          type="email"
          id="el-signup-email"
          autocomplete="email"
          placeholder="you@example.com"
          required
        >

        <label for="el-signup-password">Password</label>
        <input
          type="password"
          id="el-signup-password"
          autocomplete="new-password"
          minlength="6"
          placeholder="At least 6 characters"
          required
        >

        <label for="el-signup-confirm">Confirm Password</label>
        <input
          type="password"
          id="el-signup-confirm"
          autocomplete="new-password"
          minlength="6"
          placeholder="Enter password again"
          required
        >

        <button class="el-auth-submit" type="submit">
          CREATE ACCOUNT
        </button>
      </form>

      <div class="el-auth-message" id="el-auth-message"></div>

      <div class="el-auth-switch">
        Already have an account?
        <button class="el-auth-link" id="el-show-login" type="button">
          Sign in
        </button>
      </div>
    `);

    document
      .getElementById("el-signup-form")
      .addEventListener("submit", handleSignup);

    document
      .getElementById("el-show-login")
      .addEventListener("click", () => showLoginView());
  }

  async function handleSignup(event) {
    event.preventDefault();

    const name = document
      .getElementById("el-signup-name")
      .value.trim();

    const email = document
      .getElementById("el-signup-email")
      .value.trim();

    const password = document
      .getElementById("el-signup-password")
      .value;

    const confirmPassword = document
      .getElementById("el-signup-confirm")
      .value;

    if (password.length < 6) {
      showMessage("Your password must contain at least 6 characters.", "error");
      return;
    }

    if (password !== confirmPassword) {
      showMessage("Your passwords do not match.", "error");
      return;
    }

    const submitButton = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    setLoading(submitButton, true, "CREATING ACCOUNT...");

    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: SITE_URL,
          data: {
            full_name: name,
            name: name
          }
        }
      });

      if (error) throw error;

      // With email confirmation enabled, Supabase normally returns
      // a user but no active session until the email is verified.
      if (data.session) {
        currentUser = data.user;
        updateAccountButton();
        showAccountView();
      } else {
        setAuthContent(`
          <h2 class="el-auth-title" id="el-auth-title">
            Check Your Email
          </h2>

          <p class="el-auth-subtitle">
            Your account registration has been submitted.
            Supabase has sent a verification link to:
          </p>

          <p style="font-weight:600; overflow-wrap:anywhere;">
            ${escapeHTML(email)}
          </p>

          <p class="el-auth-subtitle">
            Open that email and click the verification link.
            You will be redirected to the EMBER & LEAF website.
            After verification, return here and sign in.
          </p>

          <button
            class="el-auth-submit"
            id="el-back-to-login"
            type="button"
          >
            GO TO SIGN IN
          </button>

          <div class="el-auth-message" id="el-auth-message"></div>
        `);

        document
          .getElementById("el-back-to-login")
          .addEventListener("click", () => showLoginView());
      }

    } catch (error) {
      showMessage(error.message || "Unable to create your account.", "error");
    } finally {
      if (document.body.contains(submitButton)) {
        setLoading(submitButton, false, "CREATE ACCOUNT");
      }
    }
  }

  /* =========================================================
     RESEND VERIFICATION EMAIL
     ========================================================= */

  function showResendView() {
    setAuthContent(`
      <h2 class="el-auth-title" id="el-auth-title">
        Resend Verification
      </h2>

      <p class="el-auth-subtitle">
        Enter the email address you used to register.
        We will request a new verification email.
      </p>

      <form class="el-auth-form" id="el-resend-form">
        <label for="el-resend-email">Email Address</label>
        <input
          type="email"
          id="el-resend-email"
          autocomplete="email"
          placeholder="you@example.com"
          required
        >

        <button class="el-auth-submit" type="submit">
          RESEND EMAIL
        </button>
      </form>

      <div class="el-auth-message" id="el-auth-message"></div>

      <div class="el-auth-switch">
        <button class="el-auth-link" id="el-resend-back" type="button">
          Back to sign in
        </button>
      </div>
    `);

    document
      .getElementById("el-resend-form")
      .addEventListener("submit", handleResendEmail);

    document
      .getElementById("el-resend-back")
      .addEventListener("click", () => showLoginView());
  }

  async function handleResendEmail(event) {
    event.preventDefault();

    const email = document
      .getElementById("el-resend-email")
      .value.trim();

    const submitButton = event.currentTarget.querySelector(
      'button[type="submit"]'
    );

    setLoading(submitButton, true, "SENDING...");

    try {
      const { error } = await supabaseClient.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: SITE_URL
        }
      });

      if (error) throw error;

      showMessage(
        "If this address has a pending signup, a new verification email has been requested. Please check your inbox and spam folder.",
        "success"
      );

    } catch (error) {
      showMessage(error.message || "Unable to resend the email.", "error");
    } finally {
      setLoading(submitButton, false, "RESEND EMAIL");
    }
  }

  /* =========================================================
     SIGNED-IN ACCOUNT VIEW
     ========================================================= */

  function showAccountView() {
    if (!currentUser) {
      showLoginView();
      return;
    }

    const email = currentUser.email || "Signed-in user";

    setAuthContent(`
      <h2 class="el-auth-title" id="el-auth-title">
        My Account
      </h2>

      <p class="el-auth-subtitle">
        Welcome to your EMBER & LEAF account.
      </p>

      <div class="el-auth-account-email">
        Signed in as:<br>
        <strong>${escapeHTML(email)}</strong>
      </div>

      <button
        class="el-auth-secondary"
        id="el-signout-button"
        type="button"
      >
        SIGN OUT
      </button>

      <div class="el-auth-message" id="el-auth-message"></div>
    `);

    document
      .getElementById("el-signout-button")
      .addEventListener("click", handleLogout);
  }

  async function handleLogout() {
    const button = document.getElementById("el-signout-button");

    setLoading(button, true, "SIGNING OUT...");

    try {
      const { error } = await supabaseClient.auth.signOut();

      if (error) throw error;

      currentUser = null;
      updateAccountButton();
      showLoginView("You have successfully signed out.");

    } catch (error) {
      showMessage(error.message || "Unable to sign out.", "error");

      if (button) {
        setLoading(button, false, "SIGN OUT");
      }
    }
  }

  /* =========================================================
     SESSION CHECK
     ========================================================= */

  async function checkExistingSession() {
    try {
      const { data, error } = await supabaseClient.auth.getSession();

      if (error) throw error;

      currentUser = data.session?.user || null;
      updateAccountButton();

    } catch (error) {
      console.error("EMBER & LEAF session check failed:", error.message);
    }
  }

  /* =========================================================
     HELPER FUNCTIONS
     ========================================================= */

  function showMessage(message, type = "success") {
    const messageBox = document.getElementById("el-auth-message");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.className =
      "el-auth-message el-auth-message-visible " + type;
  }

  function setLoading(button, loading, text) {
    if (!button) return;

    button.disabled = loading;
    button.textContent = text;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => {
      const replacements = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return replacements[character];
    });
  }

})();
```