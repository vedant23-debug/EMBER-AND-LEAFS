/* EMBER & LEAF — payments.js
   Payment options for the subscription builder (step 4, Review): Cash on delivery, UPI, Credit/Debit card, Net banking.
   Loads AFTER subscriptions.js and extras.js. Uses window.ELApp and window.ELSub.

   DEMO SAFETY RULES (please keep them if you edit this file):
   - A static GitHub Pages site can NOT take real payments safely. Nothing here charges anyone.
   - Full card numbers, expiry dates and CVV are validated in the browser and then DISCARDED.
     They are never saved to localStorage, never logged and never sent anywhere.
     Only the card brand + last 4 digits (e.g. "Visa ending 1111") are saved with the order.
   - For real payments use a hosted gateway (Razorpay, Cashfree, PayU, Stripe) so card data goes to the gateway, not to your page. */
"use strict";
(function () {
  const A = window.ELApp, S = window.ELSub;
  if (!A || !S) { console.error("payments.js needs app.js, subscriptions.js and extras.js first"); return; }
  const { $, $$, h, money, store, toast, on, emit } = A;

  const COD_LIMIT = 5000;          // demo rule: max cash to collect per delivery
  const BANKS = ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank", "Bank of Baroda", "Canara Bank", "Yes Bank", "IDFC FIRST Bank"];
  const METHODS = [
    { id: "cod", label: "Cash on delivery", sub: "Pay in cash when each delivery arrives" },
    { id: "upi", label: "UPI", sub: "Google Pay, PhonePe, Paytm or any UPI app" },
    { id: "card", label: "Credit or debit card", sub: "Visa, Mastercard, RuPay, American Express" },
    { id: "netbanking", label: "Net banking", sub: "Pay from your bank account" }
  ];
  const P = { method: "cod" };           // only the chosen method lives in memory

  /* ---------- helpers ---------- */
  const digits = v => String(v || "").replace(/\D/g, "");
  function luhn(num) {
    let sum = 0, alt = false;
    for (let i = num.length - 1; i >= 0; i--) { let d = +num[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; }
    return num.length > 0 && sum % 10 === 0;
  }
  function brand(n) {
    if (/^4/.test(n)) return "Visa";
    if (/^(5[1-5]|2(2[2-9][1-9]|2[3-9]|[3-6]|7[01]|720))/.test(n)) return "Mastercard";
    if (/^3[47]/.test(n)) return "American Express";
    if (/^(60|65|81|82|508)/.test(n)) return "RuPay";
    return "";
  }
  const isAmex = n => /^3[47]/.test(n);
  function groupCard(n) {
    return isAmex(n) ? [n.slice(0, 4), n.slice(4, 10), n.slice(10, 15)].filter(Boolean).join(" ") : (n.match(/.{1,4}/g) || []).join(" ");
  }
  function expiryOk(v) {
    const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(v.trim());
    if (!m) return false;
    const mo = +m[1], yr = 2000 + +m[2], now = new Date();
    if (mo < 1 || mo > 12) return false;
    return yr > now.getFullYear() || (yr === now.getFullYear() && mo >= now.getMonth() + 1);
  }
  const maskUpi = v => { const [u, d] = v.trim().split("@"); return `${u.slice(0, 2)}${"*".repeat(Math.max(1, u.length - 2))}@${d}`; };

  /* Read the per-delivery total from the Review table so there is one source of truth (subscriptions.js). */
  function perDeliveryFromReview() {
    const rows = $$("#reviewPanel th");
    const th = rows.find(t => t.textContent.trim() === "Estimated total per delivery");
    return th ? Number(th.nextElementSibling.textContent.replace(/[^\d]/g, "")) || 0 : 0;
  }

  /* ---------- UI ---------- */
  const fieldErr = id => $("#" + id + "Error");
  function field(id, label, input, help) {
    return h("div", { class: "field-block" }, h("label", { for: id, text: label }), input, help && h("small", { class: "field-help", text: help }), h("small", { class: "field-error", id: id + "Error", role: "alert" }));
  }
  function methodList() {
    return METHODS.map(m => h("label", { class: "pay-option", for: "pay-" + m.id },
      h("input", { type: "radio", name: "payMethod", id: "pay-" + m.id, value: m.id, checked: m.id === P.method, on: { change: () => { P.method = m.id; showMethod(); } } }),
      h("span", {}, h("strong", { text: m.label }), h("small", { text: m.sub }))));
  }

  function codBox() {
    return h("div", { class: "pay-detail", id: "payBox-cod" },
      h("p", { class: "pay-lead", text: "Pay in cash to the courier when your order arrives. Nothing is charged online." }),
      h("ul", { class: "pay-info" },
        h("li", { text: "You pay for each delivery separately, on the day it arrives (not for the whole term up front)." }),
        h("li", { text: `Cash on delivery is available when a delivery is ${money(COD_LIMIT)} or less.` }),
        h("li", { text: "Please keep the exact amount ready. Couriers may not carry change." }),
        h("li", { text: "You can pay with cash only at the door. If nobody is available to pay, the delivery is marked failed and rescheduled." }),
        h("li", { text: "You can switch to UPI or card later from your dashboard (a real store would send you a secure payment link)." })),
      h("p", { class: "pay-total", id: "codAmount" }));
  }
  function upiBox() {
    return h("div", { class: "pay-detail", id: "payBox-upi", hidden: true },
      field("upiId", "UPI ID", h("input", { id: "upiId", autocomplete: "off", inputmode: "email", placeholder: "yourname@okhdfcbank", spellcheck: "false", "aria-describedby": "upiIdError" }), "Example: name@okaxis, 9876543210@ybl"),
      h("p", { class: "field-help", text: "A real store would send a payment request to your UPI app for approval. In this demo no request is sent." }));
  }
  function cardBox() {
    return h("div", { class: "pay-detail", id: "payBox-card", hidden: true },
      h("p", { class: "notice", text: "Demo only: use the test card 4111 1111 1111 1111, any future expiry (like 12/30) and any 3-digit CVV. Do NOT enter your real card details. They are checked in your browser and thrown away, and are never saved or sent." }),
      h("div", { class: "form-grid" },
        h("div", { class: "full-span" }, field("cardNumber", "Card number", h("input", { id: "cardNumber", inputmode: "numeric", autocomplete: "off", maxlength: "23", placeholder: "1234 5678 9012 3456", "aria-describedby": "cardNumberError", on: { input: e => { const n = digits(e.target.value).slice(0, isAmex(digits(e.target.value)) ? 15 : 19); e.target.value = groupCard(n); const b = brand(n); $("#cardBrand").textContent = b ? `Card type: ${b}` : ""; } } }))),
        h("p", { class: "field-help full-span", id: "cardBrand", "aria-live": "polite" }),
        h("div", { class: "full-span" }, field("cardName", "Name on card", h("input", { id: "cardName", autocomplete: "off", placeholder: "As printed on the card", "aria-describedby": "cardNameError" }))),
        field("cardExpiry", "Expiry (MM/YY)", h("input", { id: "cardExpiry", inputmode: "numeric", autocomplete: "off", maxlength: "5", placeholder: "MM/YY", "aria-describedby": "cardExpiryError", on: { input: e => { let v = digits(e.target.value).slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + "/" + v.slice(2); e.target.value = v; } } })),
        field("cardCvv", "CVV", h("input", { id: "cardCvv", type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "4", placeholder: "3 or 4 digits", "aria-describedby": "cardCvvError", on: { input: e => { e.target.value = digits(e.target.value).slice(0, 4); } } }), "3 digits on the back (4 on the front for American Express)")),
      h("label", { class: "check-row" }, h("input", { type: "checkbox", id: "cardRecurring" }), h("span", { text: "I agree this card may be charged automatically for each delivery of my subscription. Under RBI rules for recurring card payments, a real store would also ask you to approve an e-mandate with your bank, and you could cancel it any time." })),
      h("small", { class: "field-error", id: "cardRecurringError", role: "alert" }));
  }
  function netBox() {
    return h("div", { class: "pay-detail", id: "payBox-netbanking", hidden: true },
      field("bankName", "Choose your bank", h("select", { id: "bankName", "aria-describedby": "bankNameError" }, h("option", { value: "", text: "Select a bank" }), BANKS.map(b => h("option", { value: b, text: b }))), "A real store would redirect you to your bank’s own secure page. You never type your net banking password on this site."));
  }
  function infoBox() {
    const row = (q, a) => h("details", {}, h("summary", { text: q }), h("p", { text: a }));
    return h("div", { class: "pay-info-box" },
      h("h4", { text: "Payment information" }),
      row("When am I charged?", "UPI, card and net banking: the per-delivery amount is charged when each delivery is dispatched (monthly or weekly, depending on your plan). Cash on delivery: you pay the courier at the door. In this demo nothing is actually charged."),
      row("What does it cost?", "Prices are in Indian rupees. Subscribe & save 10% applies to all methods. Shipping is free when the subtotal after saving is ₹999 or more, otherwise ₹60. There is no extra fee for any payment method in this demo, and no tax is added."),
      row("What if a payment fails?", "A real store would retry once after 24 hours and email you. If it fails again, the subscription is paused and no delivery is sent until you update your payment method."),
      row("Refunds and cancellations", "Cancel any time from My subscriptions. Deliveries not yet dispatched are not charged. If a charged delivery is lost or damaged, the refund goes back to the original payment method (typically 5 to 7 working days for card and net banking, a few hours to 2 days for UPI). Cash on delivery refunds are sent by bank transfer."),
      row("Is my card data safe?", "In this demo, card details never leave your browser and are not stored. In a live store, card details would be entered on a PCI DSS compliant gateway page (such as Razorpay or Cashfree), card numbers would be tokenised, and your bank may ask for an OTP (two-factor authentication)."),
      row("Invoices", "A real store would email a GST invoice for each delivery. This demo does not generate invoices."));
  }

  function buildPanel() {
    let host = $("#paymentPanel");
    if (!host) { // no markup needed in index.html: insert above the "I understand this is a demo" checkbox
      host = h("div", { id: "paymentPanel" });
      $("#termsCheck").closest("label").before(host);
    }
    if (host.dataset.built) return;
    host.dataset.built = "1";
    host.append(
      h("fieldset", { class: "pay-fieldset" },
        h("legend", { text: "Payment method" }),
        h("div", { class: "pay-options" }, methodList()),
        codBox(), upiBox(), cardBox(), netBox(),
        h("small", { class: "field-error", id: "payMethodError", role: "alert" })),
      infoBox());
    showMethod();
  }

  function showMethod() {
    METHODS.forEach(m => { const b = $("#payBox-" + m.id); if (b) b.hidden = m.id !== P.method; });
    $$(".pay-option").forEach(l => l.classList.toggle("selected", l.querySelector("input").checked));
    refreshCod();
  }
  function refreshCod() {
    const el = $("#codAmount"); if (!el) return;
    const amt = perDeliveryFromReview();
    if (!amt) { el.textContent = ""; return; }
    el.textContent = amt <= COD_LIMIT ? `Amount to pay in cash per delivery: ${money(amt)}` : `This plan costs ${money(amt)} per delivery, above the ${money(COD_LIMIT)} cash limit. Please choose UPI, card or net banking.`;
    el.classList.toggle("bad", amt > COD_LIMIT);
  }

  /* ---------- validation ---------- */
  function setErr(id, ok, msg) {
    const input = $("#" + id), err = fieldErr(id);
    if (input) input.setAttribute("aria-invalid", String(!ok));
    if (err) err.textContent = ok ? "" : msg;
    return ok ? null : input;
  }
  function validate() {
    let first = null;
    const note = el => { if (el && !first) first = el; };
    if (P.method === "cod") {
      const amt = perDeliveryFromReview();
      if (amt > COD_LIMIT) { $("#payMethodError").textContent = `Cash on delivery is limited to ${money(COD_LIMIT)} per delivery.`; note($("#pay-cod")); } else $("#payMethodError").textContent = "";
    } else $("#payMethodError").textContent = "";
    if (P.method === "upi") note(setErr("upiId", /^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test($("#upiId").value.trim()), "Enter a valid UPI ID, like name@okhdfcbank."));
    if (P.method === "card") {
      const n = digits($("#cardNumber").value);
      note(setErr("cardNumber", n.length >= 13 && n.length <= 19 && luhn(n) && !!brand(n), brand(n) || !n ? "Enter a valid card number." : "We accept Visa, Mastercard, RuPay and American Express."));
      note(setErr("cardName", /^[A-Za-z][A-Za-z .'-]{1,49}$/.test($("#cardName").value.trim()), "Enter the name as printed on the card."));
      note(setErr("cardExpiry", expiryOk($("#cardExpiry").value), "Enter a valid future expiry, like 12/30."));
      note(setErr("cardCvv", new RegExp(`^\\d{${isAmex(n) ? 4 : 3}}$`).test($("#cardCvv").value), isAmex(n) ? "Enter the 4-digit CVV." : "Enter the 3-digit CVV."));
      const ok = $("#cardRecurring").checked; $("#cardRecurringError").textContent = ok ? "" : "Please agree to automatic charging to pay by card."; if (!ok) note($("#cardRecurring"));
    }
    if (P.method === "netbanking") note(setErr("bankName", !!$("#bankName").value, "Choose your bank."));
    if (first) { first.focus(); toast("Please check the payment details.", "error"); return false; }
    return true;
  }

  /* What is saved with the order: never the card number, expiry or CVV. */
  function paymentRecord() {
    if (P.method === "cod") return { method: "cod", label: "Cash on delivery", status: "Pay on delivery", summary: "Cash on delivery (pay the courier at each delivery)" };
    if (P.method === "upi") return { method: "upi", label: "UPI", status: "Demo payment recorded", summary: `UPI ${maskUpi($("#upiId").value)}` };
    if (P.method === "netbanking") return { method: "netbanking", label: "Net banking", status: "Demo payment recorded", summary: `Net banking, ${$("#bankName").value}` };
    const n = digits($("#cardNumber").value);
    return { method: "card", label: "Card", status: "Demo payment recorded", summary: `${brand(n)} card ending ${n.slice(-4)}` };
  }
  function wipeSensitive() {
    ["cardNumber", "cardName", "cardExpiry", "cardCvv", "upiId"].forEach(id => { const el = $("#" + id); if (el) el.value = ""; });
    const r = $("#cardRecurring"); if (r) r.checked = false;
    const b = $("#cardBrand"); if (b) b.textContent = "";
  }

  /* ---------- wiring ---------- */
  let pending = null;
  function init() {
    buildPanel();
    const form = $("#subscriptionForm");
    // Capture phase: runs BEFORE the builder's own submit handler, so an invalid payment blocks order creation.
    form.addEventListener("submit", e => {
      if ($('[data-panel="4"]').classList.contains("active") === false) return;
      if (!validate()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      pending = paymentRecord();
      wipeSensitive(); // card data is gone before the order is even created
    }, true);

    // After the builder saved the order, attach the (safe) payment summary to it.
    on("subscription-saved", sub => {
      const rec = pending || { method: "cod", label: "Cash on delivery", status: "Pay on delivery", summary: "Cash on delivery" };
      pending = null;
      const list = S.loadSubs(), t = list.find(x => x.id === sub.id);
      if (t) { t.payment = rec; t.history.push({ at: S.toISO(S.today()), event: `Payment method: ${rec.summary} (demo)` }); S.saveSubs(list); emit("subs-changed"); }
      const box = $("#successDetails");
      if (box) box.append(h("p", {}, h("strong", { text: "Payment: " }), `${rec.summary}. Status: ${rec.status}.`));
    });

    // Refresh COD amount whenever the review is shown or the form changes; reset on "Build another".
    new MutationObserver(refreshCod).observe($("#reviewPanel"), { childList: true });
    form.addEventListener("reset", () => setTimeout(() => { P.method = "cod"; $("#pay-cod").checked = true; wipeSensitive(); showMethod(); }, 0));
  }
  A.register(init);
})();
