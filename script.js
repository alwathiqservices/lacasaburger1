/**
 * script.js — Vanilla JS only. No frameworks, no backend, no database.
 * كل بيانات المنيو تُقرأ من menu.json، والسلة تُحفظ في localStorage،
 * والطلب يُرسل عبر رابط واتساب (wa.me) بدون أي API خارجي.
 */
(function(){
  "use strict";

  /* ---------------------------------------------------------
     الحالة العامة (State)
     --------------------------------------------------------- */
  let MENU = null;          // بيانات المنيو الكاملة من menu.json
  let ADDON_LOOKUP = {};    // خريطة سريعة لأسعار الإضافات
  let cart = [];            // عناصر السلة
  let activeCategory = "all";
  let currentProduct = null;   // المنتج المفتوح حالياً داخل الـ Bottom Sheet
  let currentOptionIndex = 0;
  let currentAddons = {};      // { addonId: true }
  let currentQty = 1;

  /* ---------------------------------------------------------
     عناصر DOM
     --------------------------------------------------------- */
  const el = (id) => document.getElementById(id);

  const categoriesNav   = el("categories");
  const menuSections     = el("menuSections");
  const emptyState       = el("emptyState");
  const searchInput      = el("searchInput");

  const overlay          = el("overlay");

  const productSheet     = el("productSheet");
  const productSheetTitle= el("productSheetTitle");
  const productSheetImg  = el("productSheetImg");
  const optionsBlock     = el("optionsBlock");
  const optionsTitle     = el("optionsTitle");
  const optionsList      = el("optionsList");
  const addonsBlock      = el("addonsBlock");
  const addonsList       = el("addonsList");
  const productNote      = el("productNote");
  const confirmAddBtn    = el("confirmAddBtn");
  const confirmAddPrice  = el("confirmAddPrice");
  const qtyValue         = el("qtyValue");
  const qtyPlus          = el("qtyPlus");
  const qtyMinus         = el("qtyMinus");

  const cartSheet        = el("cartSheet");
  const cartItemsWrap    = el("cartItems");
  const cartTotalValue   = el("cartTotalValue");
  const custName         = el("custName");
  const custPhone        = el("custPhone");
  const custAddress      = el("custAddress");
  const custNote         = el("custNote");
  const sendOrderBtn     = el("sendOrderBtn");

  const cartFab          = el("cartFab");
  const cartFabCount     = el("cartFabCount");
  const cartFabTotal     = el("cartFabTotal");

  const toastEl          = el("toast");

  /* ---------------------------------------------------------
     أدوات مساعدة
     --------------------------------------------------------- */
  function fmtPrice(n){
    const num = Math.round(n);
    return num.toLocaleString("en-US") + " " + (CONFIG.CURRENCY || "د.ع");
  }

  function showToast(msg){
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(()=> toastEl.classList.remove("show"), 2200);
  }

  function uid(){ return "it_" + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }

  function saveCart(){
    try{ localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(cart)); }catch(e){ /* ignore quota errors */ }
  }
  function loadCart(){
    try{
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      cart = raw ? JSON.parse(raw) : [];
    }catch(e){ cart = []; }
  }

  /* ---------------------------------------------------------
     تحميل بيانات المنيو
     --------------------------------------------------------- */
  async function loadMenu(){
    const res = await fetch("menu.json", { cache: "no-store" });
    MENU = await res.json();

    // خريطة الإضافات لسهولة الوصول للسعر بالاسم
    Object.values(MENU.addonGroups || {}).forEach(group=>{
      group.items.forEach(a=> ADDON_LOOKUP[a.id] = a);
    });

    applyRestaurantInfo();
    renderCategories();
    renderProducts();
  }

  function applyRestaurantInfo(){
    const r = MENU.restaurant;
    el("restName").textContent = r.name;
    el("restAddress").textContent = r.address;
    el("restHours").querySelector("span:last-child").textContent = r.hours;
    el("logoImg").src = r.logo;
    el("logoImg").alt = "شعار " + r.name;
    el("coverImg").style.backgroundImage = `url("${r.cover}")`;

    document.title = r.name + " | المنيو الرسمي";

    const phone = CONFIG.PHONE_TEL || ("+" + r.phone);
    el("callBtn").href = "tel:" + phone;
    el("phoneText").textContent = CONFIG.PHONE_DISPLAY || r.phone;
    el("mapBtn").href = CONFIG.MAPS_URL || "#";
  }

  /* ---------------------------------------------------------
     التصنيفات (Categories)
     --------------------------------------------------------- */
  function renderCategories(){
    categoriesNav.innerHTML = "";
    MENU.categories.forEach(cat=>{
      const btn = document.createElement("button");
      btn.className = "cat-pill" + (cat.id === activeCategory ? " active" : "");
      btn.textContent = cat.name;
      btn.dataset.cat = cat.id;
      btn.addEventListener("click", ()=> onCategoryClick(cat.id));
      categoriesNav.appendChild(btn);
    });
  }

  function onCategoryClick(catId){
    activeCategory = catId;
    [...categoriesNav.children].forEach(b=> b.classList.toggle("active", b.dataset.cat === catId));

    if(catId === "all"){
      window.scrollTo({ top: menuSections.offsetTop - 130, behavior: "smooth" });
      renderProducts();
      return;
    }
    renderProducts();
    requestAnimationFrame(()=>{
      const target = document.querySelector(`.menu-section[data-cat="${catId}"]`);
      if(target){
        const y = target.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: y, behavior: "smooth" });
      }
    });
  }

  /* ---------------------------------------------------------
     المنتجات (Products)
     --------------------------------------------------------- */
  function getFilteredProducts(){
    const q = (searchInput.value || "").trim().toLowerCase();
    return MENU.products.filter(p=>{
      const matchCat = activeCategory === "all" || p.category === activeCategory;
      const matchSearch = !q || p.name.toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }

  function groupByCategory(products){
    const order = MENU.categories.filter(c=>c.id!=="all").map(c=>c.id);
    const map = {};
    products.forEach(p=>{
      if(!map[p.category]) map[p.category] = [];
      map[p.category].push(p);
    });
    return order.filter(id=>map[id]).map(id=>({ catId:id, catName: MENU.categories.find(c=>c.id===id).name, items: map[id] }));
  }

  function renderProducts(){
    const filtered = getFilteredProducts();
    menuSections.innerHTML = "";

    if(filtered.length === 0){
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    const groups = groupByCategory(filtered);
    groups.forEach(group=>{
      const section = document.createElement("section");
      section.className = "menu-section";
      section.dataset.cat = group.catId;

      // تجميع فرعي حسب "group" (مثل: كلاسك برجر / موسكو برجر) داخل نفس التصنيف
      const subGroups = {};
      group.items.forEach(p=>{
        const key = p.group || group.catName;
        if(!subGroups[key]) subGroups[key] = [];
        subGroups[key].push(p);
      });

      Object.keys(subGroups).forEach(subKey=>{
        const h = document.createElement("h2");
        h.className = "menu-section-title";
        h.textContent = subKey;
        section.appendChild(h);

        subGroups[subKey].forEach(p=> section.appendChild(renderProductCard(p)));
      });

      menuSections.appendChild(section);
    });
  }

  function getBasePrice(p){
    if(p.customizable) return Math.min(...p.options.map(o=>o.price));
    return p.price;
  }

  function renderProductCard(p){
    const card = document.createElement("div");
    card.className = "product-card";
    card.dataset.id = p.id;

    const priceLabel = p.customizable
      ? `<small>من</small> ${fmtPrice(getBasePrice(p))}`
      : fmtPrice(p.price);

    card.innerHTML = `
      <div class="product-image">
        <img src="${p.image}" alt="${p.name}" loading="lazy" width="140" height="140">
      </div>
      <div class="product-info">
        <div class="product-actions">
          <button class="btn-pill-add" type="button" aria-label="إضافة ${p.name}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>
            إضافة
          </button>
          <div class="inline-stepper" data-id="${p.id}">
            <button class="inc" aria-label="زيادة">+</button>
            <span class="inline-qty">0</span>
            <button class="dec" aria-label="إنقاص">−</button>
          </div>
        </div>
        ${p.customizable ? `<p class="customizable-tag">قابل للتخصيص</p>` : ``}
        <p class="product-name">${p.name}</p>
        <p class="product-price">${priceLabel}</p>
      </div>
    `;

    const addBtn = card.querySelector(".btn-pill-add");
    addBtn.addEventListener("click", ()=> handleAddClick(p, card));

    const stepper = card.querySelector(".inline-stepper");
    stepper.querySelector(".inc").addEventListener("click", ()=> quickAdjustQty(p, card, +1));
    stepper.querySelector(".dec").addEventListener("click", ()=> quickAdjustQty(p, card, -1));

    syncInlineStepper(p, card);

    return card;
  }

  function findSimpleCartLine(productId){
    return cart.find(it => it.productId === productId && !it.customizable);
  }

  function syncInlineStepper(p, card){
    if(p.customizable) return; // المنتجات القابلة للتخصيص تفتح Bottom Sheet دائماً
    const line = findSimpleCartLine(p.id);
    const stepper = card.querySelector(".inline-stepper");
    const addBtn = card.querySelector(".btn-pill-add");
    const qtySpan = stepper.querySelector(".inline-qty");
    if(line && line.qty > 0){
      stepper.classList.add("show");
      addBtn.style.display = "none";
      qtySpan.textContent = line.qty;
    } else {
      stepper.classList.remove("show");
      addBtn.style.display = "";
    }
  }

  function handleAddClick(p, card){
    if(p.customizable){
      openProductSheet(p);
    } else {
      addSimpleItem(p, +1);
      syncInlineStepper(p, card);
      showToast(`تمت إضافة ${p.name} إلى السلة`);
      updateCartFab();
    }
  }

  function quickAdjustQty(p, card, delta){
    addSimpleItem(p, delta);
    syncInlineStepper(p, card);
    updateCartFab();
  }

  function addSimpleItem(p, delta){
    let line = findSimpleCartLine(p.id);
    if(!line){
      if(delta <= 0) return;
      line = { id: uid(), productId: p.id, name: p.name, image: p.image, customizable:false,
                optionLabel: null, addons: [], qty: 0, unitPrice: p.price, note: "" };
      cart.push(line);
    }
    line.qty += delta;
    if(line.qty <= 0){
      cart = cart.filter(it => it.id !== line.id);
    }
    saveCart();
  }

  /* ---------------------------------------------------------
     Bottom Sheet — المنتج (خيارات + إضافات)
     --------------------------------------------------------- */
  function openProductSheet(p){
    currentProduct = p;
    currentOptionIndex = 0;
    currentAddons = {};
    currentQty = 1;

    productSheetTitle.textContent = p.name;
    productSheetImg.src = p.image;
    productSheetImg.alt = p.name;
    productNote.value = "";

    // الخيارات (Radio)
    if(p.customizable){
      optionsBlock.hidden = false;
      optionsTitle.textContent = p.optionsTitle || "الخيارات";
      optionsList.innerHTML = "";
      p.options.forEach((opt, idx)=>{
        const row = document.createElement("div");
        row.className = "option-row" + (idx === 0 ? " selected" : "");
        row.dataset.idx = idx;
        row.innerHTML = `
          <span class="option-price">${fmtPrice(opt.price)}</span>
          <span class="option-label">${opt.label}</span>
          <span class="radio"></span>
        `;
        row.addEventListener("click", ()=>{
          currentOptionIndex = idx;
          [...optionsList.children].forEach(r=> r.classList.remove("selected"));
          row.classList.add("selected");
          updateSheetPrice();
        });
        optionsList.appendChild(row);
      });
    } else {
      optionsBlock.hidden = true;
    }

    // الإضافات (Checkbox)
    if(p.addonGroup && MENU.addonGroups[p.addonGroup]){
      addonsBlock.hidden = false;
      addonsList.innerHTML = "";
      MENU.addonGroups[p.addonGroup].items.forEach(addon=>{
        const row = document.createElement("div");
        row.className = "addon-row";
        row.dataset.id = addon.id;
        row.innerHTML = `
          <span class="addon-price">+${fmtPrice(addon.price)}</span>
          <span class="addon-label">${addon.name}</span>
          <span class="checkbox">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M4 12l6 6L20 6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
        `;
        row.addEventListener("click", ()=>{
          const checked = row.classList.toggle("checked");
          if(checked) currentAddons[addon.id] = true; else delete currentAddons[addon.id];
          updateSheetPrice();
        });
        addonsList.appendChild(row);
      });
    } else {
      addonsBlock.hidden = true;
    }

    qtyValue.textContent = "1";
    updateSheetPrice();
    openSheet(productSheet);
  }

  function computeUnitPrice(){
    const p = currentProduct;
    let base = p.customizable ? p.options[currentOptionIndex].price : p.price;
    Object.keys(currentAddons).forEach(id=>{
      if(ADDON_LOOKUP[id]) base += ADDON_LOOKUP[id].price;
    });
    return base;
  }

  function updateSheetPrice(){
    const unit = computeUnitPrice();
    confirmAddPrice.textContent = fmtPrice(unit * currentQty);
  }

  qtyPlus.addEventListener("click", ()=>{
    currentQty += 1;
    qtyValue.textContent = currentQty;
    updateSheetPrice();
  });
  qtyMinus.addEventListener("click", ()=>{
    if(currentQty <= 1) return;
    currentQty -= 1;
    qtyValue.textContent = currentQty;
    updateSheetPrice();
  });

  confirmAddBtn.addEventListener("click", ()=>{
    const p = currentProduct;
    const unit = computeUnitPrice();
    const addonNames = Object.keys(currentAddons).map(id=> ADDON_LOOKUP[id] ? ADDON_LOOKUP[id].name : null).filter(Boolean);

    cart.push({
      id: uid(),
      productId: p.id,
      name: p.name,
      image: p.image,
      customizable: true,
      optionLabel: p.customizable ? p.options[currentOptionIndex].label : null,
      addons: addonNames,
      qty: currentQty,
      unitPrice: unit,
      note: productNote.value.trim()
    });
    saveCart();
    showToast(`تمت إضافة ${p.name} إلى السلة`);
    closeSheet(productSheet);
    updateCartFab();
    renderProducts(); // لتحديث أي stepper مرتبط بنفس المنتج البسيط
  });

  /* ---------------------------------------------------------
     السلة (Cart Sheet)
     --------------------------------------------------------- */
  function cartTotal(){
    return cart.reduce((sum, it)=> sum + it.unitPrice * it.qty, 0);
  }
  function cartCount(){
    return cart.reduce((sum, it)=> sum + it.qty, 0);
  }

  function updateCartFab(){
    const count = cartCount();
    if(count > 0){
      cartFab.hidden = false;
      cartFabCount.textContent = count;
      cartFabTotal.textContent = fmtPrice(cartTotal());
    } else {
      cartFab.hidden = true;
    }
  }

  function renderCartItems(){
    cartItemsWrap.innerHTML = "";
    if(cart.length === 0){
      cartItemsWrap.innerHTML = `
        <div class="cart-empty">
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none"><path d="M3 4h2l2.4 12.2a2 2 0 0 0 2 1.8h7.6a2 2 0 0 0 2-1.6L21 8H6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <p>سلتك فارغة حالياً</p>
        </div>`;
      cartTotalValue.textContent = fmtPrice(0);
      return;
    }

    cart.forEach(item=>{
      const row = document.createElement("div");
      row.className = "cart-item";
      const metaParts = [];
      if(item.optionLabel) metaParts.push(item.optionLabel);
      if(item.addons && item.addons.length) metaParts.push("إضافات: " + item.addons.join("، "));
      if(item.note) metaParts.push("ملاحظة: " + item.note);

      row.innerHTML = `
        <div class="cart-item-top">
          <div>
            <p class="cart-item-name">${item.name}</p>
            ${metaParts.length ? `<p class="cart-item-meta">${metaParts.join(" — ")}</p>` : ``}
          </div>
          <div class="cart-item-price">${fmtPrice(item.unitPrice * item.qty)}</div>
        </div>
        <div class="cart-item-bottom">
          <button class="cart-item-remove" type="button">إزالة</button>
          <div class="cart-item-stepper">
            <button class="inc" aria-label="زيادة">+</button>
            <span>${item.qty}</span>
            <button class="dec" aria-label="إنقاص">−</button>
          </div>
        </div>
      `;

      row.querySelector(".cart-item-remove").addEventListener("click", ()=>{
        cart = cart.filter(it=> it.id !== item.id);
        saveCart();
        renderCartItems();
        updateCartFab();
        renderProducts();
      });
      row.querySelector(".inc").addEventListener("click", ()=>{
        item.qty += 1;
        saveCart();
        renderCartItems();
        updateCartFab();
        renderProducts();
      });
      row.querySelector(".dec").addEventListener("click", ()=>{
        item.qty -= 1;
        if(item.qty <= 0) cart = cart.filter(it=> it.id !== item.id);
        saveCart();
        renderCartItems();
        updateCartFab();
        renderProducts();
      });

      cartItemsWrap.appendChild(row);
    });

    cartTotalValue.textContent = fmtPrice(cartTotal());
  }

  cartFab.addEventListener("click", ()=>{
    renderCartItems();
    openSheet(cartSheet);
  });

  /* ---------------------------------------------------------
     إرسال الطلب عبر واتساب
     --------------------------------------------------------- */
  function buildWhatsAppMessage(){
    const lines = [];
    lines.push("🛒 طلب جديد");
    lines.push("");
    lines.push("الاسم:");
    lines.push(custName.value.trim() || "-");
    lines.push("");
    lines.push("الهاتف:");
    lines.push(custPhone.value.trim() || "-");
    lines.push("");
    lines.push("العنوان:");
    lines.push(custAddress.value.trim() || "-");
    lines.push("");
    lines.push("——————————————");

    cart.forEach((item, i)=>{
      lines.push("");
      lines.push(`${i+1}-`);
      lines.push("");
      lines.push(item.name);
      if(item.optionLabel){
        lines.push("");
        lines.push("النوع:");
        lines.push(item.optionLabel);
      }
      if(item.addons && item.addons.length){
        lines.push("");
        lines.push("الإضافات:");
        lines.push(item.addons.join("، "));
      }
      lines.push("");
      lines.push("الكمية:");
      lines.push(String(item.qty));
      if(item.note){
        lines.push("");
        lines.push("ملاحظة:");
        lines.push(item.note);
      }
      lines.push("");
      lines.push("السعر:");
      lines.push(String(item.unitPrice * item.qty));
      lines.push("");
      lines.push("——————————————");
    });

    lines.push("");
    lines.push("المجموع:");
    lines.push(`${cartTotal().toLocaleString("en-US")} ${CONFIG.CURRENCY}`);

    if(custNote.value.trim()){
      lines.push("");
      lines.push("الملاحظات:");
      lines.push(custNote.value.trim());
    }

    return lines.join("\n");
  }

  sendOrderBtn.addEventListener("click", ()=>{
    if(cart.length === 0){
      showToast("السلة فارغة، أضف منتجاً أولاً");
      return;
    }
    if(!custName.value.trim() || !custPhone.value.trim() || !custAddress.value.trim()){
      showToast("يرجى تعبئة الاسم ورقم الهاتف والعنوان");
      return;
    }

    const msg = buildWhatsAppMessage();
    const url = `https://wa.me/${CONFIG.WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");

    // تفريغ السلة بعد الإرسال
    cart = [];
    saveCart();
    renderCartItems();
    updateCartFab();
    renderProducts();
    closeSheet(cartSheet);
    showToast("تم تجهيز طلبك في واتساب ✅");
  });

  /* ---------------------------------------------------------
     التحكم بالـ Bottom Sheets العام
     --------------------------------------------------------- */
  function openSheet(sheetEl){
    overlay.classList.add("show");
    sheetEl.classList.add("open");
    document.body.style.overflow = "hidden";
  }
  function closeSheet(sheetEl){
    sheetEl.classList.remove("open");
    if(![...document.querySelectorAll(".sheet")].some(s=> s.classList.contains("open"))){
      overlay.classList.remove("show");
      document.body.style.overflow = "";
    }
  }
  function closeAllSheets(){
    document.querySelectorAll(".sheet.open").forEach(s=> s.classList.remove("open"));
    overlay.classList.remove("show");
    document.body.style.overflow = "";
  }

  el("productSheetClose").addEventListener("click", ()=> closeSheet(productSheet));
  el("cartSheetClose").addEventListener("click", ()=> closeSheet(cartSheet));
  overlay.addEventListener("click", closeAllSheets);

  /* ---------------------------------------------------------
     البحث
     --------------------------------------------------------- */
  let searchTimer = null;
  searchInput.addEventListener("input", ()=>{
    clearTimeout(searchTimer);
    searchTimer = setTimeout(()=>{
      if(searchInput.value.trim()){
        activeCategory = "all";
        [...categoriesNav.children].forEach(b=> b.classList.toggle("active", b.dataset.cat === "all"));
      }
      renderProducts();
    }, 200);
  });

  /* ---------------------------------------------------------
     التهيئة
     --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", async ()=>{
    loadCart();
    try{
      await loadMenu();
    }catch(err){
      menuSections.innerHTML = `<p style="text-align:center;color:#999;padding:40px 0">تعذر تحميل بيانات المنيو (menu.json). تأكد من رفع الملف بجانب index.html.</p>`;
      console.error(err);
    }
    updateCartFab();
  });

})();
