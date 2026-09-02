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
  let cart = [];            // عناصر السلة
  let activeCategory = "all";
  let currentProduct = null;   // المنتج المفتوح حالياً داخل الـ Bottom Sheet
  let currentOptionIndex = 0;
  let currentQty = 1;
  let isRestaurantOpen = null; // null = لم يُحسب بعد

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------
     كشف وضع "مثبّت على الشاشة الرئيسية" (Standalone/PWA)
     يُستخدم فقط لمنع تقريب الإصبعين في هذا الوضع تحديداً (عبر CSS)
     دون التأثير على التصفح العادي بالمتصفح.
     --------------------------------------------------------- */
  function applyStandaloneMode(){
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true; // دعم قديم لـ iOS Safari
    document.documentElement.classList.toggle("is-standalone", isStandalone);
  }
  applyStandaloneMode();
  const standaloneQuery = window.matchMedia("(display-mode: standalone)");
  if(standaloneQuery.addEventListener){
    standaloneQuery.addEventListener("change", applyStandaloneMode);
  }

  /* ---------------------------------------------------------
     عناصر DOM
     --------------------------------------------------------- */
  const el = (id) => document.getElementById(id);

  const categoriesNav   = el("categories");
  const menuSections     = el("menuSections");
  const emptyState       = el("emptyState");
  const searchInput      = el("searchInput");
  const searchClear      = el("searchClear");

  const overlay          = el("overlay");

  const productSheet     = el("productSheet");
  const productSheetTitle= el("productSheetTitle");
  const productSheetImg  = el("productSheetImg");
  const optionsBlock     = el("optionsBlock");
  const optionsTitle     = el("optionsTitle");
  const optionsList      = el("optionsList");
  const productNote      = el("productNote");
  const confirmAddBtn    = el("confirmAddBtn");
  const confirmAddPrice  = el("confirmAddPrice");
  const qtyValue         = el("qtyValue");
  const qtyPlus          = el("qtyPlus");
  const qtyMinus         = el("qtyMinus");

  const cartSheet        = el("cartSheet");
  const cartItemsWrap    = el("cartItems");
  const cartTotalValue   = el("cartTotalValue");
  const closedBanner     = el("closedBanner");
  const custName         = el("custName");
  const custPhone        = el("custPhone");
  const phoneHint        = el("phoneHint");
  const custAddress      = el("custAddress");
  const custNote         = el("custNote");
  const sendOrderBtn     = el("sendOrderBtn");

  const cartFab          = el("cartFab");
  const cartFabCount     = el("cartFabCount");
  const cartFabTotal     = el("cartFabTotal");

  const toastEl          = el("toast");

  const statusBtn        = el("statusBtn");
  const statusDot        = el("statusDot");
  const statusText       = el("statusText");
  const statusSheet      = el("statusSheet");
  const statusDotLarge   = el("statusDotLarge");
  const statusDetailText = el("statusDetailText");
  const statusDetailSub  = el("statusDetailSub");
  const statusHoursLabel = el("statusHoursLabel");

  const soundToggle      = el("soundToggle");

  const dishCarousel     = el("dishCarousel");
  const dishStage        = el("dishStage");
  const dishPrev         = el("dishPrev");
  const dishNext         = el("dishNext");
  const dishName         = el("dishName");
  const dishDots         = el("dishDots");
  const dishAutoplayToggle = el("dishAutoplayToggle");

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

  function isValidPhone(v){
    return /^[0-9]{11}$/.test((v||"").trim());
  }

  /* ---------------------------------------------------------
     صوت التأكيد الناعم عند نجاح الإضافة (Web Audio API)
     — قصير جداً، خفيف، بدون ملف خارجي، بدون تراكم.
     --------------------------------------------------------- */
  const SOUND_PREF_KEY = "lacasa_sound_muted";
  let soundMuted = false;
  try{
    const saved = localStorage.getItem(SOUND_PREF_KEY);
    soundMuted = saved === "1";
  }catch(e){ soundMuted = false; }

  let audioCtx = null;
  let lastSoundAt = 0;

  function getAudioCtx(){
    if(audioCtx) return audioCtx;
    try{
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx) return null;
      audioCtx = new Ctx();
    }catch(e){ audioCtx = null; }
    return audioCtx;
  }

  // يُستدعى داخل أول تفاعل من المستخدم لتهيئة/استئناف الصوت وفق سياسات المتصفح
  function primeAudio(){
    const ctx = getAudioCtx();
    if(ctx && ctx.state === "suspended"){
      ctx.resume().catch(()=>{ /* تجاهل بصمت */ });
    }
  }
  ["pointerdown", "touchstart", "keydown"].forEach(evt=>{
    window.addEventListener(evt, primeAudio, { once: true, passive: true });
  });

  function playAddSound(){
    if(soundMuted) return;
    const now = performance.now();
    if(now - lastSoundAt < 220) return; // منع تراكم الأصوات عند الإضافات السريعة جداً
    lastSoundAt = now;

    const ctx = getAudioCtx();
    if(!ctx) return;
    try{
      if(ctx.state === "suspended") ctx.resume().catch(()=>{});

      const t0 = ctx.currentTime;

      // نغمتان صاعدتان (Ding-Ding) تعطيان إحساس اكتمال واضح وممتع، مع بقائهما قصيرتين وناعمتين
      const notes = [
        { start: 0,     freq: 587.33, dur: 0.10, peak: 0.065 }, // D5
        { start: 0.075, freq: 880.00, dur: 0.15, peak: 0.075 }, // A5
      ];

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 2400;
      filter.connect(ctx.destination);

      notes.forEach(n=>{
        const noteStart = t0 + n.start;
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(n.freq, noteStart);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, noteStart);
        gain.gain.exponentialRampToValueAtTime(n.peak, noteStart + 0.012); // دخول ناعم وسريع
        gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + n.dur); // خروج تدريجي دون طقطقة

        osc.connect(gain);
        gain.connect(filter);

        osc.start(noteStart);
        osc.stop(noteStart + n.dur + 0.02);
      });
    }catch(e){ /* تعذر تشغيل الصوت لا يجب أن يوقف الإضافة أو يظهر خطأ */ }
  }

  function applySoundToggleUI(){
    soundToggle.setAttribute("aria-pressed", String(!soundMuted));
    soundToggle.classList.toggle("is-muted", soundMuted);
    soundToggle.querySelector(".icon-on").hidden = soundMuted;
    soundToggle.querySelector(".icon-off").hidden = !soundMuted;
    soundToggle.setAttribute("aria-label", soundMuted ? "تفعيل صوت الإضافة" : "كتم صوت الإضافة");
  }

  soundToggle.addEventListener("click", ()=>{
    soundMuted = !soundMuted;
    try{ localStorage.setItem(SOUND_PREF_KEY, soundMuted ? "1" : "0"); }catch(e){ /* ignore */ }
    applySoundToggleUI();
    if(!soundMuted) primeAudio();
  });
  applySoundToggleUI();


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

    applyRestaurantInfo();
    renderCategories();
    renderProducts();
    initCarousel();
  }

  function applyRestaurantInfo(){
    const r = MENU.restaurant;
    el("restName").textContent = r.name;
    el("restAddress").textContent = r.address;
    el("logoImg").src = r.logo;
    el("logoImg").alt = "شعار " + r.name;

    document.title = r.name + " | المنيو الرسمي";

    const phone = CONFIG.PHONE_TEL || ("+" + r.phone);
    el("callBtn").href = "tel:" + phone;
    el("phoneText").textContent = CONFIG.PHONE_DISPLAY || r.phone;
    el("mapBtn").href = CONFIG.MAPS_URL || "#";

    if(CONFIG.BUSINESS_HOURS && CONFIG.BUSINESS_HOURS.label){
      statusHoursLabel.textContent = CONFIG.BUSINESS_HOURS.label;
    }
  }

  /* ---------------------------------------------------------
     أوقات الدوام — حساب فعلي بتوقيت بغداد (Asia/Baghdad)
     يدعم عبور منتصف الليل (مثال: 10:00 → 03:00 اليوم التالي)
     --------------------------------------------------------- */
  function getBaghdadMinutesNow(){
    const tz = (CONFIG.BUSINESS_HOURS && CONFIG.BUSINESS_HOURS.timezone) || "Asia/Baghdad";
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false
    }).formatToParts(new Date());
    let hour = 0, minute = 0;
    parts.forEach(p=>{
      if(p.type === "hour") hour = parseInt(p.value, 10) % 24;
      if(p.type === "minute") minute = parseInt(p.value, 10);
    });
    return hour * 60 + minute;
  }

  function parseHHMM(str){
    const [h, m] = String(str).split(":").map(n=> parseInt(n, 10));
    return (h % 24) * 60 + (m || 0);
  }

  function formatArabicTime(hhmm){
    const total = parseHHMM(hhmm);
    let h = Math.floor(total / 60);
    const m = total % 60;
    let period;
    if(h >= 0 && h < 4) period = "فجراً";
    else if(h < 12) period = "صباحاً";
    else if(h < 17) period = "ظهراً";
    else period = "مساءً";
    let h12 = h % 12;
    if(h12 === 0) h12 = 12;
    const mm = m === 0 ? "" : `:${String(m).padStart(2,"0")}`;
    return `${h12}${mm} ${period}`;
  }

  function computeStatus(){
    const hours = (CONFIG && CONFIG.BUSINESS_HOURS) || { open: "10:00", close: "03:00" };
    const openMin = parseHHMM(hours.open);
    const closeMin = parseHHMM(hours.close);
    const nowMin = getBaghdadMinutesNow();

    const crossesMidnight = closeMin <= openMin;
    let open;
    if(crossesMidnight){
      open = (nowMin >= openMin) || (nowMin < closeMin);
    } else {
      open = (nowMin >= openMin) && (nowMin < closeMin);
    }

    const openLabel = formatArabicTime(hours.open);
    const closeLabel = formatArabicTime(hours.close);

    return {
      open,
      shortText: open ? "مفتوح الآن" : "مغلق الآن",
      detailText: open ? "المطعم مفتوح الآن" : "المطعم مغلق الآن",
      subText: open ? `يغلق الساعة ${closeLabel}` : `يفتح الساعة ${openLabel}`,
    };
  }

  function updateStatusUI(){
    const s = computeStatus();
    isRestaurantOpen = s.open;

    statusDot.classList.toggle("is-open", s.open);
    statusDot.classList.toggle("is-closed", !s.open);
    statusText.textContent = s.shortText;

    if(statusDotLarge){
      statusDotLarge.classList.toggle("is-open", s.open);
      statusDotLarge.classList.toggle("is-closed", !s.open);
    }
    if(statusDetailText) statusDetailText.textContent = s.detailText;
    if(statusDetailSub) statusDetailSub.textContent = s.subText;

    if(closedBanner){
      closedBanner.hidden = s.open;
    }
  }

  function initStatusEngine(){
    updateStatusUI();
    setInterval(updateStatusUI, 60 * 1000);
    document.addEventListener("visibilitychange", ()=>{
      if(document.visibilityState === "visible") updateStatusUI();
    });
  }

  statusBtn.addEventListener("click", ()=>{
    updateStatusUI();
    openSheet(statusSheet);
  });
  el("statusSheetClose").addEventListener("click", ()=> closeSheet(statusSheet));

  /* ---------------------------------------------------------
     عرض الأكلات السينمائي (3D Carousel) — بيانات حقيقية من menu.json
     --------------------------------------------------------- */
  const CAROUSEL_CATEGORY_PICKS = ["burger", "pizza", "kentucky", "saj", "rizo", "western"];
  let carouselSlides = [];
  let carouselIndex = 0;
  let carouselTimer = null;
  let carouselAnimating = false;
  let carouselAutoplayEnabled = true;
  let carouselVisible = true;

  function buildCarouselSlides(){
    const slides = [];
    CAROUSEL_CATEGORY_PICKS.forEach(catId=>{
      const product = MENU.products.find(p=> p.category === catId);
      if(product) slides.push(product);
    });
    // احتياط: إن لم تتوفر أي فئة من القائمة أعلاه، استخدم أول 5 منتجات كما وردت في البيانات
    if(slides.length === 0){
      MENU.products.slice(0, 5).forEach(p=> slides.push(p));
    }
    return slides;
  }

  function renderCarouselDots(){
    dishDots.innerHTML = "";
    carouselSlides.forEach((s, i)=>{
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "dish-dot" + (i === carouselIndex ? " active" : "");
      dot.setAttribute("role", "tab");
      dot.setAttribute("aria-label", `عرض ${s.name}`);
      dot.setAttribute("aria-selected", i === carouselIndex ? "true" : "false");
      dot.addEventListener("click", ()=>{
        stopCarouselAutoplay();
        goToSlide(i);
      });
      dishDots.appendChild(dot);
    });
  }

  function initCarousel(){
    carouselSlides = buildCarouselSlides();
    if(carouselSlides.length === 0) return;

    dishStage.innerHTML = "";
    carouselSlides.forEach((p, i)=>{
      const item = document.createElement("div");
      item.className = "dish-slide";
      item.dataset.index = i;
      item.innerHTML = `<img src="${p.image}" alt="${p.name}" loading="${i === 0 ? "eager" : "lazy"}" width="220" height="220">`;
      dishStage.appendChild(item);
    });

    renderCarouselDots();
    layoutCarousel();
    updateDishName();

    if(carouselSlides.length > 1){
      dishPrev.hidden = false;
      dishNext.hidden = false;
      dishDots.hidden = false;
      dishAutoplayToggle.hidden = prefersReducedMotion;
      startCarouselAutoplay();
    } else {
      dishPrev.hidden = true;
      dishNext.hidden = true;
      dishDots.hidden = true;
      dishAutoplayToggle.hidden = true;
    }
  }

  function shortestOffset(from, to, total){
    let diff = (to - from) % total;
    if(diff > total / 2) diff -= total;
    if(diff < -total / 2) diff += total;
    return diff;
  }

  function layoutCarousel(){
    const total = carouselSlides.length;
    const slideEls = dishStage.querySelectorAll(".dish-slide");
    slideEls.forEach((el, i)=>{
      const offset = shortestOffset(carouselIndex, i, total);
      el.classList.remove("is-active", "is-adjacent", "is-far");

      if(prefersReducedMotion){
        // تنقّل يدوي بسيط بدون تأثير ثلاثي الأبعاد: يظهر الصنف النشط فقط
        if(offset === 0){
          el.classList.add("is-active");
          el.style.transform = "none";
          el.style.opacity = "1";
          el.style.zIndex = "5";
          el.style.pointerEvents = "auto";
        } else {
          el.style.transform = "none";
          el.style.opacity = "0";
          el.style.zIndex = "1";
          el.style.pointerEvents = "none";
        }
        return;
      }

      let tx = 0, scale = 1, rotate = 0, opacity = 1, z = 5, pe = "auto";

      if(offset === 0){
        el.classList.add("is-active");
      } else if(Math.abs(offset) === 1){
        el.classList.add("is-adjacent");
        tx = offset * -62; // نسبة % من عرض المرحلة
        scale = 0.8;
        rotate = offset * 20; // درجات rotateY
        opacity = 0.55;
        z = 3;
        pe = "auto";
      } else {
        el.classList.add("is-far");
        tx = offset * -90;
        scale = 0.6;
        rotate = offset * 26;
        opacity = 0;
        z = 1;
        pe = "none";
      }

      el.style.transform = `translateX(${tx}%) scale(${scale}) rotateY(${rotate}deg)`;
      el.style.opacity = String(opacity);
      el.style.zIndex = String(z);
      el.style.pointerEvents = pe;
    });
  }

  function updateDishName(){
    const current = carouselSlides[carouselIndex];
    if(current) dishName.textContent = current.name;
    [...dishDots.children].forEach((dot, i)=>{
      dot.classList.toggle("active", i === carouselIndex);
      dot.setAttribute("aria-selected", i === carouselIndex ? "true" : "false");
    });
  }

  function goToSlide(index){
    if(carouselAnimating || carouselSlides.length === 0) return;
    const total = carouselSlides.length;
    carouselIndex = ((index % total) + total) % total;
    carouselAnimating = true;
    layoutCarousel();
    updateDishName();
    const unlockDelay = prefersReducedMotion ? 20 : 720;
    setTimeout(()=>{ carouselAnimating = false; }, unlockDelay);
  }

  function nextSlide(){ goToSlide(carouselIndex + 1); }
  function prevSlide(){ goToSlide(carouselIndex - 1); }

  function startCarouselAutoplay(){
    if(prefersReducedMotion || !carouselAutoplayEnabled) return;
    stopCarouselAutoplay();
    carouselTimer = setInterval(()=>{
      if(carouselVisible && document.visibilityState === "visible"){
        nextSlide();
      }
    }, 5000);
  }
  function stopCarouselAutoplay(){
    if(carouselTimer){ clearInterval(carouselTimer); carouselTimer = null; }
  }

  dishPrev.addEventListener("click", ()=>{ stopCarouselAutoplay(); prevSlide(); });
  dishNext.addEventListener("click", ()=>{ stopCarouselAutoplay(); nextSlide(); });

  dishAutoplayToggle.addEventListener("click", ()=>{
    carouselAutoplayEnabled = !carouselAutoplayEnabled;
    dishAutoplayToggle.setAttribute("aria-pressed", String(carouselAutoplayEnabled));
    dishAutoplayToggle.querySelector(".icon-pause").hidden = !carouselAutoplayEnabled;
    dishAutoplayToggle.querySelector(".icon-play").hidden = carouselAutoplayEnabled;
    dishAutoplayToggle.querySelector(".icon-play-label").textContent = carouselAutoplayEnabled ? "إيقاف التقليب التلقائي" : "استئناف التقليب التلقائي";
    if(carouselAutoplayEnabled) startCarouselAutoplay(); else stopCarouselAutoplay();
  });

  // إيقاف التشغيل التلقائي عندما تكون المنطقة خارج الشاشة أو التبويب مخفياً
  if(typeof IntersectionObserver !== "undefined"){
    const carouselObserver = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{ carouselVisible = entry.isIntersecting; });
    }, { threshold: 0.2 });
    carouselObserver.observe(dishCarousel);
  }
  document.addEventListener("visibilitychange", ()=>{
    if(document.visibilityState === "visible" && carouselAutoplayEnabled){
      startCarouselAutoplay();
    }
  });

  // دعم السحب باللمس دون تعطيل التمرير العمودي للصفحة
  (function enableCarouselSwipe(){
    let startX = 0, startY = 0, tracking = false, decided = false, isHorizontal = false;

    dishStage.addEventListener("touchstart", (e)=>{
      if(e.touches.length !== 1) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      tracking = true;
      decided = false;
      isHorizontal = false;
    }, { passive: true });

    dishStage.addEventListener("touchmove", (e)=>{
      if(!tracking) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if(!decided){
        if(Math.abs(dx) > 8 || Math.abs(dy) > 8){
          decided = true;
          isHorizontal = Math.abs(dx) > Math.abs(dy);
        }
      }
      if(isHorizontal && e.cancelable) e.preventDefault(); // يمنع تمرير الصفحة أفقياً فقط أثناء السحب الأفقي الفعلي
    }, { passive: false });

    dishStage.addEventListener("touchend", (e)=>{
      if(!tracking) return;
      tracking = false;
      if(!isHorizontal) return;
      const endX = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientX : startX;
      const dx = endX - startX;
      if(Math.abs(dx) < 32) return;
      stopCarouselAutoplay();
      // في RTL: سحب لليسار = التالي، سحب لليمين = السابق
      if(dx < 0) nextSlide(); else prevSlide();
    });
  })();



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
      window.scrollTo({ top: menuSections.offsetTop - 130, behavior: prefersReducedMotion ? "auto" : "smooth" });
      renderProducts();
      return;
    }
    renderProducts();
    requestAnimationFrame(()=>{
      const target = document.querySelector(`.menu-section[data-cat="${catId}"]`);
      if(target){
        const y = target.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top: y, behavior: prefersReducedMotion ? "auto" : "smooth" });
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

  /* ---- ظهور تدريجي للبطاقات عند دخولها مجال الرؤية ---- */
  let revealObserver = null;
  function getRevealObserver(){
    if(prefersReducedMotion || typeof IntersectionObserver === "undefined") return null;
    if(revealObserver) return revealObserver;
    revealObserver = new IntersectionObserver((entries)=>{
      entries.forEach(entry=>{
        if(entry.isIntersecting){
          entry.target.classList.add("reveal-in");
          entry.target.classList.remove("reveal-init");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    return revealObserver;
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
      ? `<small>ابتداءً من</small> ${fmtPrice(getBasePrice(p))}`
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

    const observer = getRevealObserver();
    if(observer){
      card.classList.add("reveal-init");
      observer.observe(card);
    }

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
      playAddSound();
      updateCartFab(true);
    }
  }

  function quickAdjustQty(p, card, delta){
    addSimpleItem(p, delta);
    syncInlineStepper(p, card);
    updateCartFab(delta > 0);
  }

  function addSimpleItem(p, delta){
    let line = findSimpleCartLine(p.id);
    if(!line){
      if(delta <= 0) return;
      line = { id: uid(), productId: p.id, name: p.name, image: p.image, customizable:false,
                optionLabel: null, qty: 0, unitPrice: p.price, note: "" };
      cart.push(line);
    }
    line.qty += delta;
    if(line.qty <= 0){
      cart = cart.filter(it => it.id !== line.id);
    }
    saveCart();
  }

  /* ---------------------------------------------------------
     Bottom Sheet — المنتج (خيارات)
     --------------------------------------------------------- */
  function openProductSheet(p){
    currentProduct = p;
    currentOptionIndex = 0;
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

    qtyValue.textContent = "1";
    updateSheetPrice();
    openSheet(productSheet);
  }

  function computeUnitPrice(){
    const p = currentProduct;
    return p.customizable ? p.options[currentOptionIndex].price : p.price;
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

    cart.push({
      id: uid(),
      productId: p.id,
      name: p.name,
      image: p.image,
      customizable: true,
      optionLabel: p.customizable ? p.options[currentOptionIndex].label : null,
      qty: currentQty,
      unitPrice: unit,
      note: productNote.value.trim()
    });
    saveCart();
    showToast(`تمت إضافة ${p.name} إلى السلة`);
    playAddSound();
    closeSheet(productSheet);
    updateCartFab(true);
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

  function updateCartFab(pulse){
    const count = cartCount();
    if(count > 0){
      cartFab.hidden = false;
      cartFabCount.textContent = count;
      cartFabTotal.textContent = fmtPrice(cartTotal());
      if(pulse && !prefersReducedMotion){
        cartFab.classList.remove("pulse");
        // إعادة تشغيل الأنيميشن
        void cartFab.offsetWidth;
        cartFab.classList.add("pulse");
      }
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
    if(closedBanner) closedBanner.hidden = isRestaurantOpen !== false;
    openSheet(cartSheet);
  });

  /* ---------------------------------------------------------
     إرسال الطلب عبر واتساب
     --------------------------------------------------------- */
  function buildWhatsAppMessage(){
    const r = MENU.restaurant;
    const lines = [];

    lines.push(`مرحباً 👋 أرغب بطلب التالي من ${r.name}:`);
    lines.push("");

    cart.forEach((item, i)=>{
      const parts = [`${i+1}) ${item.name}`];
      if(item.optionLabel) parts.push(`(${item.optionLabel})`);
      parts.push(`× ${item.qty}`);
      parts.push(`— ${fmtPrice(item.unitPrice * item.qty)}`);
      lines.push(parts.join(" "));
      if(item.note) lines.push(`   ملاحظة: ${item.note}`);
    });

    lines.push("");
    lines.push(`المجموع: ${fmtPrice(cartTotal())}`);
    lines.push("");
    lines.push(`الاسم: ${custName.value.trim()}`);
    lines.push(`الهاتف: ${custPhone.value.trim()}`);
    lines.push(`العنوان: ${custAddress.value.trim()}`);

    if(custNote.value.trim()){
      lines.push(`ملاحظات: ${custNote.value.trim()}`);
    }

    lines.push("");
    lines.push("شكراً لكم 🌹");

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
    if(!isValidPhone(custPhone.value)){
      phoneHint.hidden = false;
      custPhone.focus();
      showToast("رقم الهاتف يجب أن يتكون من 11 رقم");
      return;
    }
    phoneHint.hidden = true;

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
  let lastFocusedEl = null;

  function openSheet(sheetEl){
    lastFocusedEl = document.activeElement;
    overlay.classList.add("show");
    sheetEl.classList.add("open");
    document.body.style.overflow = "hidden";
    const closeBtn = sheetEl.querySelector(".close-btn");
    if(closeBtn) closeBtn.focus({ preventScroll: true });
  }
  function closeSheet(sheetEl){
    sheetEl.classList.remove("open");
    if(![...document.querySelectorAll(".sheet")].some(s=> s.classList.contains("open"))){
      overlay.classList.remove("show");
      document.body.style.overflow = "";
    }
    if(lastFocusedEl && typeof lastFocusedEl.focus === "function"){
      lastFocusedEl.focus({ preventScroll: true });
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

  document.addEventListener("keydown", (e)=>{
    if(e.key === "Escape"){
      const openSheetEl = document.querySelector(".sheet.open");
      if(openSheetEl) closeSheet(openSheetEl);
    }
  });

  /* ---------------------------------------------------------
     تحقق رقم الهاتف (أرقام فقط، 11 رقم بالضبط)
     --------------------------------------------------------- */
  custPhone.addEventListener("input", ()=>{
    custPhone.value = custPhone.value.replace(/[^0-9]/g, "").slice(0, 11);
    if(!phoneHint.hidden) phoneHint.hidden = true;
  });

  /* ---------------------------------------------------------
     البحث
     --------------------------------------------------------- */
  let searchTimer = null;
  searchInput.addEventListener("input", ()=>{
    searchClear.hidden = !searchInput.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(()=>{
      if(searchInput.value.trim()){
        activeCategory = "all";
        [...categoriesNav.children].forEach(b=> b.classList.toggle("active", b.dataset.cat === "all"));
      }
      renderProducts();
    }, 200);
  });

  searchClear.addEventListener("click", ()=>{
    searchInput.value = "";
    searchClear.hidden = true;
    renderProducts();
    searchInput.focus();
  });

  /* ---------------------------------------------------------
     إبقاء الحقل المُركَّز ظاهراً فوق لوحة المفاتيح داخل النوافذ،
     وإعادة الترتيب الطبيعي تلقائياً بعد إغلاقها (لا حاجة لأي تنظيف
     يدوي لأننا لا نغيّر أي تخطيط ثابت، فقط نُمرِّر العنصر للأعلى).
     --------------------------------------------------------- */
  document.querySelectorAll(".sheet input, .sheet textarea").forEach(field=>{
    field.addEventListener("focus", ()=>{
      setTimeout(()=>{
        field.scrollIntoView({ block: "center", behavior: prefersReducedMotion ? "auto" : "smooth" });
      }, 300); // تأخير بسيط لانتظار ظهور لوحة المفاتيح قبل التمرير
    });
  });

  /* ---------------------------------------------------------
     التهيئة
     --------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", async ()=>{
    loadCart();
    initStatusEngine();
    try{
      await loadMenu();
    }catch(err){
      menuSections.innerHTML = `<p style="text-align:center;color:#8b857d;padding:40px 0">تعذر تحميل بيانات المنيو (menu.json). تأكد من رفع الملف بجانب index.html.</p>`;
      console.error(err);
    }
    updateCartFab();
  });

  /* ---------------------------------------------------------
     تسجيل الـ Service Worker (اختياري وآمن — لتفعيل PWA فقط)
     --------------------------------------------------------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => { /* تجاهل بصمت */ });
    });
  }

})();
