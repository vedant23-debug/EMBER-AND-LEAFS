/* EMBER & LEAF — extras.js
   Sections: 9 Quiz · 10 Customer dashboard · 11 Admin portal (demo).
   Loads after subscriptions.js. All data lives in THIS browser's localStorage (no backend),
   so the admin portal only sees orders placed in the same browser. */
"use strict";
(function () {
  const A = window.ELApp, EL = window.EL, S = window.ELSub;
  if (!A || !EL || !S) { console.error("extras.js needs products.js, app.js and subscriptions.js first"); return; }
  const { $, h, money, store, toast, confirmDialog, products, allProducts, productById, imgNode, on, emit, cap } = A;

  const todayISO = () => S.toISO(S.today());
  const upcoming = s => s.schedule.filter(d => d >= todayISO() && !s.skipped.includes(d)); // original schedule minus skipped
  const seq = (start, freq, n) => { const d = S.parseISO(start); return Array.from({ length: n }, (_, k) => S.toISO(freq === "weekly" ? S.addDays(d, 7 * k) : S.addMonths(d, k))); };
  const itemLine = i => `${i.name} × ${i.qty} (${i.pack}${i.grind ? `, ${i.grind}` : ""})`;
  const addrOf = s => `${s.customer.address}, ${s.customer.city}, ${s.customer.state} ${s.customer.pin}`;
  const tbl = (heads, rows) => [
    h("thead", {}, h("tr", {}, heads.map(t => h("th", { scope: "col", text: t })))),
    h("tbody", {}, rows.length ? rows.map(r => h("tr", {}, r.map(c => h("td", {}, c)))) : h("tr", {}, h("td", { colspan: heads.length, text: "Nothing to show yet." })))];
  const scroller = (label, table) => h("div", { class: "table-scroll", role: "region", "aria-label": label, tabindex: "0" }, table);

  /* ===== 9. FIND YOUR BLEND QUIZ ===== */
  const QZ = [
    { q: "What do you love most in a cup?", o: [["sweet", "Sweet and smooth"], ["fruity", "Bright and fruity"], ["bold", "Bold and rich"], ["floral", "Light and floral"]] },
    { q: "How much caffeine do you want?", o: [["full", "Full caffeine"], ["low", "Gentle, a little caffeine"], ["none", "None at all"]] },
    { q: "How will you brew it?", o: [["espresso", "Espresso machine"], ["filter", "Filter or pour-over"], ["press", "French press or moka pot"], ["kettle", "Kettle and infuser (tea)"], ["cold", "Cold brew"]] },
    { q: "When will you drink it most?", o: [["morning", "Morning"], ["afternoon", "Afternoon"], ["evening", "Evening"]] },
    { q: "Classic or adventurous?", o: [["classic", "Classic favourites"], ["adventurous", "Something different"]] }
  ];
  const Q = { i: 0, a: [] };

  /* Transparent scoring: every rule adds fixed points. Ties break on rating, then name. Missing answers add nothing. */
  function score(p, a) {
    let pts = 0; const why = [], f = p.flavourProfile, notes = p.tastingNotes.join(" ");
    const add = (n, t) => { if (n > 0) { pts += n; why.push(t); } };
    if (a[0] === "sweet") add(f.sweetness * 2, `sweetness ${f.sweetness}/5`);
    if (a[0] === "fruity") add(f.acidity * 2, `bright acidity ${f.acidity}/5`);
    if (a[0] === "bold") add(f.body * 2, `full body ${f.body}/5`);
    if (a[0] === "floral") add((6 - f.body) * 2 + (/floral|jasmine|rose|orchid|chamomile|flowers/.test(notes) ? 4 : 0), "light, floral character");
    if (a[1] === "full") add({ high: 3, medium: 2 }[p.caffeineLevel] || 0, "good caffeine kick");
    if (a[2] === "espresso" && p.category === "espresso") add(6, "made for espresso machines");
    if (a[2] === "filter" && p.type === "coffee" && ["filter", "single-origin"].includes(p.category)) add(5, "suits filter brewing");
    if (a[2] === "press" && p.type === "coffee" && ["blend", "single-origin"].includes(p.category)) add(4, "works well in a press or moka pot");
    if (a[2] === "kettle" && p.type === "tea") add(6, "loose-leaf tea for a kettle and infuser");
    if (a[2] === "cold" && p.category === "cold-brew") add(6, "ground for cold brew");
    if (a[3] === "morning" && p.caffeineLevel === "high") add(2, "good for mornings");
    if (a[3] === "afternoon" && p.caffeineLevel === "medium") add(2, "a steady afternoon cup");
    if (a[3] === "evening" && ["none", "low"].includes(p.caffeineLevel)) add(2, "gentle for evenings");
    if (a[4] === "classic" && (/classic|favourite|cosy/i.test(p.badge) || p.rating >= 4.7)) add(3, "a well-loved classic");
    if (a[4] === "adventurous" && ["seasonal", "white", "oolong", "single-origin"].includes(p.category)) add(3, "a more adventurous pick");
    return { p, pts, why: why.slice(0, 3).join(", ") || "a balanced all-rounder" };
  }
  function recommend(a) {
    return products().filter(p => p.stockStatus !== "out-of-stock" && (a[1] !== "none" || p.caffeineLevel === "none") && (a[1] !== "low" || p.caffeineLevel !== "high"))
      .map(p => score(p, a)).sort((x, y) => y.pts - x.pts || y.p.rating - x.p.rating || x.p.name.localeCompare(y.p.name)).slice(0, 3);
  }
  function renderQuiz() {
    const done = Q.i >= QZ.length;
    $("#quizForm").hidden = done; $("#quizResults").hidden = !done;
    $("#quizProgress").value = Math.min(Q.i, 5);
    if (done) {
      const recs = recommend(Q.a);
      $("#quizStatus").textContent = "Your three picks";
      $("#quizResults").replaceChildren(
        h("ol", { class: "result-list" }, recs.map(r => h("li", {}, imgNode(r.p.imageKey, r.p.name), h("div", {}, h("strong", { text: r.p.name }), h("p", { text: `Why: ${r.why}.` }), h("span", { class: "product-price", text: `${money(EL.priceFor(r.p, r.p.defaultPack))} / ${r.p.defaultPack}` }))))),
        h("div", { class: "builder-actions" },
          h("button", { class: "button button-outline", type: "button", text: "Retake the quiz", on: { click: () => { Q.i = 0; Q.a = []; renderQuiz(); } } }),
          h("button", { class: "button button-dark", type: "button", text: "Add these to my subscription", on: { click: () => { $("#subscription").scrollIntoView(); emit("bag-to-builder", recs.map(r => ({ id: r.p.id, pack: r.p.defaultPack, qty: 1 }))); } } })));
      return;
    }
    const cur = QZ[Q.i];
    $("#quizStatus").textContent = `Question ${Q.i + 1} of ${QZ.length}`;
    $("#quizLegend").textContent = cur.q;
    $("#quizOptions").replaceChildren(...cur.o.map(([v, t]) => h("label", { class: "quiz-option" }, h("input", { type: "radio", name: "quiz", value: v, checked: Q.a[Q.i] === v }), t)));
    $("#quizBack").hidden = Q.i === 0;
    $("#quizNext").textContent = Q.i === QZ.length - 1 ? "See my picks" : "Next question";
  }
  function initQuiz() {
    $("#quizForm").addEventListener("submit", e => {
      e.preventDefault();
      const pick = $("#quizForm input[name=quiz]:checked");
      if (!pick) { $("#quizStatus").textContent = `Question ${Q.i + 1} of ${QZ.length}: please choose an answer.`; return; }
      Q.a[Q.i] = pick.value; Q.i++; renderQuiz();
      if (Q.i < QZ.length) $("#quizLegend").focus?.();
    });
    $("#quizBack").addEventListener("click", () => { Q.i = Math.max(0, Q.i - 1); renderQuiz(); });
    renderQuiz();
  }

  /* ===== 10. CUSTOMER DASHBOARD =====
     Skip marks the next date as skipped and keeps the original schedule (shown struck through).
     Pause holds the plan. Resume rebuilds the REMAINING deliveries (same count, same rhythm) starting from the next
     original date, or tomorrow if that date has passed; past dates are kept. */
  const edit = { id: null, items: [] };
  const can = { skip: s => s.status === "active" && upcoming(s).length > 0, pause: s => s.status === "active", resume: s => s.status === "paused", edit: s => s.status !== "cancelled", cancel: s => s.status !== "cancelled" };

  function mutate(id, action, note) {
    const list = S.loadSubs(), s = list.find(x => x.id === id);
    if (!s || !can[action](s)) { toast("That action isn’t available for this subscription.", "warning"); return; }
    const t = todayISO();
    if (action === "skip") s.skipped.push(upcoming(s)[0]);
    if (action === "pause") s.status = "paused";
    if (action === "cancel") s.status = "cancelled";
    if (action === "resume") {
      const up = upcoming(s), tomorrow = S.toISO(S.addDays(S.today(), 1)), past = s.schedule.filter(d => d < t);
      if (up.length) { s.schedule = [...past, ...seq(up[0] >= tomorrow ? up[0] : tomorrow, s.frequency, up.length)]; s.skipped = s.skipped.filter(d => past.includes(d)); }
      s.status = "active";
    }
    s.history.push({ at: t, event: note });
    if (S.saveSubs(list)) { toast(`${note}.`); emit("subs-changed"); renderDashboard(); }
  }
  async function cancelSub(s) {
    const r = await confirmDialog({ title: "Cancel this subscription?", text: `${s.id} will be marked cancelled in this browser. No real payment or courier system is involved.`, ok: "Cancel subscription", cancel: "Keep it" });
    if (r === "ok") mutate(s.id, "cancel", "Cancelled (demo)");
  }
  function startEdit(s) { edit.id = s.id; edit.items = s.items.map(i => ({ ...i })); renderDashboard(); }
  function saveEdit(s) {
    if (!edit.items.length) { toast("Keep at least one product, or cancel the subscription instead.", "error"); return; }
    const list = S.loadSubs(), t = list.find(x => x.id === s.id);
    t.items = edit.items; t.perDelivery = S.price(t.items).perDelivery;
    t.total = t.perDelivery * t.schedule.filter(d => !t.skipped.includes(d)).length;
    t.history.push({ at: todayISO(), event: "Products or quantities changed" });
    if (S.saveSubs(list)) { edit.id = null; toast("Subscription updated."); emit("subs-changed"); renderDashboard(); }
  }
  function editor(s) {
    const avail = products().filter(p => p.stockStatus !== "out-of-stock" && !edit.items.some(i => i.productId === p.id));
    const pick = h("select", { id: `add-${s.id}`, "aria-label": "Product to add" }, avail.map(p => h("option", { value: p.id, text: `${p.name} (${p.defaultPack}) ${money(EL.priceFor(p, p.defaultPack))}` })));
    return h("div", { class: "notice" },
      edit.items.map((i, k) => h("div", { class: "blend-controls" }, h("span", { text: `${i.name} (${i.pack})` }),
        h("select", { "aria-label": `Quantity of ${i.name}`, on: { change: e => { i.qty = Number(e.target.value); } } }, [1, 2, 3, 4, 5].map(n => h("option", { value: n, text: n, selected: n === i.qty }))),
        h("button", { class: "text-btn", type: "button", text: "Remove", "aria-label": `Remove ${i.name}`, on: { click: () => { edit.items.splice(k, 1); renderDashboard(); } } }))),
      avail.length > 0 && h("div", { class: "blend-controls" }, pick, h("button", { class: "button button-outline", type: "button", text: "Add product", on: { click: () => { const p = productById(pick.value); edit.items.push({ productId: p.id, name: p.name, pack: p.defaultPack, qty: 1, grind: p.type === "coffee" ? "Whole bean" : "", unitPrice: EL.priceFor(p, p.defaultPack) }); renderDashboard(); } } })),
      h("div", { class: "sub-actions" }, h("button", { class: "button button-dark", type: "button", text: "Save changes", on: { click: () => saveEdit(s) } }), h("button", { class: "button button-outline", type: "button", text: "Discard", on: { click: () => { edit.id = null; renderDashboard(); } } })));
  }
  function subCard(s) {
    const up = upcoming(s), btn = (label, action, fn) => can[action](s) && h("button", { class: "button button-outline", type: "button", text: label, on: { click: fn || (() => mutate(s.id, action, { skip: "Next delivery skipped", pause: "Paused", resume: "Resumed" }[action])) } });
    return h("article", { class: "sub-card" },
      h("header", {}, h("h3", { text: s.id }), h("span", { class: `pill ${s.status}`, text: cap(s.status) })),
      h("p", { class: "plan-meta", text: `${cap(s.frequency)} for ${s.term} months · ${money(s.perDelivery)} per delivery · ${money(s.total)} estimated total` }),
      h("p", { text: s.items.map(itemLine).join(" · ") }),
      h("p", { class: "plan-meta", text: `${s.customer.name} · ${addrOf(s)}` }),
      h("p", { class: "plan-meta", text: s.status === "cancelled" ? "Cancelled: no further deliveries." : s.status === "paused" ? `Paused. ${up.length} deliveries will be rescheduled when you resume.` : `Next delivery: ${up.length ? S.fmt(up[0]) : "none left"} · ${up.length} remaining` }),
      h("ul", { class: "sub-schedule", "aria-label": "Delivery schedule" }, s.schedule.slice(0, 8).map(d => h("li", { class: s.skipped.includes(d) ? "skipped" : "", text: `${S.fmt(d)}${s.skipped.includes(d) ? " (skipped)" : ""}` })), s.schedule.length > 8 && h("li", { text: `…and ${s.schedule.length - 8} more` })),
      edit.id === s.id ? editor(s) : h("div", { class: "sub-actions" }, btn("Skip next", "skip"), btn("Pause", "pause"), btn("Resume", "resume"), btn("Change products", "edit", () => startEdit(s)), btn("Cancel", "cancel", () => cancelSub(s))),
      h("details", {}, h("summary", { text: "History" }), h("ul", { class: "sub-schedule" }, s.history.map(x => h("li", { text: `${x.at}: ${x.event}` })))));
  }
  function renderDashboard() {
    const list = S.loadSubs().reverse();
    $("#dashboardEmpty").hidden = list.length > 0;
    $("#dashboardList").replaceChildren(...list.map(subCard));
  }

  /* ===== 11. ADMIN PORTAL (DEMO ONLY) =====
     The PIN is a front-end convenience, NOT security: anyone can read it in this file.
     Change it here. Real access control, real orders and real stock need a backend. */
  const ADMIN_PIN = "2468";
  const LOW_STOCK_AT = 5, DEFAULT_QTY = { "in-stock": 50, "low-stock": 4, "out-of-stock": 0 }; // starting demo units, editable below
  const FULFIL = ["pending", "packed", "dispatched", "delivered"];
  const ovr = () => { const o = store.get("overrides", {}); return o && typeof o === "object" && !Array.isArray(o) ? o : {}; };
  const stockOf = p => { const o = ovr()[p.id]; return o && Number.isInteger(o.stockQty) && o.stockQty >= 0 ? o.stockQty : (DEFAULT_QTY[p.stockStatus] ?? 50); };
  const committed = () => { const m = {}; S.loadSubs().filter(s => s.status === "active").forEach(s => { const n = upcoming(s).length; s.items.forEach(i => { m[i.productId] = (m[i.productId] || 0) + i.qty * n; }); }); return m; };

  function download(name, rows) {
    const q = v => { let t = String(v ?? ""); if (/^[=+\-@]/.test(t)) t = "'" + t; return `"${t.replace(/"/g, '""')}"`; }; // blocks spreadsheet formula injection
    const a = h("a", { href: URL.createObjectURL(new Blob(["\ufeff" + rows.map(r => r.map(q).join(",")).join("\r\n")], { type: "text/csv" })), download: name });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function initAdmin() {
    const dlg = $("#adminDialog"), panel = $("#adminPanel"); let built = false;
    let metrics, search, status, range, ordersT, delivT, stockT, dRows = [], sRows = [], tabs = {};
    const field = (label, input) => h("div", { class: "field-block" }, h("label", { for: input.id, text: label }), input);

    const orders = () => { const t = search.value.trim().toLowerCase(); return S.loadSubs().filter(s => (!status.value || s.status === status.value) && (!t || [s.id, s.customer.name, s.customer.email, s.customer.phone, addrOf(s), ...s.items.map(i => i.name)].join(" ").toLowerCase().includes(t))); };
    const deliveries = () => {
      const t = todayISO(), lim = range.value === "7" ? S.toISO(S.addDays(S.today(), 7)) : range.value === "30" ? S.toISO(S.addDays(S.today(), 30)) : null, out = [];
      S.loadSubs().filter(s => s.status === "active").forEach(s => s.schedule.filter(d => !s.skipped.includes(d)).forEach(d => {
        const st = (s.fulfilment || {})[d] || "pending";
        if (range.value === "overdue" ? !(d < t && st !== "delivered") : range.value === "all" ? false : (d < t || (lim && d > lim))) return;
        out.push({ s, d, st });
      }));
      return out.sort((x, y) => x.d.localeCompare(y.d) || x.s.id.localeCompare(y.s.id));
    };

    function paintMetrics() {
      const subs = S.loadSubs(), act = subs.filter(s => s.status === "active"), wk = S.toISO(S.addDays(S.today(), 7)), c = committed();
      const stats = [["Orders", subs.length], ["Active", act.length], ["Paused / cancelled", subs.length - act.length], ["Deliveries, next 7 days", act.reduce((n, s) => n + upcoming(s).filter(d => d <= wk).length, 0)], ["Committed value (est.)", money(act.reduce((n, s) => n + s.perDelivery * upcoming(s).length, 0))], ["Low or out of stock", allProducts().filter(p => stockOf(p) <= LOW_STOCK_AT).length], ["Short on stock", allProducts().filter(p => (c[p.id] || 0) > stockOf(p)).length]];
      metrics.replaceChildren(...stats.map(([k, v]) => h("div", {}, h("strong", { text: v }), k)));
    }
    function paintOrders() {
      const list = orders();
      ordersT.replaceChildren(...tbl(["Order", "Customer", "Items ordered", "Deliver to", "Plan", "Status", "Next delivery", "Per delivery"], list.map(s => [
        h("div", {}, h("strong", { text: s.id }), h("small", { text: ` ${s.createdAt}` })),
        h("div", {}, h("div", { text: s.customer.name }), h("small", { text: `${s.customer.email} · ${s.customer.phone}` }), s.gift.isGift && h("small", { text: `Gift for ${s.gift.name}` })),
        s.items.map(i => h("div", { text: itemLine(i) })), addrOf(s),
        `${cap(s.frequency)}, ${s.term} mo, from ${S.fmt(s.startDate)}`, h("span", { class: `pill ${s.status}`, text: cap(s.status) }),
        upcoming(s)[0] ? S.fmt(upcoming(s)[0]) : "—", money(s.perDelivery)])));
    }
    function paintDeliveries() {
      dRows = deliveries();
      delivT.replaceChildren(...tbl(["Date", "Order", "Deliver to", "Items to pack", "Window", "Status"], dRows.map(({ s, d, st }) => [
        S.fmt(d), s.id,
        h("div", {}, h("strong", { text: s.gift.isGift ? `${s.gift.name} (gift from ${s.customer.name})` : s.customer.name }), h("div", { text: addrOf(s) }), h("small", { text: `Phone ${s.customer.phone}${s.customer.notes ? ` · Note: ${s.customer.notes}` : ""}` })),
        s.items.map(i => h("div", { text: itemLine(i) })), s.deliveryWindow,
        h("select", { "aria-label": `Fulfilment status for ${s.id} on ${d}`, on: { change: e => { const list = S.loadSubs(), t = list.find(x => x.id === s.id); if (!t || !FULFIL.includes(e.target.value)) return; t.fulfilment = { ...(t.fulfilment || {}), [d]: e.target.value }; if (S.saveSubs(list)) { toast(`${s.id}: ${e.target.value}.`); paintMetrics(); } } } }, FULFIL.map(v => h("option", { value: v, text: cap(v), selected: v === st })))])));
    }
    function paintStock() {
      const c = committed(); sRows = [];
      stockT.replaceChildren(...tbl(["Product", "Base price ₹", "Stock units", "Committed (active plans)", "Left after commitments", "Status", "Shown in shop"], allProducts().map(p => {
        const price = h("input", { type: "number", min: "1", step: "1", value: p.basePrice, "aria-label": `Base price for ${p.name}` }), qty = h("input", { type: "number", min: "0", step: "1", value: stockOf(p), "aria-label": `Stock units for ${p.name}` }), vis = h("input", { type: "checkbox", checked: p.visible, "aria-label": `Show ${p.name} in shop` });
        sRows.push({ p, price, qty, vis }); const left = stockOf(p) - (c[p.id] || 0);
        return [`${p.name} (${p.defaultPack} price)`, price, qty, c[p.id] || 0, h("strong", { text: left < 0 ? `Short by ${-left}` : left }), stockOf(p) === 0 ? "Out" : stockOf(p) <= LOW_STOCK_AT ? "Low" : "OK", vis];
      })));
    }
    function saveStock() {
      const o = {}; let bad = null;
      sRows.forEach(r => {
        const pr = Number(r.price.value), q = Number(r.qty.value);
        const okP = r.price.value.trim() !== "" && Number.isFinite(pr) && pr > 0 && pr <= 100000, okQ = r.qty.value.trim() !== "" && Number.isInteger(q) && q >= 0 && q <= 100000;
        r.price.setAttribute("aria-invalid", String(!okP)); r.qty.setAttribute("aria-invalid", String(!okQ));
        if (!bad && (!okP || !okQ)) bad = okP ? r.qty : r.price;
        o[r.p.id] = { basePrice: Math.round(pr), stockQty: q, stockStatus: q === 0 ? "out-of-stock" : q <= LOW_STOCK_AT ? "low-stock" : "in-stock", visible: r.vis.checked };
      });
      if (bad) { bad.focus(); toast("Prices must be positive numbers and stock a whole number of 0 or more.", "error"); return; }
      if (store.set("overrides", o)) { A.refreshCatalogue(); toast("Saved. Shop prices, stock and visibility are updated."); paintStock(); paintMetrics(); }
    }
    const paintAll = () => { paintMetrics(); paintOrders(); paintDeliveries(); paintStock(); };
    function show(k) { Object.entries(tabs).forEach(([n, t]) => { const on_ = n === k; t.b.setAttribute("aria-selected", String(on_)); t.b.classList.toggle("active", on_); t.p.hidden = !on_; }); }

    function build() {
      search = h("input", { id: "adminSearch", type: "search", placeholder: "Name, email, phone, order ID, product", on: { input: paintOrders } });
      status = h("select", { id: "adminStatus", on: { change: paintOrders } }, [["", "All"], ["active", "Active"], ["paused", "Paused"], ["cancelled", "Cancelled"]].map(([v, t]) => h("option", { value: v, text: t })));
      range = h("select", { id: "adminRange", on: { change: paintDeliveries } }, [["7", "Next 7 days"], ["30", "Next 30 days"], ["all", "All upcoming"], ["overdue", "Overdue, not delivered"]].map(([v, t]) => h("option", { value: v, text: t })));
      metrics = h("div", { class: "admin-metrics" });
      ordersT = h("table", { class: "compare-table" }); delivT = h("table", { class: "compare-table" }); stockT = h("table", { class: "compare-table" });
      const panes = {
        orders: [h("div", { class: "filter-panel" }, field("Search orders", search), field("Status", status), h("button", { class: "button button-outline", type: "button", text: "Download orders CSV", on: { click: () => download("ember-leaf-orders.csv", [["Order", "Status", "Name", "Email", "Phone", "Address", "Items", "Frequency", "Term months", "Start", "Per delivery", "Estimated total"], ...orders().map(s => [s.id, s.status, s.customer.name, s.customer.email, s.customer.phone, addrOf(s), s.items.map(itemLine).join("; "), s.frequency, s.term, s.startDate, s.perDelivery, s.total])]) } })), scroller("Orders", ordersT)],
        deliveries: [h("div", { class: "filter-panel" }, field("Show", range), h("button", { class: "button button-outline", type: "button", text: "Download packing list CSV", on: { click: () => download("ember-leaf-deliveries.csv", [["Date", "Order", "Deliver to", "Phone", "Address", "Items to pack", "Window", "Status"], ...dRows.map(({ s, d, st }) => [d, s.id, s.gift.isGift ? s.gift.name : s.customer.name, s.customer.phone, addrOf(s), s.items.map(itemLine).join("; "), s.deliveryWindow, st])]) } })), scroller("Deliveries", delivT)],
        stock: [h("p", { class: "notice", text: `Starting stock units are demo numbers (in stock 50, low 4, out 0) until you edit them. Status is automatic: 0 is out, ${LOW_STOCK_AT} or fewer is low. “Committed” counts packs needed for all remaining deliveries of active plans.` }), scroller("Stock and products", stockT),
          h("div", { class: "builder-actions" },
            h("button", { class: "button button-outline", type: "button", text: "Reset prices and stock", on: { click: async () => { if (await confirmDialog({ title: "Reset prices and stock?", text: "This restores the original demo catalogue. Orders are not affected.", ok: "Reset" }) === "ok") { store.remove("overrides"); A.refreshCatalogue(); paintStock(); paintMetrics(); toast("Catalogue reset to the demo defaults."); } } } }),
            h("button", { class: "button button-outline", type: "button", text: "Delete all demo orders", on: { click: async () => { if (await confirmDialog({ title: "Delete all demo orders?", text: "Every saved subscription in this browser will be removed. This cannot be undone.", ok: "Delete orders" }) === "ok") { store.set("subs", []); emit("subs-changed"); renderDashboard(); paintAll(); toast("All demo orders deleted.", "warning"); } } } }),
            h("button", { class: "button button-dark", type: "button", text: "Save changes", on: { click: saveStock } }))]
      };
      const labels = { orders: "Orders", deliveries: "Deliveries", stock: "Stock and products" };
      const list = h("div", { class: "filter-tabs", role: "tablist", "aria-label": "Admin sections" });
      Object.keys(panes).forEach(k => {
        const b = h("button", { class: "filter-tab", type: "button", role: "tab", id: `tab-${k}`, "aria-controls": `pane-${k}`, text: labels[k], on: { click: () => { show(k); paintAll(); } } });
        tabs[k] = { b, p: h("section", { role: "tabpanel", id: `pane-${k}`, "aria-labelledby": `tab-${k}` }, panes[k]) };
        list.append(b);
      });
      panel.replaceChildren(metrics, list, ...Object.values(tabs).map(t => t.p));
      show("orders");
    }

    $("#openAdmin").addEventListener("click", () => A.openDialog(dlg));
    $("#closeAdmin").addEventListener("click", () => A.closeDialog(dlg));
    dlg.addEventListener("close", () => { panel.hidden = true; $("#adminPinForm").hidden = false; $("#adminPin").value = ""; $("#adminPinMessage").textContent = ""; });
    $("#adminPinForm").addEventListener("submit", e => {
      e.preventDefault();
      if ($("#adminPin").value !== ADMIN_PIN) { $("#adminPinMessage").className = "coupon-message error"; $("#adminPinMessage").textContent = "That PIN isn’t right."; return; }
      $("#adminPinForm").hidden = true; $("#adminPinMessage").textContent = ""; panel.hidden = false;
      if (!built) { build(); built = true; }
      paintAll();
    });
    ["subs-changed", "subscription-saved"].forEach(n => on(n, () => { if (built && !panel.hidden) paintAll(); }));
  }

  A.register(() => {
    initQuiz(); initAdmin(); renderDashboard();
    ["subscription-saved", "subs-changed"].forEach(n => on(n, renderDashboard));
  });
})();
