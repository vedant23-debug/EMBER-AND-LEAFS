/* EMBER & LEAF — app.js (core shopping experience)
   Sections: 1 Utilities & storage · 2 Catalogue & filtering · 3 Product details ·
   4 Cart & coupons · 5 Wishlist · 12 Theme & accessibility · 13 Notifications & init.
   Sections 6–11 (scheduling, builder, plans, quiz, dashboard, admin) live in subscriptions.js,
   which uses the shared window.ELApp interface exported at the bottom of this file.
   Everything here is a DEMO: no payment, shipment or email is ever processed.
   UPDATED: page always opens at the top; the main nav highlights the section you are viewing. */
"use strict";
(function () {
  const EL = window.EL;
  if (!EL) { console.error("products.js must load before app.js"); return; }

  /* ===== 1. UTILITIES AND STORAGE ===== */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const cap = s => String(s).replace(/-/g, " ").replace(/^./, c => c.toUpperCase());
  const clampQty = v => Math.min(20, Math.max(1, Math.floor(Number(v)) || 1));
  const money = n => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

  /* Build DOM with textContent only, so user-supplied text is never parsed as HTML. */
  function h(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "on") Object.entries(v).forEach(([ev, fn]) => n.addEventListener(ev, fn));
      else if (v === true) n.setAttribute(k, "");
      else n.setAttribute(k, v);
    }
    kids.flat().forEach(c => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c)); });
    return n;
  }

  /* Namespaced, safe localStorage. All stored data is treated as untrusted and re-validated on read. */
  const store = {
    get(key, fallback) { try { const r = localStorage.getItem("el:" + key); return r ? JSON.parse(r) : fallback; } catch (e) { return fallback; } },
    set(key, val) { try { localStorage.setItem("el:" + key, JSON.stringify(val)); return true; } catch (e) { toast("Couldn’t save in this browser (storage is full or blocked).", "warning"); return false; } },
    remove(key) { try { localStorage.removeItem("el:" + key); } catch (e) { /* ignore */ } }
  };

  const bus = new EventTarget();
  const on = (name, fn) => bus.addEventListener(name, e => fn(e.detail));
  const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

  /* ===== 2. CATALOGUE AND FILTERING ===== */
  let ovCache = null; // admin overrides: { [id]: { basePrice, stockStatus, visible } } — defaults stay untouched
  function overrides() {
    if (!ovCache) { const o = store.get("overrides", {}); ovCache = o && typeof o === "object" && !Array.isArray(o) ? o : {}; }
    return ovCache;
  }
  function effective(p) {
    const o = overrides()[p.id];
    if (!o || typeof o !== "object") return p;
    const out = { ...p };
    if (Number.isFinite(o.basePrice) && o.basePrice > 0) {
      out.basePrice = Math.round(o.basePrice);
      out.packSizes = EL.PACKS[p.type].sizes.map(([label, grams, m]) => ({ label, grams, price: Math.round(out.basePrice * m) }));
    }
    if (["in-stock", "low-stock", "out-of-stock"].includes(o.stockStatus)) out.stockStatus = o.stockStatus;
    if (typeof o.visible === "boolean") out.visible = o.visible;
    return out;
  }
  const allProducts = () => EL.CATALOGUE.map(effective);   // includes hidden (admin, history)
  const products = () => allProducts().filter(p => p.visible); // public views only
  function productById(id, includeHidden = false) {
    const base = EL.CATALOGUE.find(p => p.id === id);
    if (!base) return null;
    const p = effective(base);
    return p.visible || includeHidden ? p : null;
  }
  const defaultPrice = p => EL.priceFor(p, p.defaultPack);
  const styleOf = p => p.roastLevel || p.teaStyle;
  const imgSrc = key => EL.IMAGES[key] || EL.IMAGES.placeholder;
  const imgNode = (key, alt, cls = "") => h("img", { src: imgSrc(key), alt, class: cls, loading: "lazy", width: 400, height: 480, "data-image-key": key });

  const F = { type: "all", q: "", category: "", style: "", caffeine: "", min: null, max: null, sort: "featured" };

  function matches(p) {
    if (F.type !== "all" && p.type !== F.type) return false;
    if (F.category && p.category !== F.category) return false;
    if (F.style && styleOf(p) !== F.style) return false;
    if (F.caffeine && p.caffeineLevel !== F.caffeine) return false;
    const price = defaultPrice(p);
    if (F.min !== null && price < F.min) return false;
    if (F.max !== null && price > F.max) return false;
    if (F.q) {
      const hay = [p.name, p.origin, p.category, p.shortDescription, p.longDescription, ...p.tastingNotes].join(" ").toLowerCase();
      if (!F.q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }
  function sortList(list) {
    const cmp = {
      "price-low": (a, b) => defaultPrice(a) - defaultPrice(b),
      "price-high": (a, b) => defaultPrice(b) - defaultPrice(a),
      rating: (a, b) => b.rating - a.rating,
      name: (a, b) => a.name.localeCompare(b.name)
    }[F.sort];
    return cmp ? [...list].sort(cmp) : list; // "featured" keeps catalogue order
  }

  function fillOptions() {
    const base = products().filter(p => F.type === "all" || p.type === F.type);
    const fill = (sel, values, label, current) => {
      const uniq = [...new Set(values)].sort();
      sel.replaceChildren(h("option", { value: "", text: label }), ...uniq.map(v => h("option", { value: v, text: cap(v) })));
      sel.value = uniq.includes(current) ? current : "";
      return sel.value;
    };
    F.category = fill($("#categoryFilter"), base.map(p => p.category), "All categories", F.category);
    F.style = fill($("#styleFilter"), base.map(styleOf), "Any", F.style);
  }

  function wishButton(p) {
    const on = wishlist().includes(p.id);
    return h("button", { class: "wish-btn", type: "button", "data-id": p.id, "aria-pressed": String(on), "aria-label": `Save ${p.name} to wishlist`, text: on ? "♥" : "♡", on: { click: () => toggleWish(p.id) } });
  }

  function productCard(p) {
    const out = p.stockStatus === "out-of-stock";
    const badge = out ? "Sold out (demo)" : p.stockStatus === "low-stock" ? "Low stock (demo)" : p.badge;
    return h("article", { class: "product-card" },
      h("div", { class: "product-image-wrap" },
        imgNode(p.imageKey, p.name, "product-image"),
        h("button", { class: "product-open", type: "button", "aria-label": `View details for ${p.name}`, on: { click: () => showProduct(p.id) } }),
        badge && h("span", { class: "product-badge", text: badge }),
        wishButton(p),
        h("button", { class: "quick-add", type: "button", disabled: out, "aria-label": `Add ${p.name}, ${p.defaultPack}, to bag`, text: "+", on: { click: () => addToCart(p.id, p.defaultPack, 1, false) } })),
      h("div", { class: "product-info" },
        h("p", { class: "product-type", text: `${cap(p.category)} ${p.type} · ${p.origin}` }),
        h("div", { class: "product-title-row" }, h("h3", { text: p.name }), h("span", { class: "product-price", text: `${money(defaultPrice(p))} / ${p.defaultPack}` })),
        h("p", { class: "product-notes", text: p.tastingNotes.join(" · ") }),
        h("p", { class: "product-rating", text: `★ ${p.rating.toFixed(1)} (demo rating)` })));
  }

  function renderProducts() {
    const list = sortList(products().filter(matches));
    $("#productGrid").replaceChildren(...list.map(productCard));
    $("#resultCount").textContent = `${list.length} ${list.length === 1 ? "product" : "products"}`;
    $("#emptyState").hidden = list.length > 0;
  }

  function clearFilters() {
    Object.assign(F, { type: "all", q: "", category: "", style: "", caffeine: "", min: null, max: null, sort: "featured" });
    $("#filterForm").reset();
    setType("all");
  }
  function setType(type) {
    F.type = type;
    $$("[data-filter]").forEach(b => { const a = b.dataset.filter === type; b.classList.toggle("active", a); b.setAttribute("aria-pressed", String(a)); });
    fillOptions();
    renderProducts();
  }
  const numOrNull = v => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : null; };

  function initCatalogue() {
    $$("[data-filter]").forEach(b => b.addEventListener("click", () => setType(b.dataset.filter)));
    $("#filterForm").addEventListener("submit", e => e.preventDefault());
    $("#searchInput").addEventListener("input", e => { F.q = e.target.value.trim().toLowerCase(); renderProducts(); });
    $("#categoryFilter").addEventListener("change", e => { F.category = e.target.value; renderProducts(); });
    $("#styleFilter").addEventListener("change", e => { F.style = e.target.value; renderProducts(); });
    $("#caffeineFilter").addEventListener("change", e => { F.caffeine = e.target.value; renderProducts(); });
    $("#minPrice").addEventListener("input", e => { F.min = numOrNull(e.target.value); renderProducts(); });
    $("#maxPrice").addEventListener("input", e => { F.max = numOrNull(e.target.value); renderProducts(); });
    $("#sortProducts").addEventListener("change", e => { F.sort = e.target.value; renderProducts(); });
    $("#clearFilters").addEventListener("click", clearFilters);
    $("#emptyClear").addEventListener("click", clearFilters);
    fillOptions();
    renderProducts();
  }

  /* ===== 3. PRODUCT DETAILS ===== */
  const STOCK_TEXT = { "in-stock": "In stock (demo status)", "low-stock": "Low stock (demo status)", "out-of-stock": "Out of stock (demo status)" };

  function related(p) {
    return products().filter(x => x.id !== p.id && x.stockStatus !== "out-of-stock")
      .map(x => ({ x, score: (x.category === p.category ? 3 : 0) + (x.type === p.type ? 2 : 0) + x.tastingNotes.filter(n => p.tastingNotes.includes(n)).length }))
      .sort((a, b) => b.score - a.score || b.x.rating - a.x.rating).slice(0, 3).map(r => r.x);
  }

  function showProduct(id) {
    const p = productById(id);
    if (!p) { toast("That product is no longer available.", "warning"); return; }
    const out = p.stockStatus === "out-of-stock";
    const pack = h("select", { id: "pdPack" }, p.packSizes.map(s => h("option", { value: s.label, text: `${s.label} — ${money(s.price)}`, selected: s.label === p.defaultPack })));
    const qty = h("select", { id: "pdQty" }, Array.from({ length: 10 }, (_, i) => h("option", { value: i + 1, text: i + 1 })));
    const sub = h("input", { id: "pdSub", type: "checkbox" });
    const price = h("p", { class: "product-price" });
    const unit = () => { const base = EL.priceFor(p, pack.value); return sub.checked ? Math.round(base * (1 - EL.SUBSCRIBE_DISCOUNT)) : base; };
    const paint = () => { price.textContent = `${money(unit())} per ${pack.value} bag`; };
    [pack, sub].forEach(c => c.addEventListener("change", paint));
    paint();
    const flavour = [["Body", p.flavourProfile.body], ["Acidity", p.flavourProfile.acidity], ["Sweetness", p.flavourProfile.sweetness]]
      .map(([label, n]) => h("div", { class: "flavour-row" }, h("span", { text: label }), h("meter", { min: 1, max: 5, value: n, "aria-label": `${label}: ${n} out of 5` }), h("span", { text: `${n} / 5` })));
    const rel = related(p);
    $("#productDetail").replaceChildren(h("div", { class: "pd-grid" },
      h("div", { class: "pd-image" }, imgNode(p.imageKey, p.name)),
      h("div", { class: "pd-body" },
        h("p", { class: "product-type", text: `${cap(p.category)} ${p.type} · ${p.origin}` }),
        h("h2", { id: "pdTitle", text: p.name }),
        price,
        h("p", { text: p.longDescription }),
        h("p", { class: "product-notes", text: `Tasting notes: ${p.tastingNotes.join(", ")}` }),
        h("p", { class: "product-notes", text: p.type === "coffee" ? `${p.roastLevel} roast · ${p.process} · caffeine: ${p.caffeineLevel}` : `${p.teaStyle} · caffeine: ${p.caffeineLevel}` }),
        h("div", {}, flavour),
        h("p", { class: "product-notes", text: `How to brew: ${p.brewGuide}` }),
        h("div", { class: "pd-controls" },
          h("div", { class: "field-block" }, h("label", { for: "pdPack", text: "Pack size" }), pack),
          h("div", { class: "field-block" }, h("label", { for: "pdQty", text: "Quantity" }), qty)),
        h("label", { class: "check-row" }, sub, h("span", { text: "Subscribe & save 10% (adds this item to your plan pricing)" })),
        h("p", { class: "field-help", text: `${STOCK_TEXT[p.stockStatus]}. Rating ${p.rating.toFixed(1)} is demo data.` }),
        h("button", { class: "button button-dark full", type: "button", disabled: out, text: out ? "Out of stock" : "Add to bag", on: { click: () => { if (addToCart(p.id, pack.value, qty.value, sub.checked)) closeDialog($("#productDialog")); } } }),
        rel.length && h("div", {}, h("h3", { text: "You may also like" }),
          h("div", { class: "related-grid" }, rel.map(r => h("button", { class: "text-btn", type: "button", on: { click: () => showProduct(r.id) } }, imgNode(r.imageKey, r.name), r.name)))))));
    openDialog($("#productDialog"));
  }

  /* ===== 4. CART AND COUPONS ===== */
  const SHIPPING_FEE = 60, FREE_SHIPPING_OVER = 999;
  const COUPONS = {
    EMBER10: { label: "10% off", discount: s => Math.round(s * 0.1) },
    WELCOME100: { label: "₹100 off orders of ₹799+", min: 799, discount: () => 100 },
    FREESHIP: { label: "Free shipping", freeShip: true, discount: () => 0 }
  };
  const lineKey = l => `${l.id}|${l.pack}|${l.sub ? 1 : 0}`;

  function sanitizeCart(raw) {
    if (!Array.isArray(raw)) return [];
    const merged = new Map();
    raw.forEach(l => {
      const p = l && productById(l.id);
      if (!p || EL.priceFor(p, l.pack) === null) return; // unknown, hidden or outdated entries are dropped
      const line = { id: l.id, pack: l.pack, qty: clampQty(l.qty), sub: l.sub === true };
      const k = lineKey(line);
      if (merged.has(k)) merged.get(k).qty = clampQty(merged.get(k).qty + line.qty); else merged.set(k, line);
    });
    return [...merged.values()];
  }
  let cart = sanitizeCart(store.get("cart", []));
  let couponCode = COUPONS[store.get("coupon", "")] ? store.get("coupon", "") : "";
  const persistCart = () => store.set("cart", cart);
  const unitPrice = l => { const base = EL.priceFor(productById(l.id), l.pack); return l.sub ? Math.round(base * (1 - EL.SUBSCRIBE_DISCOUNT)) : base; };

  /* Rule used everywhere: free shipping is judged on the subtotal AFTER any coupon discount. */
  function cartTotals() {
    const subtotal = cart.reduce((s, l) => s + unitPrice(l) * l.qty, 0);
    const c = COUPONS[couponCode];
    const eligible = c && (!c.min || subtotal >= c.min);
    const discount = eligible ? Math.min(subtotal, c.discount(subtotal)) : 0;
    const after = subtotal - discount;
    const free = !subtotal || after >= FREE_SHIPPING_OVER || (eligible && c.freeShip);
    const shipping = free ? 0 : SHIPPING_FEE;
    return { subtotal, discount, after, shipping, total: after + shipping, eligible: !!eligible };
  }

  function addToCart(id, packLabel, quantity, subscribe) {
    const p = productById(id);
    if (!p) { toast("That product is no longer available.", "error"); return false; }
    if (p.stockStatus === "out-of-stock") { toast(`${p.name} is out of stock (demo status).`, "warning"); return false; }
    if (EL.priceFor(p, packLabel) === null) { toast("Please choose a valid pack size.", "error"); return false; }
    const line = { id, pack: packLabel, qty: clampQty(quantity), sub: subscribe === true };
    const existing = cart.find(l => lineKey(l) === lineKey(line));
    if (existing) existing.qty = clampQty(existing.qty + line.qty); else cart.push(line);
    persistCart(); renderCart();
    toast(`${p.name} (${packLabel}) added to your bag.`);
    return true;
  }

  function renderCart() {
    const before = cart.length;
    cart = sanitizeCart(cart);
    if (cart.length !== before) { persistCart(); toast("Some bag items are no longer available and were removed.", "warning"); }
    const count = cart.reduce((s, l) => s + l.qty, 0);
    const t = cartTotals();
    $("#cartCount").textContent = count;
    $("#drawerCount").textContent = `(${count})`;
    $("#cartItems").replaceChildren(...(cart.length ? cart.map(cartLine) : [h("div", { class: "cart-empty", text: "Your bag is empty. Add a coffee or tea and it will appear here." })]));
    $("#cartSubtotal").textContent = money(t.subtotal);
    $("#discountRow").hidden = !t.discount;
    $("#discountLabel").textContent = `Discount (${couponCode})`;
    $("#cartDiscount").textContent = `−${money(t.discount)}`;
    $("#cartShipping").textContent = t.shipping ? money(t.shipping) : "Free";
    $("#cartTotal").textContent = money(t.total);
    const bar = $("#shipBar");
    bar.max = FREE_SHIPPING_OVER; bar.value = Math.min(t.after, FREE_SHIPPING_OVER);
    $("#shipMessage").textContent = !t.subtotal ? `Free shipping on bags over ${money(FREE_SHIPPING_OVER)}.`
      : t.shipping === 0 ? "You’ve unlocked free shipping." : `Add ${money(FREE_SHIPPING_OVER - t.after)} more for free shipping.`;
  }

  function cartLine(l, i) {
    const p = productById(l.id);
    const set = fn => () => { fn(); cart = cart.filter(x => x.qty > 0); persistCart(); renderCart(); };
    return h("div", { class: "cart-line" },
      imgNode(p.imageKey, "", ""),
      h("div", {},
        h("h3", { text: p.name }),
        h("p", { text: `${l.pack} · ${money(unitPrice(l))} each${l.sub ? " · Subscribe & save" : ""}` }),
        h("div", { class: "qty-controls" },
          h("button", { type: "button", "aria-label": `Decrease quantity of ${p.name}`, text: "−", on: { click: set(() => { l.qty -= 1; }) } }),
          h("span", { text: l.qty, "aria-label": `Quantity ${l.qty}` }),
          h("button", { type: "button", "aria-label": `Increase quantity of ${p.name}`, text: "+", on: { click: set(() => { l.qty = clampQty(l.qty + 1); }) } })),
        h("button", { class: "remove-item", type: "button", text: "Remove", "aria-label": `Remove ${p.name} from bag`, on: { click: set(() => { l.qty = 0; }) } })),
      h("span", { class: "cart-line-price", text: money(unitPrice(l) * l.qty) }));
  }

  function couponMessage(text, kind) {
    const m = $("#couponMessage");
    m.className = `coupon-message ${kind || ""}`;
    m.textContent = text;
    if (kind === "ok") m.append(" ", h("button", { class: "text-btn", type: "button", text: "Remove", on: { click: () => { couponCode = ""; store.remove("coupon"); couponMessage("Coupon removed.", ""); renderCart(); } } }));
  }
  function initCart() {
    $("#openCart").addEventListener("click", () => openDialog($("#cartDrawer")));
    $("#closeCart").addEventListener("click", () => closeDialog($("#cartDrawer")));
    $("#continueShopping").addEventListener("click", () => { closeDialog($("#cartDrawer")); $("#shop").scrollIntoView(); });
    $("#couponForm").addEventListener("submit", e => {
      e.preventDefault();
      const code = $("#couponInput").value.trim().toUpperCase();
      const c = COUPONS[code], t = cartTotals();
      if (!code) return couponMessage("Enter a coupon code.", "error");
      if (!c) return couponMessage("That code isn’t valid. Try one of the demo codes below.", "error");
      if (code === couponCode) return couponMessage(`${code} is already applied.`, "ok");
      if (c.min && t.subtotal < c.min) return couponMessage(`${code} needs a subtotal of ${money(c.min)} or more.`, "error");
      couponCode = code; store.set("coupon", code); $("#couponInput").value = "";
      renderCart();
      couponMessage(`${code} applied: ${c.label}.`, "ok");
    });
    $("#cartCheckout").addEventListener("click", () => {
      if (!cart.length) return toast("Your bag is empty.", "warning");
      closeDialog($("#cartDrawer"));
      $("#subscription").scrollIntoView();
      emit("bag-to-builder", cart.map(l => ({ ...l })));
    });
    renderCart();
    if (couponCode) couponMessage(`${couponCode} applied: ${COUPONS[couponCode].label}.`, "ok");
  }

  /* ===== 5. WISHLIST ===== */
  function wishlist() {
    const raw = store.get("wishlist", []);
    return Array.isArray(raw) ? [...new Set(raw)].filter(id => productById(id)) : []; // drops unknown or hidden ids
  }
  function toggleWish(id) {
    const list = wishlist(), has = list.includes(id);
    store.set("wishlist", has ? list.filter(x => x !== id) : [...list, id]);
    toast(has ? "Removed from your wishlist." : "Saved to your wishlist.");
    refreshWishUi();
  }
  function refreshWishUi() {
    const list = wishlist();
    $("#wishCount").textContent = list.length;
    $$(".wish-btn").forEach(b => { const on = list.includes(b.dataset.id); b.setAttribute("aria-pressed", String(on)); b.textContent = on ? "♥" : "♡"; });
    $("#wishlistItems").replaceChildren(...(list.length ? list.map(id => {
      const p = productById(id);
      return h("div", { class: "cart-line" }, imgNode(p.imageKey, ""),
        h("div", {}, h("h3", { text: p.name }), h("p", { text: `${p.defaultPack} · ${money(defaultPrice(p))}` }),
          h("button", { class: "text-btn", type: "button", text: "View details", on: { click: () => { closeDialog($("#wishlistDialog")); showProduct(id); } } }),
          h("button", { class: "remove-item", type: "button", text: "Remove", "aria-label": `Remove ${p.name} from wishlist`, on: { click: () => toggleWish(id) } })),
        h("button", { class: "button button-outline", type: "button", disabled: p.stockStatus === "out-of-stock", text: "Add", "aria-label": `Add ${p.name} to bag`, on: { click: () => addToCart(id, p.defaultPack, 1, false) } }));
    }) : [h("div", { class: "cart-empty", text: "Nothing saved yet. Tap the heart on any product to keep it here." })]));
  }

  /* ===== 12. THEME AND ACCESSIBILITY ===== */
  function openDialog(d) {
    if (!d.open) d.showModal(); // native modal: focus trap, Escape to close, focus returns to the opener
    document.body.classList.add("no-scroll");
  }
  function closeDialog(d) { if (d.open) d.close(); }
  function initDialogs() {
    $$("dialog").forEach(d => {
      d.addEventListener("close", () => document.body.classList.toggle("no-scroll", $$("dialog[open]").length > 0));
      d.addEventListener("click", e => { // click on the backdrop (outside the box) closes
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
      });
    });
    $("#closeProduct").addEventListener("click", () => closeDialog($("#productDialog")));
    $("#closeWishlist").addEventListener("click", () => closeDialog($("#wishlistDialog")));
    $("#openWishlist").addEventListener("click", () => { refreshWishUi(); openDialog($("#wishlistDialog")); });
  }

  function confirmDialog({ title, text, ok = "Confirm", cancel = "Keep as is", alt = "" }) {
    const d = $("#confirmDialog"), altBtn = $("#confirmAlt");
    $("#confirmTitle").textContent = title; $("#confirmText").textContent = text;
    $("#confirmOk").textContent = ok; $("#confirmCancel").textContent = cancel;
    altBtn.hidden = !alt; altBtn.textContent = alt;
    return new Promise(resolve => {
      let result = "cancel";
      const pick = v => () => { result = v; d.close(); };
      $("#confirmOk").onclick = pick("ok"); altBtn.onclick = pick("alt"); $("#confirmCancel").onclick = pick("cancel");
      d.addEventListener("close", () => resolve(result), { once: true });
      openDialog(d);
    });
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const btn = $("#themeToggle");
    btn.setAttribute("aria-pressed", String(theme === "dark"));
    $("meta[name='theme-color']").setAttribute("content", theme === "dark" ? "#111a15" : "#17271f");
  }
  function initTheme() {
    const saved = store.get("theme", null);
    applyTheme(saved === "light" || saved === "dark" ? saved : (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
    $("#themeToggle").addEventListener("click", () => {
      const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next); store.set("theme", next);
    });
  }

  function initChrome() {
    const header = $("#siteHeader");
    const onScroll = () => header.classList.toggle("compact", window.scrollY > 40);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();

    const toggle = $("#menuToggle"), nav = $("#mainNav");
    const setNav = open => { nav.classList.toggle("open", open); toggle.setAttribute("aria-expanded", String(open)); toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu"); toggle.textContent = open ? "×" : "☰"; };
    toggle.addEventListener("click", () => setNav(!nav.classList.contains("open")));
    nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => setNav(false)));
    document.addEventListener("keydown", e => { if (e.key === "Escape" && nav.classList.contains("open")) { setNav(false); toggle.focus(); } });
    matchMedia("(min-width: 1000px)").addEventListener("change", e => { if (e.matches) setNav(false); });

    // Subtle reveal; skipped entirely for reduced motion, and content is never hidden without JS.
    if ("IntersectionObserver" in window && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.documentElement.classList.add("js");
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { threshold: 0.12 });
      $$(".section-heading, .story-copy, .quiz-card, .builder-card, .review-grid figure, .faq-list").forEach(n => { n.classList.add("reveal"); io.observe(n); });
    }

    // NEW: highlight the nav link for the section currently in view.
    if ("IntersectionObserver" in window) {
      const links = $$(".main-nav a"), byId = new Map(links.map(a => [a.getAttribute("href").slice(1), a]));
      const spy = new IntersectionObserver(es => es.forEach(e => {
        const a = byId.get(e.target.id);
        if (a && e.isIntersecting) { links.forEach(l => l.removeAttribute("aria-current")); a.setAttribute("aria-current", "true"); }
      }), { rootMargin: "-40% 0px -55% 0px" });
      byId.forEach((_, id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
    }
  }

  /* ===== 13. NOTIFICATIONS AND INITIALISATION ===== */
  function toast(message, type = "success") {
    const region = $("#toastRegion");
    if (!region) return;
    while (region.children.length >= 3) region.firstChild.remove();
    const t = h("div", { class: `toast ${type}`, text: message });
    region.append(t);
    setTimeout(() => t.remove(), 3400);
  }

  /* Any image that fails to load swaps to the local placeholder without breaking layout. */
  document.addEventListener("error", e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement)) return;
    const stage = img.dataset.fallback || "0", stand = EL.fallbackFor(img.dataset.imageKey || "");
    if (stage === "0" && stand && img.src !== stand) { img.dataset.fallback = "1"; img.src = stand; return; } // 1) stand-in photo
    if (stage === "2") return;
    img.dataset.fallback = "2"; // 2) local "photo coming soon" placeholder (inline, can't fail)
    img.classList.add("is-fallback");
    img.alt = img.alt ? `${img.alt} (photo coming soon)` : "";
    img.src = EL.IMAGES.placeholder;
  }, true);

  function writeJsonLd() {
    const items = products().slice(0, 12).map(p => ({
      "@type": "Product", name: p.name, description: p.shortDescription, category: cap(p.category),
      image: imgSrc(p.imageKey), offers: { "@type": "Offer", priceCurrency: "INR", price: String(defaultPrice(p)) }
    }));
    $("#productJsonLd").textContent = JSON.stringify({ "@context": "https://schema.org", "@graph": items }).replace(/</g, "\\u003c");
  }

  function initNewsletter() {
    $("#newsletterForm").addEventListener("submit", e => {
      e.preventDefault();
      const input = $("#newsletterEmail"), err = $("#newsletterError");
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim());
      input.setAttribute("aria-invalid", String(!ok));
      err.textContent = ok ? "" : "Enter a valid email address, like name@example.com.";
      if (!ok) return input.focus();
      input.value = "";
      toast("Thanks. This is a demo, so nothing was stored or sent.");
    });
  }

  /* Re-reads overrides (after admin edits) and repaints everything that shows products. */
  function refreshCatalogue() {
    ovCache = null;
    fillOptions(); renderProducts(); renderCart(); refreshWishUi(); writeJsonLd();
    emit("catalogue-changed");
  }

  const modules = []; let started = false;
  function init() {
    started = true;
    EL.validateData().forEach(msg => console.warn("[EMBER & LEAF data]", msg));
    $("#heroImage").src = imgSrc("hero");
    $(".story-photo").src = imgSrc("story");
    $("#currentYear").textContent = new Date().getFullYear();
    initTheme(); initDialogs(); initChrome(); initCatalogue(); initCart(); refreshWishUi(); initNewsletter(); writeJsonLd();
    modules.forEach(fn => fn());
    // NEW: always open at the top (hero) unless the link itself points to a section.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" });
  }

  window.ELApp = Object.freeze({
    $, $$, h, cap, money, store, clampQty, on, emit, toast, confirmDialog, openDialog, closeDialog,
    products, allProducts, productById, imgNode, imgSrc, refreshCatalogue, showProduct,
    getCart: () => cart.map(l => ({ ...l })), addToCart, cartTotals, unitPrice,
    register(fn) { started ? fn() : modules.push(fn); }
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
