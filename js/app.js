(() => {
  const CART_KEY = "rs_cart";
  const fmt = (n) => "₹" + n.toLocaleString("en-IN");
  const $ = (id) => document.getElementById(id);

  const state = { category: "all", query: "", sort: "featured", cart: loadCart() };

  function loadCart() {
    try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
  }
  function saveCart() {
    try { localStorage.setItem(CART_KEY, JSON.stringify(state.cart)); } catch {}
  }
  const byId = (id) => PRODUCTS.find((p) => p.id === id);
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function renderCategories() {
    $("categories").innerHTML = CATEGORIES.map((c) =>
      `<button class="chip${c.id === state.category ? " active" : ""}" data-cat="${c.id}">${c.label}</button>`
    ).join("");
  }

  function visibleProducts() {
    const q = state.query.trim().toLowerCase();
    let list = PRODUCTS.filter((p) =>
      (state.category === "all" || p.category === state.category) &&
      (!q || [p.name, p.desc, p.fabric].join(" ").toLowerCase().includes(q))
    );
    if (state.sort === "low") list = [...list].sort((a, b) => a.price - b.price);
    if (state.sort === "high") list = [...list].sort((a, b) => b.price - a.price);
    return list;
  }

  function thumb(p, cls = "thumb") {
    return p.image
      ? `<img class="${cls}" src="${escape(p.image)}" alt="${escape(p.name)}">`
      : `<div class="${cls} motif cat-${p.category}"><span>${p.motif}</span></div>`;
  }

  function renderGrid() {
    const list = visibleProducts();
    $("empty").hidden = list.length > 0;
    $("grid").innerHTML = list.map((p) => {
      const off = Math.round((1 - p.price / p.mrp) * 100);
      return `<article class="card" data-id="${p.id}">
        ${p.tag ? `<span class="tag">${p.tag}</span>` : ""}
        ${thumb(p)}
        <div class="card-body">
          <h4>${escape(p.name)}</h4>
          <p class="fabric">${escape(p.fabric)}</p>
          <div class="price"><strong>${fmt(p.price)}</strong><s>${fmt(p.mrp)}</s><em>${off}% off</em></div>
          <button class="btn primary add" data-add="${p.id}">Add to Cart</button>
        </div>
      </article>`;
    }).join("");
  }

  function openProduct(id) {
    const p = byId(id);
    $("productBody").innerHTML = `
      <button class="icon-btn close" data-close aria-label="Close">✕</button>
      ${thumb(p, "detail-img")}
      <h3>${escape(p.name)}</h3>
      <p>${escape(p.desc)}</p>
      <p class="fabric"><b>Material:</b> ${escape(p.fabric)}</p>
      <label>Colour
        <select id="colorPick">${p.colors.map((c) => `<option>${escape(c)}</option>`).join("")}</select>
      </label>
      <div class="price"><strong>${fmt(p.price)}</strong><s>${fmt(p.mrp)}</s></div>
      <button class="btn primary" id="detailAdd">Add to Cart</button>`;
    $("detailAdd").onclick = () => { addToCart(p.id, $("colorPick").value); $("productDialog").close(); };
    $("productDialog").showModal();
  }

  function addToCart(id, color) {
    const p = byId(id);
    color = color || p.colors[0];
    const line = state.cart.find((l) => l.id === id && l.color === color);
    if (line) line.qty++; else state.cart.push({ id, color, qty: 1 });
    saveCart(); renderCart();
    toast(`${p.name} added to cart`);
  }

  function changeQty(i, delta) {
    state.cart[i].qty += delta;
    if (state.cart[i].qty <= 0) state.cart.splice(i, 1);
    saveCart(); renderCart();
  }

  const cartTotal = () => state.cart.reduce((s, l) => s + byId(l.id).price * l.qty, 0);

  function renderCart() {
    $("cartCount").textContent = state.cart.reduce((s, l) => s + l.qty, 0);
    $("cartTotal").textContent = fmt(cartTotal());
    $("checkoutBtn").disabled = state.cart.length === 0;
    $("cartItems").innerHTML = state.cart.length ? state.cart.map((l, i) => {
      const p = byId(l.id);
      return `<div class="cart-line">
        ${thumb(p, "mini")}
        <div class="cart-info"><b>${escape(p.name)}</b><small>${escape(l.color)} · ${fmt(p.price)}</small></div>
        <div class="qty">
          <button data-qty="${i}" data-d="-1" aria-label="Decrease">−</button>
          <span>${l.qty}</span>
          <button data-qty="${i}" data-d="1" aria-label="Increase">+</button>
        </div>
      </div>`;
    }).join("") : `<p class="empty">Your cart is empty.</p>`;
  }

  function toggleCart(open) {
    $("drawer").classList.toggle("open", open);
    $("drawer").setAttribute("aria-hidden", String(!open));
    $("scrim").hidden = !open;
  }

  let toastTimer;
  function toast(msg) {
    const t = $("toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  // Events
  $("categories").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    state.category = b.dataset.cat;
    renderCategories(); renderGrid();
  });
  $("search").addEventListener("input", (e) => { state.query = e.target.value; renderGrid(); });
  $("sort").addEventListener("change", (e) => { state.sort = e.target.value; renderGrid(); });
  $("grid").addEventListener("click", (e) => {
    const add = e.target.closest("[data-add]");
    if (add) return addToCart(Number(add.dataset.add));
    const card = e.target.closest(".card");
    if (card) openProduct(Number(card.dataset.id));
  });
  $("productDialog").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]") || e.target === $("productDialog")) $("productDialog").close();
  });
  $("cartItems").addEventListener("click", (e) => {
    const b = e.target.closest("[data-qty]");
    if (b) changeQty(Number(b.dataset.qty), Number(b.dataset.d));
  });
  $("cartBtn").onclick = () => toggleCart(true);
  $("closeCart").onclick = () => toggleCart(false);
  $("scrim").onclick = () => toggleCart(false);
  $("checkoutBtn").onclick = () => { toggleCart(false); $("checkoutDialog").showModal(); };
  $("cancelCheckout").onclick = () => $("checkoutDialog").close();
  $("checkoutForm").addEventListener("submit", (e) => {
    const data = Object.fromEntries(new FormData(e.target));
    const orderId = "RS" + Date.now().toString().slice(-6);
    // Hook point: send { orderId, customer: data, items: state.cart, total } to your backend / payment gateway.
    console.log("Order placed", { orderId, customer: data, items: state.cart, total: cartTotal() });
    state.cart = []; saveCart(); renderCart(); e.target.reset();
    toast(`Order ${orderId} placed! Dhanyavaad, ${data.name}.`);
  });

  renderCategories(); renderGrid(); renderCart();
})();
