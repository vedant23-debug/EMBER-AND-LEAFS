/* EMBER & LEAF — supabase.js
   Saves subscription orders and newsletter sign-ups to your Supabase project "Ember and Leaf".
   Load AFTER payments.js (last script in index.html).
   The key below is the PUBLISHABLE (anon) key. It is meant to be public. Row Level Security
   lets visitors INSERT only: nobody can read, change or delete rows from the website.
   Card numbers, expiry and CVV never reach this file (payments.js discards them first). */
"use strict";
(function () {
  const A = window.ELApp, S = window.ELSub;
  if (!A || !S) { console.error("supabase.js needs app.js and subscriptions.js first"); return; }

  const SUPABASE_URL = "https://nncaigpekbgioazrwjpe.supabase.co";
  const SUPABASE_KEY = "sb_publishable_kbbQ-sq1teR-cxNR7Zsnog_j0d1q3tm";

  async function insert(table, rows) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal"
      },
      body: JSON.stringify(rows)
    });
    if (!res.ok) { const t = await res.text().catch(() => ""); const e = new Error(`${table}: ${res.status} ${t}`); e.status = res.status; throw e; }
  }

  /* ---- Subscription orders (including the safe payment summary) ---- */
  async function saveOrder(sub) {
    const c = sub.customer || {}, g = sub.gift || {}, p = sub.payment || {};
    await insert("subscriptions", [{
      id: sub.id, status: sub.status, frequency: sub.frequency, term_months: sub.term, start_date: sub.startDate,
      delivery_window: sub.deliveryWindow || null,
      customer_name: c.name, customer_email: c.email, customer_phone: c.phone,
      address: c.address, city: c.city, state: c.state, pin_code: c.pin, delivery_notes: c.notes || null,
      is_gift: !!g.isGift, gift_name: g.isGift ? g.name || null : null, gift_message: g.isGift ? g.message || null : null,
      schedule: sub.schedule, per_delivery: sub.perDelivery, total: sub.total,
      payment_method: p.method || null, payment_summary: p.summary || null, payment_status: p.status || null
    }]);
    await insert("subscription_items", sub.items.map(i => ({
      subscription_id: sub.id, product_id: i.productId, product_name: i.name,
      pack: i.pack, qty: i.qty, grind: i.grind || null, unit_price: i.unitPrice
    })));
  }

  A.on("subscription-saved", sub => {
    // Wait a moment so payments.js can attach the payment summary to the saved order first.
    setTimeout(async () => {
      const saved = (S.loadSubs().find(x => x.id === sub.id)) || sub;
      try { await saveOrder(saved); }
      catch (err) { console.error("Supabase save failed", err); A.toast("Your order is saved in this browser, but couldn't be sent to the server.", "warning"); }
    }, 100);
  });

  /* ---- Newsletter: capture phase, so we read the email before app.js clears the input ---- */
  const news = document.getElementById("newsletterForm");
  if (news) news.addEventListener("submit", async () => {
    const email = (document.getElementById("newsletterEmail").value || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return;
    try { await insert("newsletter_signups", [{ email }]); }
    catch (err) { if (err.status !== 409) console.error("Supabase newsletter save failed", err); } // 409 = already subscribed
  }, true);
})();
