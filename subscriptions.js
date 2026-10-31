/* EMBER & LEAF — subscriptions.js
   Sections: 6 Subscription scheduling · 7 Subscription builder · 8 Curated plans.
   Loads after app.js and uses window.ELApp. Exposes window.ELSub for the dashboard/admin code.
   DEMO ONLY: nothing here charges money, books a courier or sends email.
   UPDATED: clickable step tabs (goToStep), no auto-scroll on first load, interactive plan comparison. */
"use strict";
(function () {
  const A = window.ELApp, EL = window.EL;
  if (!A || !EL) { console.error("subscriptions.js needs products.js and app.js loaded first"); return; }
  const { $, $$, h, money, store, toast, confirmDialog, products, productById, imgNode, on, cap, clampQty } = A;

  /* ===== 6. SUBSCRIPTION SCHEDULING =====
     COUNTING POLICY (shown to the shopper in step 1):
     - The first delivery is the chosen start date. All dates are LOCAL calendar dates (no UTC shifting).
     - Weekly repeats every 7 days. Monthly repeats on the same day of each month, anchored to the
       start day and shortened to the month's last day when needed (31 Jan → 28/29 Feb → 31 Mar).
     - The term ends on start date + N months. Only deliveries strictly BEFORE that end date count,
       so 1 month of weekly deliveries is 4 or 5 deliveries depending on the start date.
     - Day and time window are preferences only; no courier appointment is implied. */
  const pad = n => String(n).padStart(2, "0");
  const toISO = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function parseISO(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || "");
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null; // rejects 31 Feb etc.
  }
  const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
  const addDays = (d, k) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k); // never mutates d
  function addMonths(d, k) {
    const total = d.getMonth() + k, y = d.getFullYear() + Math.floor(total / 12), m = ((total % 12) + 12) % 12;
    return new Date(y, m, Math.min(d.getDate(), new Date(y, m + 1, 0).getDate()));
  }
  function schedule(startISO, frequency, termMonths) {
    const start = parseISO(startISO);
    if (!start) return [];
    const end = addMonths(start, termMonths), out = [];
    for (let k = 0; k < 400; k++) {
      const d = frequency === "weekly" ? addDays(start, 7 * k) : addMonths(start, k);
      if (d >= end) break;
      out.push(toISO(d));
    }
    return out;
  }
  const fmt = iso => { const d = parseISO(iso); return d ? d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "—"; };

  /* One pricing rule for builder, review, dashboard and plans: 10% subscriber saving on products,
     then flat shipping unless the discounted subtotal reaches ₹999. */
  function price(items) {
    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const saving = Math.round(subtotal * EL.SUBSCRIBE_DISCOUNT), after = subtotal - saving;
    const shipping = !subtotal || after >= 999 ? 0 : 60;
    return { subtotal, saving, shipping, perDelivery: after + shipping };
  }
  const loadSubs = () => {
    const raw = store.get("subs", []);
    return Array.isArray(raw) ? raw.filter(s => s && typeof s.id === "string" && ["active", "paused", "cancelled"].includes(s.status) && Array.isArray(s.schedule) && Array.isArray(s.items)) : [];
  };
  const saveSubs = list => store.set("subs", list);
  window.ELSub = Object.freeze({ schedule, parseISO, toISO, addDays, addMonths, fmt, today, price, loadSubs, saveSubs });

  /* ===== 7. SUBSCRIPTION BUILDER ===== */
  const STATES = ["Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Jammu and Kashmir", "Ladakh", "Lakshadweep", "Puducherry"];
  const FIELD_IDS = ["frequency", "duration", "startDate", "deliveryDay", "deliveryWindow", "customerName", "customerEmail", "customerPhone", "addressLine", "city", "state", "pinCode", "deliveryNotes", "isGift", "giftName", "giftMessage"];
  const RULES = {
    customerName: [v => v.trim().length >= 2, "Enter your full name."],
    customerEmail: [v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()), "Enter a valid email, like name@example.com."],
    customerPhone: [v => /^[6-9]\d{9}$/.test(v.trim()), "Enter a 10-digit Indian mobile number starting with 6 to 9."],
    addressLine: [v => v.trim().length >= 5, "Enter your house or flat, street and area."],
    city: [v => v.trim().length >= 2, "Enter your city."],
    state: [v => !!v, "Choose your state."],
    pinCode: [v => /^[1-9]\d{5}$/.test(v.trim()), "Enter a 6-digit PIN code."]
  };
  const B = { step: 1, type: "all", items: {}, planId: null }; // items: { [productId]: { pack, qty, grind } }
  const fieldEl = id => $("#" + id);

  const selectedItems = () => Object.entries(B.items).map(([id, s]) => {
    const p = productById(id);
    const unitPrice = p && EL.priceFor(p, s.pack);
    return p && p.stockStatus !== "out-of-stock" && unitPrice !== null ? { productId: id, name: p.name, type: p.type, pack: s.pack, qty: clampQty(s.qty), grind: p.type === "coffee" ? s.grind : "", unitPrice } : null;
  }).filter(Boolean);
  const term = () => Number($("#duration").value) || 1;
  const sched = () => schedule($("#startDate").value, $("#frequency").value, term());

  function updateSummary() {
    const items = selectedItems(), p = price(items), n = sched().length;
    $("#summaryFrequency").textContent = $("#frequency").value === "weekly" ? "Weekly" : "Monthly";
    $("#summaryDuration").textContent = `${term()} ${term() === 1 ? "month" : "months"}`;
    $("#summaryCount").textContent = n;
    $("#summaryItems").textContent = `${items.length} ${items.length === 1 ? "product" : "products"}`;
    $("#summarySubtotal").textContent = money(p.subtotal);
    $("#summarySaving").textContent = `−${money(p.saving)}`;
    $("#summaryShipping").textContent = p.shipping ? money(p.shipping) : "Free";
    $("#summaryDelivery").textContent = money(p.perDelivery);
    $("#summaryTotal").textContent = money(p.perDelivery * n);
  }

  function renderSchedule() {
    const dates = sched(), start = parseISO($("#startDate").value), err = $("#startDateError");
    const min = addDays(today(), 1), bad = !start || start < min;
    $("#startDate").setAttribute("aria-invalid", String(bad));
    err.textContent = bad ? `Choose a first delivery date from ${fmt(toISO(min))} onwards.` : "";
    $("#schedulePolicy").textContent = "How dates are counted: your first delivery is on the start date. Weekly repeats every 7 days; monthly repeats on the same day each month (shortened to the last day of shorter months). Only dates before the term end (start date plus the term) are included. Day and time are preferences, not courier appointments.";
    const shown = dates.slice(0, 12);
    $("#schedulePreview").replaceChildren(
      h("strong", { text: bad ? "No schedule yet." : `${dates.length} deliveries, ${fmt(dates[0])} to ${fmt(dates[dates.length - 1])}` }),
      !bad && h("p", { class: "field-help", text: `Term ends ${fmt(toISO(addMonths(start, term())))} (deliveries must fall before this date).` }),
      !bad && h("ol", {}, shown.map(d => h("li", { text: fmt(d) })), dates.length > 12 && h("li", { text: `…and ${dates.length - 12} more` })));
    updateSummary();
  }

  function renderPicker() {
    const list = products().filter(p => B.type === "all" || p.type === B.type);
    $("#blendPicker").replaceChildren(...list.map(p => {
      const s = B.items[p.id], out = p.stockStatus === "out-of-stock", cur = s || { pack: p.defaultPack, qty: 1, grind: "Whole bean" };
      const sel = (k, opts, label) => h("label", {}, label, h("select", { "data-k": k, "data-id": p.id, "aria-label": `${label} for ${p.name}` }, opts.map(([v, t]) => h("option", { value: v, text: t, selected: String(cur[k]) === String(v) }))));
      return h("article", { class: `blend-option${s ? " selected" : ""}` }, imgNode(p.imageKey, ""),
        h("div", { class: "blend-main" },
          h("div", { class: "blend-heading" }, h("strong", { text: p.name }), h("span", { text: money(EL.priceFor(p, cur.pack)) })),
          h("small", { text: `${cap(p.category)} ${p.type} · ${p.tastingNotes.join(", ")}${out ? " · Out of stock (demo)" : ""}` }),
          h("div", { class: "blend-controls" },
            h("label", { class: "blend-select" }, h("input", { type: "checkbox", "data-k": "include", "data-id": p.id, checked: !!s, disabled: out }), "Include"),
            sel("pack", p.packSizes.map(x => [x.label, x.label]), "Pack"),
            sel("qty", [1, 2, 3, 4, 5].map(n => [n, n]), "Qty"),
            p.type === "coffee" && sel("grind", p.grindOptions.map(g => [g, g]), "Grind"))));
    }));
  }

  function onPickerChange(e) {
    const t = e.target, id = t.dataset.id, k = t.dataset.k;
    if (!id) return;
    const box = t.closest(".blend-option"), read = key => (box.querySelector(`[data-k="${key}"]`) || {}).value;
    if (k === "include") {
      if (t.checked) B.items[id] = { pack: read("pack"), qty: Number(read("qty")), grind: read("grind") || "Whole bean" }; else delete B.items[id];
      box.classList.toggle("selected", t.checked);
    } else if (B.items[id]) {
      B.items[id][k] = k === "qty" ? Number(t.value) : t.value;
    }
    if (k === "pack") { const p = productById(id); box.querySelector(".blend-heading span").textContent = money(EL.priceFor(p, t.value)); }
    $("#blendError").textContent = "";
    clearPlan(); updateSummary(); saveDraft();
  }
  function clearPlan() { if (B.planId) { B.planId = null; $$("#duration option").forEach(o => { o.disabled = false; }); } }

  function addItems(list, merge) { // list: [{ productId, pack, qty }]; returns how many were skipped
    let skipped = 0;
    list.forEach(i => {
      const p = productById(i.productId);
      if (!p || p.stockStatus === "out-of-stock" || EL.priceFor(p, i.pack) === null) { skipped++; return; }
      const cur = B.items[i.productId];
      B.items[i.productId] = cur && merge ? (cur.pack === i.pack ? { ...cur, qty: clampQty(cur.qty + i.qty) } : cur) : { pack: i.pack, qty: clampQty(i.qty), grind: (cur && cur.grind) || "Whole bean" };
    });
    return skipped;
  }
  function importBag(lines) {
    const skipped = addItems(lines.map(l => ({ productId: l.id, pack: l.pack, qty: l.qty })), true);
    clearPlan(); renderPicker(); showStep(2);
    toast(skipped ? `Bag carried over. ${skipped} item(s) were unavailable and skipped.` : "Your bag items are now in the builder.", skipped ? "warning" : "success");
  }

  /* userAction = false (used once at start-up) skips moving focus, so the page doesn't scroll down to the builder. */
  function showStep(n, userAction = true) {
    B.step = n;
    $$("[data-panel]").forEach(p => p.classList.toggle("active", Number(p.dataset.panel) === n));
    $$("[data-step-indicator]").forEach(s => {
      const i = Number(s.dataset.stepIndicator);
      s.classList.toggle("active", i === n); s.classList.toggle("done", i < n);
      const sb = s.querySelector(".step-btn"); i === n ? sb.setAttribute("aria-current", "step") : sb.removeAttribute("aria-current");
    });
    if (n === 2) renderPicker();
    if (n === 4) renderReview();
    renderSchedule(); saveDraft();
    const heading = $(`[data-panel="${n}"] h3`); if (heading && userAction) heading.focus();
  }

  function validateStep(n) {
    if (n === 1) {
      renderSchedule();
      if ($("#startDate").getAttribute("aria-invalid") === "true") { $("#startDate").focus(); return false; }
    }
    if (n === 2 && !selectedItems().length) { $("#blendError").textContent = "Choose at least one available product to continue."; toast("Please include at least one product.", "warning"); return false; }
    if (n === 3) {
      let first = null;
      const check = (id, ok, msg) => { const el = fieldEl(id); el.setAttribute("aria-invalid", String(!ok)); $("#" + id + "Error").textContent = ok ? "" : msg; if (!ok && !first) first = el; };
      Object.entries(RULES).forEach(([id, [test, msg]]) => check(id, test(fieldEl(id).value), msg));
      check("giftName", !$("#isGift").checked || $("#giftName").value.trim().length >= 2, "Enter the recipient’s name.");
      if (first) { first.focus(); toast("Please fix the highlighted fields.", "error"); return false; }
    }
    return true;
  }

  function reviewData() {
    const items = selectedItems(), dates = sched(), p = price(items);
    return { items, dates, p, total: p.perDelivery * dates.length };
  }
  function renderReview() {
    const { items, dates, p, total } = reviewData(), v = id => fieldEl(id).value.trim();
    const row = (k, val) => h("tr", {}, h("th", { text: k }), h("td", {}, val));
    $("#reviewPanel").replaceChildren(h("table", { class: "review-table" }, h("tbody", {},
      row("Products", items.map(i => h("div", { text: `${i.name} × ${i.qty} (${i.pack}${i.grind ? `, ${i.grind}` : ""}) · ${money(i.unitPrice * i.qty)}` }))),
      row("Frequency and term", `${$("#frequency").value === "weekly" ? "Weekly" : "Monthly"} for ${term()} ${term() === 1 ? "month" : "months"}`),
      row("Deliveries", `${dates.length}, from ${fmt(dates[0])} to ${fmt(dates[dates.length - 1])}`),
      row("Preference", `${$("#deliveryDay").value}, ${$("#deliveryWindow").selectedOptions[0].textContent} (a preference, not an appointment)`),
      row("Deliver to", `${v("customerName")}, ${v("addressLine")}, ${v("city")}, ${v("state")} ${v("pinCode")}`),
      $("#isGift").checked && row("Gift for", `${v("giftName")}${v("giftMessage") ? ` — “${v("giftMessage")}”` : ""} (simulated, nobody is notified)`),
      row("Subtotal per delivery", money(p.subtotal)),
      row("Subscribe & save 10%", `−${money(p.saving)}`),
      row("Shipping per delivery", p.shipping ? money(p.shipping) : "Free (subtotal after saving is ₹999 or more)"),
      row("Estimated total per delivery", money(p.perDelivery)),
      row("Estimated total for the full term", `${money(total)} (${dates.length} × ${money(p.perDelivery)})`))),
      h("p", { class: "field-help", text: "Assumptions: today’s catalogue prices, no tax added in this demo, and the counting rule shown in step 1. Per-delivery and full-term totals are different numbers: the full term is the whole commitment." }));
  }

  function newId() { return "DEMO-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase(); }

  function submit(e) {
    e.preventDefault();
    if (B.step !== 4) return;
    const err = $("#termsError");
    if (!$("#termsCheck").checked) { err.textContent = "Please tick the box to confirm you understand this is a demo."; $("#termsCheck").focus(); return; }
    err.textContent = "";
    const { items, dates, p, total } = reviewData();
    if (!items.length || !dates.length) { toast("Your plan needs at least one available product and a valid start date.", "error"); return; }
    const v = id => fieldEl(id).value.trim();
    const sub = {
      id: newId(), status: "active", createdAt: toISO(today()), frequency: $("#frequency").value, term: term(), startDate: $("#startDate").value,
      deliveryDay: $("#deliveryDay").value, deliveryWindow: $("#deliveryWindow").selectedOptions[0].textContent,
      items: items.map(({ productId, name, pack, qty, grind, unitPrice }) => ({ productId, name, pack, qty, grind, unitPrice })),
      customer: { name: v("customerName"), email: v("customerEmail"), phone: v("customerPhone"), address: v("addressLine"), city: v("city"), state: v("state"), pin: v("pinCode"), notes: v("deliveryNotes") },
      gift: { isGift: $("#isGift").checked, name: v("giftName"), message: v("giftMessage") },
      schedule: dates, skipped: [], perDelivery: p.perDelivery, total, history: [{ at: toISO(today()), event: "Created (demo)" }]
    };
    if (!saveSubs([...loadSubs(), sub])) return; // the draft is NOT cleared unless the save succeeded
    store.remove("draft");
    showSuccess(sub);
    on_saved(sub);
  }
  function on_saved(sub) { A.emit("subscription-saved", sub); }

  function showSuccess(sub) {
    $("#subscriptionForm").hidden = true; $(".steps").hidden = true;
    const panel = $("#successPanel"); panel.hidden = false;
    $("#successDetails").replaceChildren(
      h("p", {}, h("strong", { text: `Demo order ID: ${sub.id}` })),
      h("p", { text: `${sub.items.map(i => `${i.name} × ${i.qty}`).join(", ")}. ${sub.schedule.length} deliveries, ${money(sub.perDelivery)} each, ${money(sub.total)} over the full term (estimates).` }),
      h("ol", { class: "sub-schedule" }, sub.schedule.map(d => h("li", { text: fmt(d) }))));
    if (!$("#buildAnother")) $("#successPanel .builder-actions").append(h("button", { id: "buildAnother", class: "button button-outline", type: "button", text: "Build another", on: { click: resetBuilder } }));
    $("#successTitle").focus();
  }
  function resetBuilder() {
    B.items = {}; B.planId = null; B.type = "all";
    $("#subscriptionForm").reset(); setDefaults();
    $("#subscriptionForm").hidden = false; $(".steps").hidden = false; $("#successPanel").hidden = true;
    $$("#duration option").forEach(o => { o.disabled = false; });
    showStep(1);
  }

  function saveDraft() {
    const fields = {}; FIELD_IDS.forEach(id => { const el = fieldEl(id); fields[id] = el.type === "checkbox" ? el.checked : el.value; });
    store.set("draft", { step: B.step, fields, items: B.items, planId: B.planId });
  }
  function restoreDraft() {
    const d = store.get("draft", null);
    if (!d || typeof d !== "object" || typeof d.fields !== "object") return;
    FIELD_IDS.forEach(id => { const el = fieldEl(id), val = d.fields[id]; if (val == null) return; if (el.type === "checkbox") el.checked = val === true; else if (typeof val === "string") el.value = val; });
    if (!$("#state").value) $("#state").value = "";
    Object.entries(d.items && typeof d.items === "object" ? d.items : {}).forEach(([id, s]) => { const p = productById(id); if (p && s && EL.priceFor(p, s.pack) !== null) B.items[id] = { pack: s.pack, qty: clampQty(s.qty), grind: typeof s.grind === "string" ? s.grind : "Whole bean" }; });
    $("#giftFields").hidden = !$("#isGift").checked;
    if (!parseISO($("#startDate").value) || parseISO($("#startDate").value) < addDays(today(), 1)) setDefaults(true);
  }
  function setDefaults(startOnly) {
    const min = toISO(addDays(today(), 1));
    $("#startDate").min = min; $("#startDate").value = toISO(addDays(today(), 3));
    if (startOnly) return;
    $("#frequency").value = "monthly"; $("#duration").value = "3";
  }

  /* NEW: click any step tab to jump to it. Going back is always allowed and never validates.
     Going forward checks every step on the way and stops at the first one that needs fixing. */
  function goToStep(target) {
    if (target <= B.step) return showStep(target);
    for (let i = B.step; i < target; i++) {
      if (!validateStep(i)) {
        if (i !== B.step) { showStep(i); const bad = $(`[data-panel="${i}"] [aria-invalid="true"]`); if (bad) bad.focus(); }
        return;
      }
    }
    showStep(target);
  }

  function initBuilder() {
    $("#state").append(...STATES.map(s => h("option", { value: s, text: s })));
    setDefaults(); restoreDraft();
    $$("[data-next]").forEach(b => b.addEventListener("click", () => { if (validateStep(B.step)) showStep(Number(b.dataset.next)); }));
    $$("[data-back]").forEach(b => b.addEventListener("click", () => showStep(Number(b.dataset.back)))); // going back never validates or discards progress
    $$("[data-goto]").forEach(b => b.addEventListener("click", () => goToStep(Number(b.dataset.goto))));
    ["frequency", "duration", "startDate", "deliveryDay", "deliveryWindow"].forEach(id => fieldEl(id).addEventListener("change", () => { renderSchedule(); saveDraft(); }));
    $("#subscriptionForm").addEventListener("input", e => { if (e.target.id && e.target.getAttribute("aria-invalid") === "true") e.target.setAttribute("aria-invalid", "false"); saveDraft(); updateSummary(); });
    $("#isGift").addEventListener("change", e => { $("#giftFields").hidden = !e.target.checked; });
    $("#blendPicker").addEventListener("change", onPickerChange);
    $$("[data-builder-type]").forEach(b => b.addEventListener("click", () => {
      B.type = b.dataset.builderType;
      $$("[data-builder-type]").forEach(x => { const a = x === b; x.classList.toggle("active", a); x.setAttribute("aria-pressed", String(a)); });
      renderPicker();
    }));
    $("#importCart").addEventListener("click", () => A.getCart().length ? importBag(A.getCart()) : toast("Your bag is empty.", "warning"));
    $("#subscriptionForm").addEventListener("submit", submit);
    on("bag-to-builder", importBag);
    on("catalogue-changed", () => { Object.keys(B.items).forEach(id => { if (!productById(id)) delete B.items[id]; }); if (B.step === 2) renderPicker(); updateSummary(); });
    showStep(B.step === 4 || B.step === 3 ? 1 : (B.step || 1), false); // a restored draft re-opens on step 1 so dates are re-checked; no focus jump on load
  }

  /* ===== 8. CURATED PLANS ===== */
  const cadence = p => `${cap(p.frequency)} · ${p.durations.join(", ")} months`;

  /* NEW: plan price from the live catalogue (includes admin price edits), same 10% saving as the builder. */
  const planCost = pl => Math.round(pl.items.reduce((s, i) => s + (EL.priceFor(productById(i.productId, true), i.pack) || 0) * i.quantity, 0) * (1 - EL.SUBSCRIBE_DISCOUNT));
  const CF = { all: () => true, coffee: p => p.type === "coffee", tea: p => p.type === "tea", mixed: p => p.type === "mixed", gift: p => p.gift, weekly: p => p.frequency === "weekly", under: p => planCost(p) < 1000 };
  const C = { filter: "all", picked: ["plan-a", "plan-d", "plan-f"], diff: false };
  const pname = i => productById(i.productId, true).name;

  function togglePick(id) {
    const i = C.picked.indexOf(id);
    if (i > -1) { if (C.picked.length === 1) return toast("Keep at least one plan selected.", "warning"); C.picked.splice(i, 1); }
    else { if (C.picked.length === 4) { C.picked.shift(); toast("Comparing up to 4 plans, so the oldest pick was swapped out."); } C.picked.push(id); }
    renderCompare();
  }
  function renderCompare() {
    const visible = EL.PLANS.filter(CF[C.filter]);
    C.picked = C.picked.filter(id => visible.some(p => p.id === id));
    if (!C.picked.length) C.picked = visible.slice(0, 3).map(p => p.id);
    const picked = C.picked.map(id => EL.PLANS.find(p => p.id === id)), multi = picked.length > 1;
    $("#compareChips").replaceChildren(...visible.map(pl => {
      const on_ = C.picked.includes(pl.id);
      return h("button", { class: `compare-chip${on_ ? " on" : ""}`, type: "button", "aria-pressed": String(on_), on: { click: () => togglePick(pl.id) } }, h("b", { text: pl.letter }), pl.name, h("small", { text: money(planCost(pl)) }));
    }));
    $("#compareHint").textContent = multi ? `Comparing ${picked.length} plans. Tap a chip to add or remove one (up to 4).` : "Pick another plan to compare side by side.";
    const costs = picked.map(planCost), cheapest = Math.min(...costs), top = Math.max(...costs), most = Math.max(...picked.map(p => p.items.length));
    const rows = [
      ["Type", p => cap(p.type)],
      ["Products", p => p.items.map(pname).join(", "), p => h("ul", { class: "compare-list" }, p.items.map(i => h("li", { text: `${pname(i)} · ${i.pack}${i.quantity > 1 ? ` × ${i.quantity}` : ""}` })))],
      ["Frequency", cadence], ["Customisation", p => p.customisation], ["Caffeine", p => p.caffeine],
      ["Good as a gift", p => p.gift ? "Yes" : "Not specifically"], ["Best for", p => p.audience]
    ].filter(([, t]) => !(C.diff && multi && picked.every(p => t(p) === t(picked[0]))));
    $("#planCompare").replaceChildren(
      h("thead", {}, h("tr", {}, h("th", { scope: "col", text: "Compare" }), picked.map(pl => h("th", { scope: "col", class: "plan-col" },
        imgNode(pl.imageKey, ""), h("span", { class: "plan-letter", text: `Plan ${pl.letter}` }), h("strong", { text: pl.name }), pl.badge && h("span", { class: "pill", text: pl.badge }),
        multi && h("button", { class: "text-btn", type: "button", text: "Remove", "aria-label": `Remove plan ${pl.letter} from comparison`, on: { click: () => togglePick(pl.id) } }))))),
      h("tbody", {},
        h("tr", {}, h("th", { scope: "row", text: "Price per delivery" }), picked.map(pl => {
          const c = planCost(pl);
          return h("td", {}, h("strong", { class: "compare-price", text: money(c) }), h("span", { class: "price-bar" }, h("i", { style: `width:${Math.round(c / top * 100)}%` })), multi && c === cheapest && h("span", { class: "pill best", text: "Lowest price" }));
        })),
        h("tr", {}, h("th", { scope: "row", text: "Products per delivery" }), picked.map(pl => h("td", {}, `${pl.items.length}`, multi && pl.items.length === most && most > Math.min(...picked.map(p => p.items.length)) && h("span", { class: "pill best", text: "Most variety" })))),
        rows.map(([label, t, node]) => h("tr", {}, h("th", { scope: "row", text: label }), picked.map(pl => h("td", {}, node ? node(pl) : t(pl))))),
        h("tr", {}, h("th", { scope: "row", text: "Savings" }), picked.map(pl => h("td", { text: pl.savings }))),
        h("tr", {}, h("td", {}), picked.map(pl => h("td", {}, h("button", { class: "button button-dark", type: "button", text: "Choose this plan", on: { click: () => choosePlan(pl) } })))))
    );
  }

  function planCard(pl) {
    const names = pl.items.map(i => { const p = productById(i.productId, true); return `${p.name} (${i.pack}${i.quantity > 1 ? ` × ${i.quantity}` : ""})`; });
    return h("article", { class: "plan-card" }, imgNode(pl.imageKey, `${pl.name} plan`),
      h("div", { class: "plan-body" },
        h("span", { class: "plan-letter", text: `Plan ${pl.letter}` }), pl.badge && h("span", { class: "pill", text: pl.badge }),
        h("h3", { text: pl.name }), h("p", { text: pl.description }),
        h("p", { class: "plan-meta", text: names.join(" · ") }),
        h("p", { class: "plan-meta", text: cadence(pl) }),
        h("p", { class: "plan-price", text: `${money(planCost(pl))} per delivery` }),
        h("p", { class: "plan-meta", text: `${pl.savings}. Before shipping.` }),
        h("button", { class: "button button-dark", type: "button", text: "Choose this plan", "aria-label": `Choose plan ${pl.letter}, ${pl.name}`, on: { click: () => choosePlan(pl) } })));
  }
  function renderPlans() {
    $("#plansGrid").replaceChildren(...EL.PLANS.map(planCard));
    renderCompare();
  }

  async function choosePlan(pl) {
    let merge = false;
    if (Object.keys(B.items).length) {
      const r = await confirmDialog({ title: "You already have a selection", text: `Plan ${pl.letter} (${pl.name}) can replace what you picked, or be merged into it.`, ok: "Replace my selection", alt: "Merge into it", cancel: "Cancel" });
      if (r === "cancel") return;
      merge = r === "alt";
    }
    if (!merge) B.items = {};
    const skipped = addItems(pl.items, merge);
    B.planId = pl.id;
    $("#frequency").value = pl.frequency;
    $("#duration").value = String(pl.durations.includes(term()) ? term() : pl.durations[0]);
    $$("#duration option").forEach(o => { o.disabled = !pl.durations.includes(Number(o.value)); }); // only the plan's supported terms
    $("#subscription").scrollIntoView();
    showStep(2);
    toast(skipped ? `Plan ${pl.letter} added; ${skipped} item(s) are unavailable right now.` : `Plan ${pl.letter} is ready in the builder.`, skipped ? "warning" : "success");
  }

  A.register(() => {
    renderPlans(); initBuilder(); on("catalogue-changed", renderPlans);
    // NEW: plan comparison controls (quick filters and "differences only")
    $$("[data-cf]").forEach(b => b.addEventListener("click", () => {
      C.filter = b.dataset.cf; C.picked = [];
      $$("[data-cf]").forEach(x => { const a = x === b; x.classList.toggle("active", a); x.setAttribute("aria-pressed", String(a)); });
      renderCompare();
    }));
    $("#compareDiff").addEventListener("change", e => { C.diff = e.target.checked; renderCompare(); });
  });
})();