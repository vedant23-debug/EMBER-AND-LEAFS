/* EMBER & LEAF — auth.js
   Customer accounts (register once, log in afterwards), stored in Supabase Auth.
   Load AFTER payments.js and BEFORE supabase.js in index.html.

   How it works
   - Register: Full name, Mobile, Email, Password, Confirm password -> Supabase Auth creates the account.
     Supabase stores the password as a salted hash. This site never stores or logs the password.
     Name and mobile are saved on the account and copied into the public.customers table by a database trigger.
   - Log in: Email + password. The session is kept in this browser, so returning customers stay signed in.
   - Checkout gate: pressing "Create demo subscription" while signed out opens this dialog.
     After sign-in the order continues automatically. Signed-in customers never see the dialog again.
   - Orders are saved with the customer's user_id (see supabase.js). */
"use strict";
(function () {
  const A = window.ELApp;
  if (!A) { console.error("auth.js needs app.js first"); return; }
  const { $, h, store, toast } = A;

  const SUPABASE_URL = "https://nncaigpekbgioazrwjpe.supabase.co";
  const SUPABASE_KEY = "sb_publishable_kbbQ-sq1teR-cxNR7Zsnog_j0d1q3tm"; // publishable key: safe to be public

  /* ---------- Supabase Auth over plain fetch (no extra library needed) ---------- */
  async function api(path, body, token) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const e = new Error(data.msg || data.error_description || data.message || "Request failed");
      e.status = res.status; e.code = data.error_code || data.error || "";
      throw e;
    }
    return data;
  }

  /* ---------- Session ---------- */
  const listeners = [];
  let session = readSession();
  function readSession() {
    const s = store.get("session", null);
    return s && typeof s.access_token === "string" && s.user && s.user.id ? s : null;
  }
  function toSession(d) {
    const u = d.user || {};
    return {
      access_token: d.access_token, refresh_token: d.refresh_token,
      expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
      user: { id: u.id, email: u.email, user_metadata: u.user_metadata || {} }
    };
  }
  function setSession(s) {
    session = s;
    if (s) store.set("session", s); else store.remove("session");
    renderHeader();
    listeners.forEach(fn => { try { fn(user()); } catch (e) { console.error(e); } });
  }
  const user = () => (session ? session.user : null);
  const meta = () => (user() && user().user_metadata) || {};
  const firstName = () => String(meta().full_name || user()?.email || "").trim().split(/\s+/)[0];

  let refreshing = null;
  async function getToken() {
    if (!session) return null;
    if (session.expires_at - Math.floor(Date.now() / 1000) > 60) return session.access_token;
    if (!refreshing) {
      refreshing = api("token?grant_type=refresh_token", { refresh_token: session.refresh_token })
        .then(d => { setSession(toSession(d)); return session.access_token; })
        .catch(() => { setSession(null); return null; })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  async function logout() {
    const t = session && session.access_token;
    setSession(null);
    if (t) { try { await api("logout", null, t); } catch (e) { /* already signed out locally */ } }
    toast("You’re signed out.", "success");
  }

  /* ---------- Friendly errors ---------- */
  function friendly(err) {
    const m = String(err.message || "").toLowerCase(), c = String(err.code || "").toLowerCase();
    if (m.includes("invalid login")) return "That email and password don’t match. Please try again.";
    if (m.includes("not confirmed")) return "Please confirm your email first. We sent you a link when you registered.";
    if (m.includes("already registered") || c === "user_already_exists") return "This email already has an account. Please log in instead.";
    if (m.includes("database error")) return "This mobile number or email is already registered. Please log in instead.";
    if (c === "weak_password") return "Please choose a stronger password.";
    if (err.status === 429 || c.includes("rate_limit")) return "Too many attempts. Please wait a minute and try again.";
    if (err instanceof TypeError) return "Couldn’t reach the server. Check your internet connection.";
    return "Something went wrong. Please try again.";
  }

  /* ---------- Dialog ---------- */
  const css = document.createElement("style");
  css.textContent = `
    #authDialog{max-width:min(440px,94vw);width:100%}
    #authDialog form{display:grid;gap:.9rem;margin-top:1rem}
    #authDialog .auth-tabs{display:flex;gap:.5rem;margin-top:1rem}
    #authDialog .auth-switch{margin:.25rem 0 0;font-size:.9rem}
    #authDialog .auth-form-error{color:var(--danger,#b3261e);font-size:.9rem;min-height:1.2em;margin:0}
    #authDialog dl.auth-card{display:grid;grid-template-columns:auto 1fr;gap:.4rem 1rem;margin:1rem 0}
    #authDialog dl.auth-card dt{font-weight:600}
    #authDialog dl.auth-card dd{margin:0;overflow-wrap:anywhere}`;
  document.head.append(css);

  const dlg = h("dialog", { class: "modal small-modal", id: "authDialog", "aria-labelledby": "authTitle" });
  document.body.append(dlg);
  let resumeAction = null; // what to do right after sign-in (e.g. continue to the payment step)
  dlg.addEventListener("close", () => { resumeAction = null; });

  const setErr = (id, msg) => { const n = $("#" + id + "Error", dlg); if (n) n.textContent = msg || ""; };
  const val = id => ($("#" + id, dlg) || {}).value || "";
  const fld = (id, label, attrs, help) => h("div", { class: "field-block" },
    h("label", { for: id, text: label }), h("input", { id, ...attrs }),
    help && h("small", { class: "field-help", text: help }),
    h("small", { class: "field-error", id: id + "Error", role: "alert" }));
  const busy = (btn, on, label) => { btn.disabled = on; btn.textContent = on ? "Please wait…" : label; };

  function open(mode, resume) {
    resumeAction = typeof resume === "function" ? resume : null;
    render(mode || (store.get("hasAccount", false) ? "login" : "signup"));
    if (!dlg.open) dlg.showModal();
    const first = dlg.querySelector("input"); if (first) first.focus();
  }
  const close = () => { if (dlg.open) dlg.close(); };

  function head(title, sub) {
    return [
      h("button", { class: "icon-button modal-close", type: "button", "aria-label": "Close", text: "×", on: { click: close } }),
      h("h2", { id: "authTitle", text: title }),
      sub && h("p", { class: "muted", text: sub })
    ];
  }
  function tabs(active) {
    const t = (id, label) => h("button", { type: "button", class: "filter-tab" + (id === active ? " active" : ""), "aria-pressed": String(id === active), text: label, on: { click: () => render(id) } });
    return h("div", { class: "auth-tabs", role: "group", "aria-label": "Account" }, t("signup", "Account Registration"), t("login", "I already have an account"));
  }

  function render(mode) {
    if (mode === "account" && !user()) mode = "login";
    const orderNote = resumeAction ? "Create your account first, then you can choose how to pay. You only register once." : null;

    if (mode === "account") {
      dlg.replaceChildren(...head("Your account"),
        h("dl", { class: "auth-card" },
          h("dt", { text: "Name" }), h("dd", { text: meta().full_name || "—" }),
          h("dt", { text: "Mobile" }), h("dd", { text: meta().phone || "—" }),
          h("dt", { text: "Email" }), h("dd", { text: user().email || "—" })),
        h("div", { class: "builder-actions" },
          h("button", { class: "button button-outline", type: "button", text: "Close", on: { click: close } }),
          h("button", { class: "button button-dark", type: "button", text: "Log out", on: { click: () => { close(); logout(); } } })));
      return;
    }

    if (mode === "login") {
      const btn = h("button", { class: "button button-dark full", type: "submit", text: "Log in" });
      const err = h("p", { class: "auth-form-error", role: "alert" });
      const form = h("form", { novalidate: true },
        fld("liEmail", "Email address", { type: "email", autocomplete: "email" }),
        fld("liPassword", "Password", { type: "password", autocomplete: "current-password" }),
        err, btn,
        h("p", { class: "auth-switch" }, "New here? ", h("button", { class: "text-btn", type: "button", text: "Create an account", on: { click: () => render("signup") } })));
      form.addEventListener("submit", async e => {
        e.preventDefault(); err.textContent = ""; setErr("liEmail"); setErr("liPassword");
        const email = val("liEmail").trim().toLowerCase(), password = val("liPassword");
        let bad = false;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { setErr("liEmail", "Enter a valid email address."); bad = true; }
        if (!password) { setErr("liPassword", "Enter your password."); bad = true; }
        if (bad) return;
        busy(btn, true);
        try { const d = await api("token?grant_type=password", { email, password }); finish(toSession(d), `Welcome back, ${String(d.user?.user_metadata?.full_name || "").split(" ")[0] || "friend"}!`); }
        catch (ex) { err.textContent = friendly(ex); busy(btn, false, "Log in"); }
      });
      dlg.replaceChildren(...head("Log in", orderNote || "Welcome back. Log in to continue."), tabs("login"), form);
      return;
    }

    /* signup */
    const btn = h("button", { class: "button button-dark full", type: "submit", text: "Create account" });
    const err = h("p", { class: "auth-form-error", role: "alert" });
    const form = h("form", { novalidate: true },
      fld("suName", "Full name", { autocomplete: "name" }),
      fld("suPhone", "Mobile number", { type: "tel", inputmode: "numeric", autocomplete: "tel-national", maxlength: "10", placeholder: "10-digit mobile number" }),
      fld("suEmail", "Email address", { type: "email", autocomplete: "email" }),
      fld("suPassword", "Password", { type: "password", autocomplete: "new-password" }, "At least 8 characters, with a letter and a number."),
      fld("suConfirm", "Confirm password", { type: "password", autocomplete: "new-password" }),
      err, btn,
      h("p", { class: "auth-switch" }, "Already registered? ", h("button", { class: "text-btn", type: "button", text: "Log in", on: { click: () => render("login") } })));
    $("#suPhone", form).addEventListener("input", e => { e.target.value = e.target.value.replace(/\D/g, "").slice(0, 10); });
    form.addEventListener("submit", async e => {
      e.preventDefault(); err.textContent = "";
      ["suName", "suPhone", "suEmail", "suPassword", "suConfirm"].forEach(i => setErr(i));
      const name = val("suName").trim().replace(/\s+/g, " "), phone = val("suPhone").trim(), email = val("suEmail").trim().toLowerCase(), pw = val("suPassword"), pw2 = val("suConfirm");
      let bad = false;
      const fail = (id, m) => { setErr(id, m); bad = true; };
      if (name.length < 2) fail("suName", "Enter your full name.");
      if (!/^[6-9]\d{9}$/.test(phone)) fail("suPhone", "Enter a 10-digit Indian mobile number starting with 6 to 9.");
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) fail("suEmail", "Enter a valid email, like name@example.com.");
      if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) fail("suPassword", "Use at least 8 characters, with a letter and a number.");
      if (pw2 !== pw) fail("suConfirm", "The two passwords don’t match.");
      if (bad) return;
      busy(btn, true);
      try {
        const d = await api("signup", { email, password: pw, data: { full_name: name, phone } });
        if (d.access_token) { finish(toSession(d), `Account created. Welcome, ${name.split(" ")[0]}!`); return; }
        const u = d.user || d;
        if (Array.isArray(u.identities) && u.identities.length === 0) { fail("suEmail", "This email already has an account. Please log in instead."); busy(btn, false, "Create account"); return; }
        store.set("hasAccount", true);
        render("login");
        const note = $(".muted", dlg); if (note) note.textContent = "Account created. Please confirm your email using the link we sent, then log in here.";
      } catch (ex) { err.textContent = friendly(ex); busy(btn, false, "Create account"); }
    });
    dlg.replaceChildren(...head("Account Registration", orderNote || "Register once. Next time, just log in."), tabs("signup"), form);
  }

  function finish(s, message) {
    setSession(s);
    store.set("hasAccount", true);
    toast(message, "success");
    const resume = resumeAction; resumeAction = null;
    close();
    prefill();
    if (resume) setTimeout(resume, 0);
  }

  /* ---------- Fill step 3 with the account's details (only empty fields) ---------- */
  function prefill() {
    if (!user()) return;
    const set = (id, v) => { const n = $("#" + id); if (n && v && !n.value) { n.value = v; n.dispatchEvent(new Event("input", { bubbles: true })); } };
    set("customerName", meta().full_name); set("customerEmail", user().email); set("customerPhone", meta().phone);
  }

  /* ---------- Header button ---------- */
  let btn;
  function renderHeader() {
    if (!btn) return;
    btn.textContent = user() ? `Hi, ${firstName()}` : "Sign in";
    btn.setAttribute("aria-label", user() ? "Your account" : "Sign in or create an account");
  }
  function mountHeader() {
    btn = h("button", { class: "cart-button", id: "accountBtn", type: "button", on: { click: () => open(user() ? "account" : undefined) } });
    const bag = $("#openCart"); if (bag) bag.before(btn); else $(".header-actions").prepend(btn);
    renderHeader();
  }

  /* ---------- Gate 1: the Review step (where Cash on delivery / card / UPI are chosen) needs an account ---------- */
  document.addEventListener("click", e => {
    if (user() || !e.target || !e.target.closest) return;
    const el = e.target.closest('[data-next="4"], [data-goto="4"]');
    if (!el) return;
    e.preventDefault(); e.stopPropagation();
    open("signup", () => el.click());
  }, true);

  /* ---------- Gate 2 (backup): the order itself can never be submitted while signed out ---------- */
  document.addEventListener("submit", e => {
    if (!e.target || e.target.id !== "subscriptionForm" || user()) return;
    e.preventDefault(); e.stopPropagation();
    open("signup", () => { const f = $("#subscriptionForm"); if (f) f.requestSubmit(); });
  }, true);

  /* ---------- Gate 3 (backup): payment options stay hidden until the customer is signed in ---------- */
  const lockCss = document.createElement("style");
  lockCss.textContent = "body:not(.el-signed-in) #paymentPanel{display:none}";
  document.head.append(lockCss);
  let lockBox;
  function syncLock() {
    document.body.classList.toggle("el-signed-in", !!user());
    const panel = $("#paymentPanel");
    if (!lockBox) {
      lockBox = h("div", { class: "notice", id: "paymentLock" },
        h("strong", { text: "Create your account to choose how to pay. " }),
        h("button", { class: "button button-dark", type: "button", text: "Account Registration", on: { click: () => open("signup", () => {}) } }));
    }
    const anchor = panel || ($("#termsCheck") && $("#termsCheck").closest("label"));
    if (anchor && !lockBox.isConnected) anchor.before(lockBox);
    lockBox.hidden = !!user();
  }
  listeners.push(syncLock);

  /* If the saved session has expired for good, quietly drop it. */
  A.register(() => { mountHeader(); syncLock(); if (session) getToken().then(() => { prefill(); syncLock(); }); });

  window.ELAuth = Object.freeze({ user, getToken, open, logout, onChange: fn => listeners.push(fn), isSignedIn: () => !!session });
})();
