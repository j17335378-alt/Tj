// @ts-nocheck
/** TikJil — private library + age-gated adult vault. Mounts into a host node. */
export function mountTikjil(root) {
  "use strict";

  const DB_NAME = "tikjil-private";
  const STORE = "files";
  const KEY = "tikjil-lib-v1";
  const SAMPLE_YT = "https://youtu.be/r66V1h52F78";

  /** @typedef {{id:string,title:string,sourceUrl:string,kind:'youtube'|'tiktok'|'vimeo'|'instagram'|'remote'|'local'|'link',platform:string,platformId?:string,author?:string,thumbnail?:string,sizeBytes:number,addedAt:string,liked:boolean,views:number}} VideoItem */
  /** @typedef {{id:string,kind:string,title:string,body:string,createdAt:string,read:boolean,videoId?:string}} InboxMsg */

  const state = {
    tab: "home",
    items: /** @type {VideoItem[]} */ ([]),
    inbox: /** @type {InboxMsg[]} */ ([]),
    profile: { name: "أنا", bio: "مكتبتي الخاصة على TikJil", color: 0 },
    settings: { layout: "list", loop: true, muted: true, sort: "new", speed: 1 },
    query: "",
    filter: "all",
    resume: /** @type {Record<string, number>} */ ({}),
    seeded: false,
    watchCount: 0,
    playingId: null,
    busy: false,
    vaultPinHash: "",
    vaultFails: 0,
    vaultLockUntil: 0,
    vaultUnlocked: false,
    vaultStep: "warn",
    vaultEntry: "",
    vaultFirst: "",
    vaultShake: false,
    captureAdult: false,
    pendingMoveId: null,
    reelIndex: 0,
  };

  root.className = "tikjil-host";
  root.innerHTML = `
    <div class="app">
      <div id="offline" class="offline hidden">لا يوجد إنترنت. المحفوظات المحلية تعمل، والمقاطع من المواقع تحتاج اتصالًا.</div>
      <main id="view" class="view"></main>
      <nav class="nav" aria-label="التنقل">
        <button type="button" data-tab="home" class="nav-btn active">
          <span class="nav-ico" aria-hidden="true">⌂</span><span>الرئيسية</span>
        </button>
        <button type="button" data-tab="browser" class="nav-btn">
          <span class="nav-ico" aria-hidden="true">◎</span><span>المتصفح</span>
        </button>
        <button type="button" data-tab="manga" class="nav-btn">
          <span class="nav-ico" aria-hidden="true">文</span><span>ترجمة</span>
        </button>
        <button type="button" data-tab="recover" class="nav-btn">
          <span class="nav-ico" aria-hidden="true">↓</span><span>استرداد</span>
        </button>
        <button type="button" data-tab="inbox" class="nav-btn">
          <span class="nav-ico" aria-hidden="true">✉</span><span>الوارد</span>
          <span id="badge" class="badge hidden">0</span>
        </button>
        <button type="button" data-tab="vault" class="nav-btn">
          <span class="nav-ico" aria-hidden="true">◆</span><span>بالغين</span>
        </button>
        <button type="button" data-tab="profile" class="nav-btn">
          <span class="nav-ico" aria-hidden="true">☺</span><span>حسابي</span>
        </button>
      </nav>
    </div>
    <div id="player" class="player hidden" role="dialog" aria-modal="true"></div>
    <div id="toast" class="toast hidden" role="status"></div>`;

  const view = root.querySelector("#view");
  const playerEl = root.querySelector("#player");
  const toastEl = root.querySelector("#toast");
  const badgeEl = root.querySelector("#badge");
  const offlineEl = root.querySelector("#offline");
  let lockTimer = 0;
  let reelCtl = null;
  let reelMuted = true;
  const reelResume = new Map();

  // ─── storage ───────────────────────────────────────────────
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      state.items = Array.isArray(data.items) ? data.items : [];
      state.inbox = Array.isArray(data.inbox) ? data.inbox : [];
      state.profile = data.profile || state.profile;
      state.settings = { ...state.settings, ...(data.settings || {}) };
      state.seeded = !!data.seeded;
      state.watchCount = data.watchCount || 0;
      state.resume = data.resume && typeof data.resume === "object" ? data.resume : {};
      state.vaultPinHash = typeof data.vaultPinHash === "string" ? data.vaultPinHash : "";
      state.vaultFails = Number(data.vaultFails) || 0;
      state.vaultLockUntil = Number(data.vaultLockUntil) || 0;
    } catch {
      /* ignore corrupt */
    }
  }

  function save() {
    localStorage.setItem(
      KEY,
      JSON.stringify({
        items: state.items,
        inbox: state.inbox,
        profile: state.profile,
        settings: state.settings,
        seeded: state.seeded,
        watchCount: state.watchCount,
        resume: state.resume,
        vaultPinHash: state.vaultPinHash,
        vaultFails: state.vaultFails,
        vaultLockUntil: state.vaultLockUntil,
      }),
    );
  }

  function ensureSeed() {
    if (state.seeded) return;
    state.seeded = true;
    const now = new Date().toISOString();
    state.inbox = [
      {
        id: "seed-copy",
        kind: "tip",
        title: "حقوق النشر والاستخدام الخاص",
        body: "TikJil تطبيق خاص بك فقط. يحفظ الروابط والبيانات للمشاهدة الشخصية عبر المشغّلات الرسمية (يوتيوب، تيك توك، فيميو…). لا يستخرج ملفات المواقع المحمية ولا ينشر محتواك.",
        createdAt: now,
        read: false,
      },
      {
        id: "seed-yt",
        kind: "tip",
        title: "مواقع مثل يوتيوب",
        body: "الصق الرابط في «استرداد». المقطع يُحفظ في مكتبتك ويُشغَّل من هنا. الملف نفسه يبقى عند المنصة لأن الحماية لا تُتجاوز.",
        createdAt: now,
        read: false,
      },
      {
        id: "seed-welcome",
        kind: "welcome",
        title: "مرحبًا في TikJil",
        body: "استورد من جهازك، أو الصق رابطًا مباشرًا (mp4)، أو احفظ مقاطع المنصات في مكتبتك للتشغيل السريع.",
        createdAt: now,
        read: false,
      },
    ];
    save();
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("تعذّر فتح التخزين"));
    });
  }

  async function idbPut(id, blob) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  async function idbGet(id) {
    const db = await openDb();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result instanceof Blob ? req.result : null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob;
  }

  async function idbDel(id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  // ─── helpers ───────────────────────────────────────────────
  function uid() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
  }

  function formatBytes(n) {
    if (!n || n <= 0) return "0 B";
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return "0:00";
    const s = Math.floor(sec % 60);
    const m = Math.floor((sec / 60) % 60);
    const h = Math.floor(sec / 3600);
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => toastEl.classList.add("hidden"), 2800);
  }

  function flashSeek(stage, delta) {
    let el = stage.querySelector(".seek-flash");
    if (!el) {
      el = document.createElement("div");
      el.className = "seek-flash";
      stage.appendChild(el);
    }
    el.textContent = delta > 0 ? `+${delta} ث` : `${delta} ث`;
    el.classList.remove("show");
    // force reflow
    void el.offsetWidth;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 700);
  }

  /**
   * Attach double-tap seek (±10s) + draggable progress bar to a native <video>.
   * Does not apply to iframe embeds (YouTube/TikTok/Vimeo).
   */
  function wireNativeVideoControls(video, stage, itemId) {
    if (!video || !stage) return;

    // Overlay zones + custom scrubber
    const overlay = document.createElement("div");
    overlay.className = "seek-overlay";
    overlay.innerHTML = `
      <div class="seek-zone seek-left" data-seek="-10" aria-label="ترجيع 10 ثوانٍ"></div>
      <div class="seek-zone seek-right" data-seek="10" aria-label="تقديم 10 ثوانٍ"></div>
    `;
    stage.appendChild(overlay);

    const bar = document.createElement("div");
    bar.className = "custom-controls";
    bar.innerHTML = `
      <div class="time-row">
        <span class="cur-time">0:00</span>
        <div class="scrubber" role="slider" aria-label="شريط التقدم" tabindex="0">
          <div class="scrub-track">
            <i class="scrub-fill"></i>
            <div class="scrub-thumb"></div>
          </div>
        </div>
        <span class="dur-time">0:00</span>
        <button type="button" class="speed-btn" aria-label="سرعة التشغيل">1×</button>
      </div>
    `;
    stage.appendChild(bar);

    // ── playback speed (remembered) ──
    const SPEEDS = [1, 1.25, 1.5, 2, 0.75];
    const speedBtn = bar.querySelector(".speed-btn");
    const applySpeed = () => {
      const sp = SPEEDS.includes(state.settings.speed) ? state.settings.speed : 1;
      video.playbackRate = sp;
      if (speedBtn) speedBtn.textContent = `${sp}×`;
    };
    speedBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = SPEEDS.indexOf(state.settings.speed);
      state.settings.speed = SPEEDS[(idx + 1) % SPEEDS.length];
      save();
      applySpeed();
    });
    video.addEventListener("loadedmetadata", applySpeed);
    applySpeed();

    // ── resume where the viewer stopped ──
    if (itemId) {
      let lastSaved = 0;
      video.addEventListener("loadedmetadata", () => {
        const at = Number(state.resume[itemId]) || 0;
        if (at > 3 && video.duration && at < video.duration - 3) video.currentTime = at;
      });
      video.addEventListener("timeupdate", () => {
        const now = Date.now();
        if (now - lastSaved < 3000) return;
        lastSaved = now;
        const d = video.duration || 0;
        const c = video.currentTime || 0;
        if (d > 0 && c > d - 3) delete state.resume[itemId];
        else if (c > 3) state.resume[itemId] = Math.floor(c);
        else return;
        save();
      });
    }

    const curEl = bar.querySelector(".cur-time");
    const durEl = bar.querySelector(".dur-time");
    const fill = bar.querySelector(".scrub-fill");
    const thumb = bar.querySelector(".scrub-thumb");
    const scrubber = bar.querySelector(".scrubber");
    const track = bar.querySelector(".scrub-track");

    let dragging = false;

    function updateUI() {
      const dur = video.duration || 0;
      const cur = video.currentTime || 0;
      const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
      if (curEl) curEl.textContent = formatTime(cur);
      if (durEl) durEl.textContent = formatTime(dur);
      if (fill) fill.style.width = `${pct}%`;
      if (thumb) thumb.style.left = `${pct}%`;
    }

    video.addEventListener("timeupdate", updateUI);
    video.addEventListener("loadedmetadata", updateUI);
    video.addEventListener("durationchange", updateUI);
    video.addEventListener("seeked", updateUI);

    // Double-tap left/right
    let lastTap = { t: 0, side: null };
    const TAP_MS = 320;

    overlay.querySelectorAll(".seek-zone").forEach((zone) => {
      zone.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const side = zone.classList.contains("seek-left") ? "left" : "right";
        const now = Date.now();
        if (lastTap.side === side && now - lastTap.t < TAP_MS) {
          const delta = side === "left" ? -10 : 10;
          const next = Math.max(0, Math.min((video.duration || 0), (video.currentTime || 0) + delta));
          video.currentTime = next;
          flashSeek(stage, delta);
          updateUI();
          lastTap = { t: 0, side: null };
        } else {
          lastTap = { t: now, side };
        }
      });
    });

    // Scrub / drag progress
    function seekFromClientX(clientX) {
      const rect = track.getBoundingClientRect();
      if (!rect.width || !video.duration) return;
      // RTL: still use left-to-right percentage based on visual left
      let ratio = (clientX - rect.left) / rect.width;
      ratio = Math.max(0, Math.min(1, ratio));
      video.currentTime = ratio * video.duration;
      updateUI();
    }

    function onPointerDown(e) {
      if (!video.duration) return;
      dragging = true;
      scrubber.classList.add("dragging");
      scrubber.setPointerCapture?.(e.pointerId);
      seekFromClientX(e.clientX);
      e.preventDefault();
    }
    function onPointerMove(e) {
      if (!dragging) return;
      seekFromClientX(e.clientX);
    }
    function onPointerUp(e) {
      if (!dragging) return;
      dragging = false;
      scrubber.classList.remove("dragging");
      try {
        scrubber.releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    }

    scrubber.addEventListener("pointerdown", onPointerDown);
    scrubber.addEventListener("pointermove", onPointerMove);
    scrubber.addEventListener("pointerup", onPointerUp);
    scrubber.addEventListener("pointercancel", onPointerUp);

    // Keyboard: arrows when scrubber focused
    scrubber.addEventListener("keydown", (e) => {
      if (!video.duration) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const delta = e.key === "ArrowLeft" ? -10 : 10;
        video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
        flashSeek(stage, delta);
        updateUI();
      }
    });

    // Hide native controls so custom UI is primary (still accessible via long-press on some browsers)
    video.controls = false;
    updateUI();
  }

  function pushInbox(kind, title, body, videoId, adult) {
    const isAdult = typeof adult === "boolean" ? adult : !!state.captureAdult;
    state.inbox.unshift({
      id: uid(),
      kind,
      title,
      body,
      createdAt: new Date().toISOString(),
      read: false,
      videoId,
      adult: isAdult,
    });
    state.inbox = state.inbox.slice(0, 80);
    save();
    updateBadge();
  }

  function updateBadge() {
    const n = state.inbox.filter((m) => !m.read && !m.adult).length;
    if (n > 0) {
      badgeEl.textContent = String(n);
      badgeEl.classList.remove("hidden");
    } else {
      badgeEl.classList.add("hidden");
    }
  }

  function markIcon(lg) {
    return `<span class="mark ${lg ? "lg" : ""}" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5.5v13l11-6.5L8 5.5z"/></svg></span>`;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = String(s);
    return d.innerHTML;
  }

  // ─── platform detection ────────────────────────────────────
  function parsePlatform(raw) {
    let url;
    try {
      const t = raw.trim();
      url = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    } catch {
      return null;
    }
    const host = url.hostname.replace(/^www\./, "").replace(/^m\./, "").toLowerCase();
    const path = url.pathname;

    // YouTube
    if (host === "youtu.be") {
      const id = path.split("/").filter(Boolean)[0];
      if (id && /^[\w-]{11}$/.test(id)) return { platform: "youtube", id, pageUrl: `https://youtu.be/${id}`, kind: "youtube" };
    }
    if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "music.youtube.com") {
      let id = url.searchParams.get("v");
      const parts = path.split("/").filter(Boolean);
      if (!id && (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") && parts[1]) {
        id = parts[1];
      }
      if (id && /^[\w-]{11}$/.test(id)) return { platform: "youtube", id, pageUrl: `https://youtu.be/${id}`, kind: "youtube" };
      return { platform: "youtube", id: null, pageUrl: url.toString(), kind: "link", note: "رابط يوتيوب بدون مقطع محدد. الصق رابط المقطع نفسه." };
    }

    // TikTok
    if (host === "tiktok.com" || host.endsWith(".tiktok.com") || host === "vm.tiktok.com" || host === "vt.tiktok.com") {
      const m = path.match(/\/video\/(\d+)/) || path.match(/\/@[^/]+\/video\/(\d+)/);
      if (m) return { platform: "tiktok", id: m[1], pageUrl: url.toString(), kind: "tiktok" };
      return { platform: "tiktok", id: null, pageUrl: url.toString(), kind: "link", note: "افتح رابط المقطع المباشر من تيك توك ثم الصقه." };
    }

    // Vimeo
    if (host === "vimeo.com" || host.endsWith(".vimeo.com")) {
      const m = path.match(/\/(\d{6,})/);
      if (m) return { platform: "vimeo", id: m[1], pageUrl: url.toString(), kind: "vimeo" };
    }

    // Instagram
    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      const m = path.match(/\/(reel|p|tv)\/([^/]+)/);
      if (m) return { platform: "instagram", id: m[2], pageUrl: url.toString(), kind: "instagram" };
      return { platform: "instagram", id: null, pageUrl: url.toString(), kind: "link", note: "الصق رابط الريل أو المنشور." };
    }

    // Direct media and HLS playlists
    if (/\.m3u8(\?|#|$)/i.test(url.pathname + url.search)) {
      return { platform: "hls", id: null, pageUrl: url.toString(), kind: "remote" };
    }
    if (/\.(mp4|webm|mov|m4v|mkv|3gp)(\?|#|$)/i.test(url.pathname + url.search)) {
      return { platform: "file", id: null, pageUrl: url.toString(), kind: "remote" };
    }

    return { platform: "web", id: null, pageUrl: url.toString(), kind: "link" };
  }

  async function resolveMeta(parsed) {
    const base = {
      title: "مقطع",
      author: "",
      thumbnail: "",
    };

    if (parsed.platform === "youtube" && parsed.id) {
      base.thumbnail = `https://i.ytimg.com/vi/${parsed.id}/hqdefault.jpg`;
      base.title = "فيديو يوتيوب";
      try {
        const r = await fetch(
          `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(parsed.pageUrl)}`,
        );
        if (r.ok) {
          const j = await r.json();
          if (j.title) base.title = String(j.title).slice(0, 140);
          if (j.author_name) base.author = String(j.author_name).slice(0, 80);
          if (j.thumbnail_url) base.thumbnail = j.thumbnail_url;
        }
      } catch {
        /* offline / blocked */
      }
      return base;
    }

    if (parsed.platform === "tiktok" && parsed.id) {
      base.title = "مقطع تيك توك";
      try {
        const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(parsed.pageUrl)}`);
        if (r.ok) {
          const j = await r.json();
          if (j.title) base.title = String(j.title).slice(0, 140);
          if (j.author_name) base.author = String(j.author_name).slice(0, 80);
          if (j.thumbnail_url) base.thumbnail = j.thumbnail_url;
        }
      } catch {
        /* */
      }
      return base;
    }

    if (parsed.platform === "vimeo" && parsed.id) {
      base.title = "فيديو Vimeo";
      try {
        const r = await fetch(`https://vimeo.com/api/oembed.json?url=${encodeURIComponent(parsed.pageUrl)}`);
        if (r.ok) {
          const j = await r.json();
          if (j.title) base.title = String(j.title).slice(0, 140);
          if (j.author_name) base.author = String(j.author_name).slice(0, 80);
          if (j.thumbnail_url) base.thumbnail = j.thumbnail_url;
        }
      } catch {
        /* */
      }
      return base;
    }

    if (parsed.platform === "instagram") {
      base.title = "منشور إنستغرام";
      base.author = "Instagram";
      return base;
    }

    if (parsed.kind === "remote") {
      const name = parsed.pageUrl.split("/").pop()?.split("?")[0] || "فيديو";
      base.title = decodeURIComponent(name).replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ") || "فيديو مباشر";
      return base;
    }

    base.title = parsed.pageUrl;
    return base;
  }

  function embedUrl(item) {
    if (item.kind === "youtube" && item.platformId) {
      return `https://www.youtube-nocookie.com/embed/${item.platformId}?rel=0&modestbranding=1&playsinline=1&autoplay=1`;
    }
    if (item.kind === "tiktok" && item.platformId) {
      return `https://www.tiktok.com/embed/v2/${item.platformId}`;
    }
    if (item.kind === "vimeo" && item.platformId) {
      return `https://player.vimeo.com/video/${item.platformId}?autoplay=1`;
    }
    return null;
  }

  function platformLabel(item) {
    if (item.platform === "hls") return "فيديو HLS";
    const map = {
      youtube: "يوتيوب",
      tiktok: "تيك توك",
      vimeo: "Vimeo",
      instagram: "إنستغرام",
      remote: "رابط مباشر",
      local: "من الجهاز",
      link: "رابط",
    };
    return map[item.kind] || item.platform || "مقطع";
  }

  // ─── library ops ───────────────────────────────────────────
  function findBySource(url) {
    return state.items.find((i) => i.sourceUrl === url);
  }

  function claimExisting(existing) {
    if (!existing) return null;
    if (state.captureAdult && !existing.adult) {
      existing.adult = true;
      save();
      return existing;
    }
    if (!state.captureAdult && existing.adult) {
      throw new Error("هذا الرابط داخل قسم البالغين، ولن يُعرض في المكتبة العادية.");
    }
    return existing;
  }

  function publicItems() {
    return state.items.filter((i) => !i.adult);
  }

  function adultItems() {
    return state.items.filter((i) => i.adult);
  }

  /** Public items after filter chip + sort + search query (list/grid views). */
  function searchText(i) {
    return `${i.title || ""} ${i.author || ""} ${platformLabel(i)}`.toLowerCase();
  }

  function shownItems() {
    let list = publicItems();
    if (state.filter === "liked") list = list.filter((i) => i.liked);
    const q = state.query.trim().toLowerCase();
    if (q) list = list.filter((i) => searchText(i).includes(q));
    const sort = state.settings.sort;
    const by = {
      new: (a, b) => String(b.addedAt).localeCompare(String(a.addedAt)),
      old: (a, b) => String(a.addedAt).localeCompare(String(b.addedAt)),
      views: (a, b) => (b.views || 0) - (a.views || 0),
      title: (a, b) => String(a.title).localeCompare(String(b.title), "ar"),
    }[sort];
    return by ? [...list].sort(by) : list;
  }

  function addItem(item) {
    if (state.captureAdult) item.adult = true;
    state.items = [item, ...state.items.filter((i) => i.id !== item.id && i.sourceUrl !== item.sourceUrl)];
    save();
  }

  async function savePlatformClip(parsed, meta) {
    if (!parsed.id && parsed.kind !== "instagram" && parsed.kind !== "link") {
      throw new Error(parsed.note || "الرابط غير مكتمل.");
    }
    const existing = claimExisting(findBySource(parsed.pageUrl));
    if (existing) return existing;

    const kind =
      parsed.kind === "youtube" || parsed.kind === "tiktok" || parsed.kind === "vimeo" || parsed.kind === "instagram"
        ? parsed.kind
        : "link";

    /** @type {VideoItem} */
    const item = {
      id: uid(),
      title: meta.title || "مقطع",
      sourceUrl: parsed.pageUrl,
      kind,
      platform: parsed.platform,
      platformId: parsed.id || undefined,
      author: meta.author || "",
      thumbnail: meta.thumbnail || "",
      sizeBytes: 0,
      addedAt: new Date().toISOString(),
      liked: false,
      views: 0,
    };
    addItem(item);
    pushInbox(
      "stream",
      state.captureAdult ? "تم الحفظ في قسم البالغين" : "تم الحفظ في المكتبة",
      `«${item.title}» من ${platformLabel(item)}. يُشغَّل عبر المشغّل الرسمي — الملف يبقى عند المنصة احترامًا لحقوق النشر.`,
      item.id,
    );
    return item;
  }

  async function importLocal(file) {
    if (!file) throw new Error("لم يُختر ملف.");
    const ok = file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);
    if (!ok) throw new Error("اختر ملف فيديو.");
    if (file.size < 1024) throw new Error("الملف صغير جدًا.");
    const sourceUrl = `local:${file.name}:${file.size}`;
    const existing = findBySource(sourceUrl);
    if (existing) {
      if (!!existing.adult === !!state.captureAdult) throw new Error("هذا الملف مستورد مسبقًا.");
      return claimExisting(existing);
    }
    const id = uid();
    await idbPut(id, file);
    const title = file.name.replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim() || "فيديو";
    /** @type {VideoItem} */
    const item = {
      id,
      title,
      sourceUrl,
      kind: "local",
      platform: "local",
      sizeBytes: file.size,
      addedAt: new Date().toISOString(),
      liked: false,
      views: 0,
    };
    addItem(item);
    pushInbox(
      "imported",
      state.captureAdult ? "تم الاستيراد إلى قسم البالغين" : "تم الاستيراد",
      state.captureAdult
        ? `«${title}» (${formatBytes(file.size)}) داخل الخزنة فقط، ولن يظهر في المكتبة العادية.`
        : `«${title}» (${formatBytes(file.size)}) نُسخ إلى مكتبتك الخاصة.`,
      id,
    );
    return item;
  }

  async function downloadHls(url, title, onProgress = () => {}) {
    const requestText = async (src) => {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`تعذّر جلب قائمة HLS (HTTP ${response.status}).`);
      return response.text();
    };
    let playlistUrl = url;
    let playlist = await requestText(playlistUrl);
    if (!playlist.trimStart().startsWith("#EXTM3U")) throw new Error("الرابط لا يحتوي على قائمة HLS صالحة.");

    // Master playlist: select the highest-bandwidth variant.
    if (/#EXT-X-STREAM-INF:/i.test(playlist)) {
      const lines = playlist.split(/\r?\n/);
      let variants = [];
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
          const bandwidth = Number((lines[i].match(/BANDWIDTH=(\d+)/i) || [])[1] || 0);
          const uri = lines.slice(i + 1).find((line) => line.trim() && !line.trim().startsWith("#"));
          if (uri) variants.push({ bandwidth, url: new URL(uri.trim(), playlistUrl).href });
        }
      }
      if (!variants.length) throw new Error("لم أجد مسار فيديو داخل قائمة HLS.");
      playlistUrl = variants.sort((a, b) => b.bandwidth - a.bandwidth)[0].url;
      playlist = await requestText(playlistUrl);
    }

    if (/#EXT-X-KEY:/i.test(playlist) && !/#EXT-X-KEY:.*METHOD=NONE/i.test(playlist)) {
      throw new Error("هذه القائمة مشفّرة. لا يمكن لهذا الإصدار فك DRM أو مفاتيح التشفير؛ استخدم تنزيلًا رسميًا من المصدر.");
    }
    if (/#EXT-X-BYTERANGE:/i.test(playlist)) throw new Error("هذه القائمة تستخدم مقاطع جزئية (BYTERANGE)، وهي غير مدعومة بعد.");

    const lines = playlist.split(/\r?\n/);
    const segments = [];
    let initUrl = null;
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("#EXT-X-MAP:")) {
        const match = t.match(/URI="([^"]+)"/i);
        if (match) initUrl = new URL(match[1], playlistUrl).href;
      } else if (t && !t.startsWith("#")) {
        segments.push(new URL(t, playlistUrl).href);
      }
    }
    if (!segments.length) throw new Error("لم يتم العثور على مقاطع فيديو في قائمة HLS.");
    if (segments.length > 2000) throw new Error("القائمة طويلة جدًا للتنزيل داخل المتصفح (أكثر من 2000 مقطع).");

    const parts = [];
    if (initUrl) {
      const initResponse = await fetch(initUrl);
      if (!initResponse.ok) throw new Error("تعذّر تنزيل مقطع التهيئة.");
      parts.push(await initResponse.blob());
    }
    let completed = 0;
    // Fetch in small batches while preserving playlist order.
    for (let start = 0; start < segments.length; start += 4) {
      const batch = segments.slice(start, start + 4);
      const blobs = await Promise.all(batch.map(async (segmentUrl) => {
        let lastError;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await fetch(segmentUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.blob();
          } catch (error) {
            lastError = error;
          }
        }
        throw new Error(`تعذّر تنزيل أحد المقاطع بعد 3 محاولات: ${lastError?.message || "خطأ اتصال"}`);
      }));
      parts.push(...blobs);
      completed += batch.length;
      onProgress(completed, segments.length);
    }
    const mime = initUrl ? "video/mp4" : "video/mp2t";
    const blob = new Blob(parts, { type: mime });
    if (blob.size < 1024) throw new Error("الملف الناتج صغير أو غير مكتمل.");
    const id = uid();
    await idbPut(id, blob);
    const item = {
      id, title: title || "فيديو HLS", sourceUrl: url, kind: "local", platform: "hls",
      sizeBytes: blob.size, addedAt: new Date().toISOString(), liked: false, views: 0,
    };
    addItem(item);
    pushInbox("saved", "اكتمل تنزيل الفيديو", `«${item.title}» — ${segments.length} مقطع تم جمعها في ملف واحد (${formatBytes(blob.size)}).`, id);
    return item;
  }

  async function trySaveDirect(url, title, onProgress = () => {}) {
    const existing = claimExisting(findBySource(url));
    if (existing) return existing;
    if (/\.m3u8(\?|#|$)/i.test(url)) return downloadHls(url, title, onProgress);
    // Attempt client fetch — works only when CORS allows
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`رمز ${res.status}`);
      const type = (res.headers.get("content-type") || "").toLowerCase();
      if (type.includes("html")) throw new Error("الرابط صفحة وليس ملف فيديو.");
      const blob = await res.blob();
      if (blob.size < 1024) throw new Error("الملف صغير جدًا.");
      const id = uid();
      await idbPut(id, blob);
      /** @type {VideoItem} */
      const item = {
        id,
        title: title || "فيديو",
        sourceUrl: url,
        kind: "local",
        platform: "file",
        sizeBytes: blob.size,
        addedAt: new Date().toISOString(),
        liked: false,
        views: 0,
      };
      addItem(item);
      pushInbox(
        "saved",
        state.captureAdult ? "تم حفظ الملف في قسم البالغين" : "تم حفظ الملف",
        `«${item.title}» (${formatBytes(blob.size)}) محفوظ محليًا${state.captureAdult ? " داخل الخزنة" : ""}.`,
        id,
      );
      return item;
    } catch {
      // Fall back to remote stream entry
      /** @type {VideoItem} */
      const item = {
        id: uid(),
        title: title || "فيديو مباشر",
        sourceUrl: url,
        kind: "remote",
        platform: "file",
        sizeBytes: 0,
        addedAt: new Date().toISOString(),
        liked: false,
        views: 0,
      };
      addItem(item);
      pushInbox(
        "stream",
        "أُضيف للبث",
        `«${item.title}» يُشغَّل من الرابط مباشرة. التحميل المحلي تعذّر بسبب قيود المتصفح (CORS) — جرّب الاستيراد من الجهاز إن حمّلته يدويًا.`,
        item.id,
      );
      return item;
    }
  }

  function removeItem(id) {
    const item = state.items.find((i) => i.id === id);
    if (item?.kind === "local") void idbDel(id);
    state.items = state.items.filter((i) => i.id !== id);
    delete state.resume[id];
    if (state.playingId === id) closePlayer();
    save();
    render();
  }

  function toggleLike(id) {
    state.items = state.items.map((i) => (i.id === id ? { ...i, liked: !i.liked } : i));
    save();
    render();
  }

  // ─── player ────────────────────────────────────────────────
  async function openPlayer(id) {
    const item = state.items.find((i) => i.id === id);
    if (!item) return;
    if (item.adult && !state.vaultUnlocked) {
      toast("هذا المقطع داخل قسم البالغين");
      return;
    }
    reelCtl?.pause();
    state.playingId = id;
    if (!item.adult) state.watchCount += 1;
    state.items = state.items.map((i) => (i.id === id ? { ...i, views: i.views + 1 } : i));
    save();

    const emb = embedUrl(item);
    const isNative = item.kind === "local" || item.kind === "remote";
    let stageInner = "";
    if (emb) {
      stageInner = `<iframe title="${escapeHtml(item.title)}" src="${emb}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
    } else if (item.kind === "local") {
      stageInner = ""; // filled below after blob load
    } else if (item.kind === "remote") {
      stageInner = `<video playsinline autoplay src="${escapeHtml(item.sourceUrl)}" style="width:100%;height:100%;object-fit:contain"></video>`;
    } else if (item.kind === "instagram" || item.kind === "link") {
      stageInner = `<div style="display:grid;place-items:center;height:100%;padding:1.5rem;text-align:center;background:var(--surface);color:var(--fg)">
        <div>
          <p style="font-weight:800;margin:0 0 .5rem">يُفتح من الرابط الأصلي</p>
          <p class="muted" style="margin:0 0 1rem">هذه المنصة لا توفّر تضمينًا حرًا داخل التطبيق. الرابط محفوظ في مكتبتك.</p>
          <a class="btn btn-primary" style="width:auto;display:inline-flex" href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">فتح المصدر</a>
        </div>
      </div>`;
    }

    const seekHint = isNative
      ? `<div class="seek-hint muted">ضغطتان يمين = +10ث · ضغطتان يسار = −10ث · اسحب الشريط للتنقل</div>`
      : "";

    playerEl.innerHTML = `
      <div class="player-inner">
        <div class="player-top">
          <button type="button" class="icon-btn" data-close aria-label="إغلاق">✕</button>
          <div class="title">${escapeHtml(item.title)}</div>
          <button type="button" class="icon-btn ${item.liked ? "liked" : ""}" data-like aria-label="إعجاب">♥</button>
        </div>
        <div class="player-stage ${isNative ? "native-stage" : ""}" id="player-stage">${stageInner}</div>
        <div class="player-foot">
          ${item.author ? `<div class="muted">${escapeHtml(item.author)}</div>` : ""}
          ${seekHint}
          <div class="muted" style="font-size:.8rem;line-height:1.55">
            ${
              emb
                ? "التشغيل عبر المشغّل الرسمي للمنصة. التحكم بالتقديم/الترجيع من داخل مشغّل المنصة."
                : item.kind === "local"
                  ? "ملف محفوظ على جهازك داخل TikJil."
                  : "محفوظ في مكتبتك الخاصة."
            }
          </div>
          ${
            item.adult
              ? `<button type="button" class="btn btn-ghost" data-unvault>إرجاع إلى المكتبة العادية</button>`
              : `<button type="button" class="btn btn-ghost" data-tovault>إخفاء في قسم البالغين</button>`
          }
        </div>
      </div>`;
    playerEl.classList.remove("hidden");

    playerEl.querySelector("[data-close]")?.addEventListener("click", closePlayer);
    playerEl.querySelector("[data-like]")?.addEventListener("click", () => {
      toggleLike(item.id);
      openPlayer(item.id);
    });
    playerEl.querySelector("[data-tovault]")?.addEventListener("click", () => {
      state.pendingMoveId = item.id;
      closePlayer();
      state.tab = "vault";
      state.vaultUnlocked = false;
      state.vaultStep = "warn";
      state.vaultEntry = "";
      syncNav();
      render();
    });
    playerEl.querySelector("[data-unvault]")?.addEventListener("click", () => {
      state.items = state.items.map((i) => (i.id === item.id ? { ...i, adult: false } : i));
      save();
      closePlayer();
      toast("عاد إلى المكتبة العادية");
      render();
    });

    const stageHost = playerEl.querySelector("#player-stage");

    if (item.kind === "local") {
      const blob = await idbGet(item.id);
      if (stageHost && blob) {
        const url = URL.createObjectURL(blob);
        const video = document.createElement("video");
        video.playsInline = true;
        video.autoplay = true;
        video.loop = state.settings.loop;
        video.src = url;
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "contain";
        stageHost.appendChild(video);
        video.addEventListener("emptied", () => URL.revokeObjectURL(url), { once: true });
        wireNativeVideoControls(video, stageHost, item.id);
      } else if (stageHost) {
        stageHost.innerHTML = `<p class="muted" style="padding:2rem;text-align:center">تعذّر قراءة الملف المحلي.</p>`;
      }
    } else if (item.kind === "remote" && stageHost) {
      const video = stageHost.querySelector("video");
      if (video) {
        video.loop = state.settings.loop;
        wireNativeVideoControls(video, stageHost, item.id);
      }
    }
  }

  function closePlayer() {
    const wasOpen = state.playingId !== null;
    state.playingId = null;
    playerEl.classList.add("hidden");
    playerEl.innerHTML = "";
    if (wasOpen) reelCtl?.resume();
  }

  // ─── reels ─────────────────────────────────────────────────
  function isNativeItem(i) {
    return i.kind === "local" || i.kind === "remote";
  }

  function teardownReels() {
    if (reelCtl) {
      reelCtl.destroy();
      reelCtl = null;
    }
  }

  function reelHtml(i) {
    const native = isNativeItem(i);
    const thumb = i.thumbnail ? escapeHtml(i.thumbnail) : "";
    const meta = [platformLabel(i), i.author ? escapeHtml(i.author) : "", i.sizeBytes ? formatBytes(i.sizeBytes) : ""]
      .filter(Boolean)
      .join(" · ");
    return `
      <article class="reel ${native ? "native" : "embed"}" data-id="${i.id}">
        <div class="reel-stage">
          ${thumb ? `<img class="reel-bg" src="${thumb}" alt="" />` : ""}
          ${thumb ? `<img class="reel-poster" src="${thumb}" alt="" />` : `<div class="reel-poster ph">▶</div>`}
          <div class="reel-spin" aria-hidden="true"></div>
          <div class="reel-pause" aria-hidden="true">▶</div>
          <div class="reel-msg">تعذّر تشغيل المقطع هنا. افتحه في المشغّل الكامل.</div>
        </div>
        ${
          native
            ? `<div class="reel-tap"></div>`
            : `<button type="button" class="reel-open" data-play="${i.id}" aria-label="تشغيل"><span class="reel-bigplay">▶</span></button>`
        }
        <div class="reel-shade"></div>
        <div class="reel-cap">
          <div class="reel-title">${escapeHtml(i.title)}</div>
          <div class="reel-meta">${meta}${native ? "" : " · المشغّل الرسمي"}</div>
        </div>
        <div class="reel-actions">
          <button type="button" class="reel-btn ${i.liked ? "liked" : ""}" data-rlike="${i.id}" aria-label="إعجاب">♥</button>
          ${native ? `<button type="button" class="reel-btn" data-rmute aria-label="الصوت">${reelMuted ? "🔇" : "🔊"}</button>` : ""}
          <button type="button" class="reel-btn" data-play="${i.id}" aria-label="فتح المشغّل الكامل">⤢</button>
          <button type="button" class="reel-btn" data-del="${i.id}" aria-label="حذف">🗑</button>
        </div>
        ${
          native
            ? `<div class="reel-scrub" role="slider" tabindex="0" aria-label="شريط التقدم" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="reel-track"><i class="reel-fill"></i><b class="reel-thumb"></b></div>
          <div class="reel-bubble">0:00 / 0:00</div>
        </div>`
            : ""
        }
      </article>`;
  }

  function mountReels(feed) {
    const reels = Array.from(feed.querySelectorAll(".reel"));
    const counter = feed.parentElement.querySelector(".reels-count");
    const live = new Map(); // reel element -> { cancelled, video, url, counted }
    let activeIdx = -1;
    let activateTimer = 0;
    let tapTimer = 0;
    let raf = 0;
    let destroyed = false;
    let drag = null;
    let lastTap = { t: 0, id: "" };

    const itemOf = (el) => state.items.find((i) => i.id === el.dataset.id);
    const videoOf = (el) => live.get(el)?.video || null;
    const canPlay = () => !destroyed && !state.playingId && !document.hidden && state.tab === "home";

    function paint(el, curOverride) {
      const scrub = el.querySelector(".reel-scrub");
      if (!scrub) return;
      const v = videoOf(el);
      const dur = v && Number.isFinite(v.duration) ? v.duration : 0;
      const cur = typeof curOverride === "number" ? curOverride : v ? v.currentTime || 0 : 0;
      const pct = dur > 0 ? Math.min(100, Math.max(0, (cur / dur) * 100)) : 0;
      scrub.querySelector(".reel-fill").style.width = `${pct}%`;
      scrub.querySelector(".reel-thumb").style.left = `${pct}%`;
      const bub = scrub.querySelector(".reel-bubble");
      bub.style.left = `${Math.min(86, Math.max(14, pct))}%`;
      bub.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
      scrub.setAttribute("aria-valuenow", String(Math.round(pct)));
      scrub.setAttribute("aria-valuetext", `${formatTime(cur)} من ${formatTime(dur)}`);
    }

    function countView(id) {
      if (!state.items.some((i) => i.id === id)) return;
      state.items = state.items.map((i) => (i.id === id ? { ...i, views: i.views + 1 } : i));
      state.watchCount += 1;
      save();
    }

    async function tryPlay(v, el) {
      try {
        await v.play();
      } catch {
        if (videoOf(el) !== v) return;
        if (!v.muted) {
          v.muted = true;
          reelMuted = true;
          syncMuteIcons();
          try {
            await v.play();
            return;
          } catch {
            /* fall through */
          }
        }
        el.classList.add("paused");
      }
    }

    function syncMuteIcons() {
      feed.querySelectorAll("[data-rmute]").forEach((b) => {
        b.textContent = reelMuted ? "🔇" : "🔊";
      });
    }

    function release(el) {
      const entry = live.get(el);
      if (!entry) return;
      entry.cancelled = true;
      live.delete(el);
      const v = entry.video;
      if (v) {
        const id = el.dataset.id;
        if (Number.isFinite(v.duration) && v.currentTime > 1 && v.currentTime < v.duration - 1) {
          reelResume.set(id, v.currentTime);
        } else {
          reelResume.delete(id);
        }
        v.pause();
        v.removeAttribute("src");
        v.load();
        v.remove();
      }
      if (entry.url) URL.revokeObjectURL(entry.url);
      el.classList.remove("has-video", "ready", "paused", "buffering", "failed", "scrubbing");
      paint(el);
    }

    async function activate(el) {
      const item = itemOf(el);
      if (!item || !isNativeItem(item) || live.has(el) || !canPlay()) return;
      const entry = { cancelled: false, video: null, url: null, counted: false };
      live.set(el, entry);
      let src = item.sourceUrl;
      if (item.kind === "local") {
        let blob = null;
        try {
          blob = await idbGet(item.id);
        } catch {
          /* ignore */
        }
        if (entry.cancelled) return;
        if (!blob) {
          el.classList.add("failed");
          return;
        }
        entry.url = URL.createObjectURL(blob);
        src = entry.url;
      }
      const v = document.createElement("video");
      v.className = "reel-video";
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.muted = reelMuted;
      v.loop = !!state.settings.loop;
      v.preload = "auto";
      entry.video = v;

      v.addEventListener("loadedmetadata", () => {
        if (v.videoHeight > v.videoWidth * 1.1) v.style.objectFit = "cover";
        const t = reelResume.get(item.id);
        if (t && Number.isFinite(v.duration) && t < v.duration - 1) {
          try {
            v.currentTime = t;
          } catch {
            /* ignore */
          }
        }
        paint(el);
      });
      v.addEventListener("loadeddata", () => el.classList.add("ready"));
      v.addEventListener("timeupdate", () => {
        if (!(drag && drag.el === el)) paint(el);
        if (!entry.counted && v.currentTime > 3) {
          entry.counted = true;
          countView(item.id);
        }
      });
      v.addEventListener("durationchange", () => paint(el));
      v.addEventListener("play", () => el.classList.remove("paused"));
      v.addEventListener("pause", () => {
        if (!entry.cancelled) el.classList.add("paused");
      });
      v.addEventListener("waiting", () => el.classList.add("buffering"));
      v.addEventListener("playing", () => {
        el.classList.remove("buffering");
        el.classList.add("ready");
      });
      v.addEventListener("canplay", () => el.classList.remove("buffering"));
      v.addEventListener("ended", () => {
        if (!v.loop && !entry.cancelled) goTo(activeIdx + 1);
      });
      v.addEventListener("error", () => {
        if (entry.cancelled) return;
        el.classList.remove("buffering");
        el.classList.add("failed");
      });

      v.src = src;
      el.querySelector(".reel-stage").appendChild(v);
      el.classList.add("has-video", "buffering");
      if (canPlay()) void tryPlay(v, el);
      else el.classList.add("paused");
    }

    function setActive(idx) {
      if (idx === activeIdx) return;
      const prev = reels[activeIdx];
      activeIdx = idx;
      state.reelIndex = idx;
      if (counter) counter.textContent = `${idx + 1} / ${reels.length}`;
      clearTimeout(activateTimer);
      if (prev) release(prev);
      const el = reels[idx];
      if (el) activateTimer = setTimeout(() => void activate(el), 120);
    }

    function goTo(idx) {
      if (idx < 0 || idx >= reels.length) return;
      feed.scrollTo({ top: idx * feed.clientHeight, behavior: "smooth" });
    }

    function togglePlay(el, v) {
      if (v.paused) void tryPlay(v, el);
      else v.pause();
    }

    function seekBy(el, v, delta) {
      const dur = Number.isFinite(v.duration) ? v.duration : 0;
      v.currentTime = Math.max(0, Math.min(dur || Infinity, (v.currentTime || 0) + delta));
      flashSeek(el, delta);
      paint(el);
    }

    function setLiked(el, liked) {
      const id = el.dataset.id;
      state.items = state.items.map((i) => (i.id === id ? { ...i, liked } : i));
      save();
      el.querySelector("[data-rlike]")?.classList.toggle("liked", liked);
    }

    function likeBurst(el, x, y) {
      if (!itemOf(el)?.liked) setLiked(el, true);
      const h = document.createElement("div");
      h.className = "heart-burst";
      h.textContent = "♥";
      h.style.left = `${x}px`;
      h.style.top = `${y}px`;
      el.appendChild(h);
      setTimeout(() => h.remove(), 750);
    }

    // ── scrolling between reels
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const h = feed.clientHeight || 1;
        setActive(Math.max(0, Math.min(reels.length - 1, Math.round(feed.scrollTop / h))));
      });
    }
    feed.addEventListener("scroll", onScroll, { passive: true });

    // ── tap: play/pause · double tap: ±10s on the sides, like in the middle
    feed.addEventListener("click", (e) => {
      const tap = e.target.closest(".reel-tap");
      if (!tap) return;
      const el = tap.closest(".reel");
      const v = videoOf(el);
      const rect = el.getBoundingClientRect();
      const frac = (e.clientX - rect.left) / rect.width;
      const now = Date.now();
      clearTimeout(tapTimer);
      if (lastTap.id === el.dataset.id && now - lastTap.t < 300) {
        lastTap = { t: 0, id: "" };
        if (v && frac < 0.33) seekBy(el, v, -10);
        else if (v && frac > 0.67) seekBy(el, v, 10);
        else likeBurst(el, e.clientX - rect.left, e.clientY - rect.top);
        return;
      }
      lastTap = { t: now, id: el.dataset.id };
      tapTimer = setTimeout(() => {
        if (v && videoOf(el) === v) togglePlay(el, v);
      }, 280);
    });

    // ── action buttons
    feed.addEventListener("click", (e) => {
      const like = e.target.closest("[data-rlike]");
      if (like) {
        e.stopPropagation();
        const el = like.closest(".reel");
        setLiked(el, !itemOf(el)?.liked);
        return;
      }
      const mute = e.target.closest("[data-rmute]");
      if (mute) {
        e.stopPropagation();
        reelMuted = !reelMuted;
        live.forEach((en) => {
          if (en.video) en.video.muted = reelMuted;
        });
        syncMuteIcons();
      }
    });

    // ── draggable progress bar
    function scrubTo(clientX) {
      if (!drag) return;
      const rect = drag.el.querySelector(".reel-track").getBoundingClientRect();
      if (!rect.width) return;
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const t = ratio * drag.v.duration;
      drag.v.currentTime = t;
      paint(drag.el, t);
    }

    feed.addEventListener("pointerdown", (e) => {
      const scrub = e.target.closest(".reel-scrub");
      if (!scrub) return;
      const el = scrub.closest(".reel");
      const v = videoOf(el);
      if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return;
      e.preventDefault();
      clearTimeout(tapTimer);
      drag = { el, v, scrub, id: e.pointerId, wasPlaying: !v.paused };
      el.classList.add("scrubbing");
      scrub.classList.add("dragging");
      v.pause();
      try {
        scrub.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      scrubTo(e.clientX);
    });
    feed.addEventListener("pointermove", (e) => {
      if (drag && e.pointerId === drag.id) scrubTo(e.clientX);
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      d.el.classList.remove("scrubbing");
      d.scrub.classList.remove("dragging");
      try {
        d.scrub.releasePointerCapture(d.id);
      } catch {
        /* ignore */
      }
      if (d.wasPlaying) void tryPlay(d.v, d.el);
    }
    feed.addEventListener("pointerup", endDrag);
    feed.addEventListener("pointercancel", endDrag);

    // keyboard on the bar: ← → ±5s, Home/End
    feed.addEventListener("keydown", (e) => {
      const scrub = e.target.closest?.(".reel-scrub");
      if (!scrub) return;
      const el = scrub.closest(".reel");
      const v = videoOf(el);
      if (!v || !Number.isFinite(v.duration)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        seekBy(el, v, e.key === "ArrowLeft" ? -5 : 5);
      } else if (e.key === "Home") {
        e.preventDefault();
        v.currentTime = 0;
        paint(el);
      } else if (e.key === "End") {
        e.preventDefault();
        v.currentTime = Math.max(0, v.duration - 0.2);
        paint(el);
      }
    });

    // ── page-level keys + tab visibility
    function onDocKey(e) {
      if (state.tab !== "home" || state.playingId) return;
      const tag = (document.activeElement?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea") return;
      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === "j") {
        e.preventDefault();
        goTo(activeIdx + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp" || e.key === "k") {
        e.preventDefault();
        goTo(activeIdx - 1);
      } else if (e.key === "m") {
        feed.querySelector(".reel.has-video [data-rmute]")?.click();
      }
    }
    function onVisibility() {
      if (document.hidden) api.pause();
      else api.resume();
    }
    document.addEventListener("keydown", onDocKey);
    document.addEventListener("visibilitychange", onVisibility);

    const api = {
      pause() {
        clearTimeout(activateTimer);
        live.forEach((en) => en.video?.pause());
      },
      resume() {
        const el = reels[activeIdx];
        if (!el || !canPlay()) return;
        const v = videoOf(el);
        if (v) void tryPlay(v, el);
        else void activate(el);
      },
      destroy() {
        destroyed = true;
        clearTimeout(activateTimer);
        clearTimeout(tapTimer);
        cancelAnimationFrame(raf);
        document.removeEventListener("keydown", onDocKey);
        document.removeEventListener("visibilitychange", onVisibility);
        Array.from(live.keys()).forEach(release);
      },
    };

    // start at the remembered reel
    const start = Math.max(0, Math.min(reels.length - 1, state.reelIndex || 0));
    feed.scrollTop = start * feed.clientHeight;
    setActive(start);
    return api;
  }

  // ─── recover flow ──────────────────────────────────────────
  async function recoverUrl(raw, onProgress = () => {}) {
    const parsed = parsePlatform(raw);
    if (!parsed) throw new Error("الرابط غير صالح. يجب أن يبدأ بـ http:// أو https://");

    if (parsed.note && !parsed.id && parsed.kind === "link" && parsed.platform !== "web") {
      throw new Error(parsed.note);
    }

    if (parsed.kind === "remote") {
      const meta = await resolveMeta(parsed);
      return { mode: "file", parsed, meta, item: await trySaveDirect(parsed.pageUrl, meta.title, onProgress) };
    }

    if (parsed.kind === "youtube" || parsed.kind === "tiktok" || parsed.kind === "vimeo" || parsed.kind === "instagram") {
      if (!parsed.id && parsed.kind !== "instagram") throw new Error(parsed.note || "حدّد رابط المقطع.");
      const meta = await resolveMeta(parsed);
      const item = await savePlatformClip(parsed, meta);
      return { mode: "platform", parsed, meta, item };
    }

    // Generic web link — save as bookmark entry
    const meta = await resolveMeta(parsed);
    meta.title = meta.title === "مقطع" ? "رابط محفوظ" : meta.title;
    const item = await savePlatformClip({ ...parsed, kind: "link" }, meta);
    return { mode: "link", parsed, meta, item };
  }

  // ─── views ─────────────────────────────────────────────────
  function renderHome() {
    const { layout } = state.settings;
    const allItems = publicItems();
    const reelsOn = layout === "reels" && allItems.length > 0;
    const items = reelsOn ? allItems : shownItems();

    let body = "";
    if (!allItems.length) {
      body = `
        <div class="empty card">
          ${markIcon(true)}
          <h2 class="h2">مكتبتك فاضية</h2>
          <p class="muted">الصق رابط يوتيوب أو تيك توك أو فيميو في «استرداد»، أو استورد فيديو من جهازك. المقاطع تُحفظ هنا للتشغيل السريع.</p>
          <button type="button" class="btn btn-primary mt" data-go="recover">استرداد رابط</button>
          <button type="button" class="btn btn-ghost mt-sm" data-go="browser">فتح المتصفح</button>
        </div>`;
    } else if (layout === "grid") {
      body = `<div class="grid">${items
        .map(
          (i) => `
        <button type="button" class="grid-card" data-play="${i.id}" data-q="${escapeHtml(searchText(i))}">
          ${i.thumbnail ? `<img class="thumb" src="${escapeHtml(i.thumbnail)}" alt="" />` : `<div class="thumb ph">▶</div>`}
          <div class="pad">${escapeHtml(i.title)}</div>
        </button>`,
        )
        .join("")}</div>`;
    } else if (layout === "reels") {
      body = `<div class="reels-wrap">
        <div class="reels-count">1 / ${items.length}</div>
        <div class="reels" tabindex="-1">${items.map(reelHtml).join("")}</div>
      </div>`;
    } else {
      body = `<div class="video-list">${items
        .map(
          (i) => `
        <div class="video-row" data-q="${escapeHtml(searchText(i))}">
          <button type="button" data-play="${i.id}" style="display:contents">
            ${i.thumbnail ? `<img class="thumb" src="${escapeHtml(i.thumbnail)}" alt="" />` : `<div class="thumb ph">▶</div>`}
            <div style="flex:1;min-width:0;text-align:start">
              <p class="title">${escapeHtml(i.title)}</p>
              <div class="meta">${platformLabel(i)}${i.author ? " · " + escapeHtml(i.author) : ""}${i.sizeBytes ? " · " + formatBytes(i.sizeBytes) : ""}</div>
            </div>
          </button>
          <button type="button" class="icon-btn" data-del="${i.id}" aria-label="حذف">🗑</button>
        </div>`,
        )
        .join("")}</div>`;
    }

    view.innerHTML = `
      <div class="between mb">
        <div class="row">${markIcon()}<h1 class="h1">TikJil</h1></div>
        <div class="seg" style="grid-template-columns:repeat(3,auto);width:auto">
          <button type="button" data-layout="list" class="${layout === "list" ? "on" : ""}">قائمة</button>
          <button type="button" data-layout="grid" class="${layout === "grid" ? "on" : ""}">شبكة</button>
          <button type="button" data-layout="reels" class="${layout === "reels" ? "on" : ""}">ريلز</button>
        </div>
      </div>
      ${reelsOn ? "" : `<button type="button" class="vault-door mb" data-go="vault">
        <span class="age-pill" aria-hidden="true">18+</span>
        <span class="vault-door-copy">
          <strong>قسم البالغين · NSFW</strong>
          <span>مخفي عن المكتبة. دخوله بتحذير ورقم سري.</span>
        </span>
        <span class="vault-door-go" aria-hidden="true">دخول</span>
      </button>`}
      ${allItems.length && !reelsOn ? toolbarHtml() : ""}
      ${body}
      ${allItems.length && !reelsOn ? `<p id="noresult" class="muted ${items.length ? "hidden" : ""}" style="padding:1.5rem 0;text-align:center">ما فيه نتائج مطابقة.</p>` : ""}`;

    bindToolbar();
    view.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => {
        goTab(b.getAttribute("data-go"));
      }),
    );
    view.querySelectorAll("[data-layout]").forEach((b) =>
      b.addEventListener("click", () => {
        state.settings.layout = b.getAttribute("data-layout");
        save();
        render();
      }),
    );
    view.querySelectorAll("[data-play]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        openPlayer(b.getAttribute("data-play") || b.closest("[data-play]")?.getAttribute("data-play"));
      }),
    );
    view.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("حذف من المكتبة؟")) removeItem(b.getAttribute("data-del"));
      }),
    );
    view.querySelectorAll("[data-like]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLike(b.getAttribute("data-like"));
      }),
    );
    view.classList.toggle("reels-mode", reelsOn);
    if (reelsOn) reelCtl = mountReels(view.querySelector(".reels"));
  }

  function toolbarHtml() {
    const sorts = [
      ["new", "الأحدث"],
      ["old", "الأقدم"],
      ["views", "الأكثر مشاهدة"],
      ["title", "الاسم"],
    ];
    return `
      <div class="toolbar mb">
        <div class="field"><input id="q" type="search" dir="rtl" placeholder="ابحث بالعنوان أو القناة…" value="${escapeHtml(state.query)}" autocomplete="off" /></div>
        <div class="chip-row">
          <button type="button" class="chip-btn ${state.filter === "all" ? "on" : ""}" data-filter="all">الكل</button>
          <button type="button" class="chip-btn ${state.filter === "liked" ? "on" : ""}" data-filter="liked">♥ المفضلة</button>
          <select id="sort" class="sort-sel" aria-label="الترتيب">
            ${sorts.map(([v, t]) => `<option value="${v}" ${state.settings.sort === v ? "selected" : ""}>${t}</option>`).join("")}
          </select>
        </div>
      </div>`;
  }

  function bindToolbar() {
    const q = view.querySelector("#q");
    if (!q) return;
    // Filter the already-rendered cards in place so typing never loses focus / breaks Arabic IME.
    q.addEventListener("input", () => {
      state.query = q.value;
      const needle = q.value.trim().toLowerCase();
      let shown = 0;
      view.querySelectorAll("[data-q]").forEach((el) => {
        const hit = !needle || el.getAttribute("data-q").includes(needle);
        el.classList.toggle("hidden", !hit);
        if (hit) shown += 1;
      });
      view.querySelector("#noresult")?.classList.toggle("hidden", shown > 0);
    });
    view.querySelectorAll("[data-filter]").forEach((b) =>
      b.addEventListener("click", () => {
        state.filter = b.getAttribute("data-filter");
        render();
      }),
    );
    view.querySelector("#sort")?.addEventListener("change", (e) => {
      state.settings.sort = e.target.value;
      save();
      render();
    });
  }

  function renderRecover() {
    view.innerHTML = `
      <h1 class="h1">استرداد</h1>
      <p class="muted mt-sm">الصق رابط منصة أو ملف مباشر أو قائمة HLS بصيغة M3U8. يمكن تنزيل قوائم HLS غير المشفّرة وجمع مقاطعها بالترتيب في ملف واحد إذا سمح الخادم بالوصول (CORS).</p>
      <div class="notice mt">خاص بك فقط — لا نشر. المشاهدة الشخصية عبر المشغّلات الرسمية مع احترام حقوق النشر.</div>
      <div class="field mt">
        <input id="url" dir="ltr" placeholder="https://youtu.be/…" value="${SAMPLE_YT}" />
        <button type="button" class="btn btn-sm btn-ghost" id="paste" style="width:auto">لصق</button>
      </div>
      <div class="row mt-sm" style="flex-wrap:wrap;gap:.4rem">
        <button type="button" class="chip" data-sample="${SAMPLE_YT}">رابط يوتيوب</button>
        <button type="button" class="chip" data-sample="https://www.tiktok.com/">تيك توك (الصق مقطعًا)</button>
      </div>
      <button type="button" class="btn btn-primary mt" id="go">فحص وحفظ في المكتبة</button>
      <div id="status" class="mt-sm"></div>
      <div id="result" class="mt"></div>
      <div class="card soft mt">
        <h2 class="h2">استيراد من جهازك</h2>
        <p class="muted mt-sm">أي فيديو حمّلته بنفسك يُنسخ إلى مخزن TikJil الخاص في هذا المتصفح.</p>
        <input type="file" id="file" accept="video/*" hidden />
        <button type="button" class="btn btn-ghost mt" id="pick">اختيار فيديو</button>
      </div>`;

    const urlInput = view.querySelector("#url");
    const status = view.querySelector("#status");
    const result = view.querySelector("#result");

    view.querySelector("#paste")?.addEventListener("click", async () => {
      try {
        const t = await navigator.clipboard.readText();
        if (t.trim()) urlInput.value = t.trim();
      } catch {
        status.innerHTML = `<p class="err">تعذّر قراءة الحافظة — الصق يدويًا.</p>`;
      }
    });

    view.querySelectorAll("[data-sample]").forEach((b) =>
      b.addEventListener("click", () => {
        urlInput.value = b.getAttribute("data-sample") || "";
      }),
    );

    view.querySelector("#go")?.addEventListener("click", async () => {
      status.innerHTML = `<p class="muted">جارٍ الفحص…</p>`;
      result.innerHTML = "";
      try {
        const out = await recoverUrl(urlInput.value, (done, total) => {
          status.innerHTML = `<p class="muted">تنزيل ودمج المقاطع: ${done} من ${total} (${Math.round(done / total * 100)}٪)</p>`;
        });
        status.innerHTML = `<p class="ok">تم الحفظ في المكتبة.</p>`;
        result.innerHTML = renderResultCard(out.item, out.mode);
        bindResultActions(result);
        toast("صار في مكتبتك");
        updateBadge();
      } catch (e) {
        status.innerHTML = `<p class="err">${escapeHtml(e instanceof Error ? e.message : "تعذّر الاسترداد")}</p>`;
      }
    });

    view.querySelector("#pick")?.addEventListener("click", () => view.querySelector("#file")?.click());
    view.querySelector("#file")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        const item = await importLocal(file);
        status.innerHTML = `<p class="ok">تم استيراد «${escapeHtml(item.title)}»</p>`;
        toast("تم الاستيراد");
        updateBadge();
      } catch (err) {
        status.innerHTML = `<p class="err">${escapeHtml(err instanceof Error ? err.message : "فشل الاستيراد")}</p>`;
      }
    });
  }

  function renderResultCard(item, mode) {
    return `
      <article class="result-card">
        ${item.thumbnail ? `<img class="cover" src="${escapeHtml(item.thumbnail)}" alt="" />` : ""}
        <div class="body">
          <span class="pill">${platformLabel(item)}</span>
          <h3 class="h2">${escapeHtml(item.title)}</h3>
          ${item.author ? `<p class="muted">${escapeHtml(item.author)}</p>` : ""}
          <p class="muted" style="font-size:.8rem">
            ${
              mode === "platform"
                ? "محفوظ للتشغيل عبر المشغّل الرسمي. الملف يبقى عند المنصة."
                : mode === "file"
                  ? "ملف مباشر — حُفظ محليًا إن سمح المتصفح، وإلا كبث."
                  : "رابط محفوظ في مكتبتك."
            }
          </p>
          <button type="button" class="btn btn-primary" data-play="${item.id}">تشغيل</button>
          ${item.kind === "local" ? `<button type="button" class="btn btn-ghost" data-export="${item.id}">حفظ الملف على الجهاز</button>` : ""}
          <button type="button" class="btn btn-ghost" data-go="home">عرض المكتبة</button>
        </div>
      </article>`;
  }

  function bindResultActions(root) {
    root.querySelector("[data-export]")?.addEventListener("click", async (e) => {
      const id = e.currentTarget.getAttribute("data-export");
      try {
        const blob = await idbGet(id);
        if (!blob) throw new Error("الملف غير موجود في التخزين المحلي.");
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = `${(state.items.find((item) => item.id === id)?.title || "video").replace(/[\\/:*?"<>|]+/g, "_")}.${blob.type === "video/mp4" ? "mp4" : blob.type === "video/mp2t" ? "ts" : "mp4"}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
      } catch (error) {
        toast(error instanceof Error ? error.message : "تعذّر تصدير الملف");
      }
    });
    root.querySelector("[data-play]")?.addEventListener("click", (e) => {
      openPlayer(e.currentTarget.getAttribute("data-play"));
    });
    root.querySelector("[data-go]")?.addEventListener("click", () => {
      goTab("home");
    });
  }

  // Known ad / popup / tracker networks. A page on one of these hosts is never opened in the viewer.
  const AD_HOSTS = [
    "doubleclick.net", "googlesyndication.com", "googleadservices.com", "adservice.google.com",
    "google-analytics.com", "googletagmanager.com", "googletagservices.com", "adsystem.com",
    "amazon-adsystem.com", "adnxs.com", "adsrvr.org", "criteo.com", "criteo.net", "pubmatic.com",
    "rubiconproject.com", "openx.net", "casalemedia.com", "taboola.com", "outbrain.com", "revcontent.com",
    "mgid.com", "popads.net", "popcash.net", "propellerads.com", "propellerclick.com", "exoclick.com",
    "exosrv.com", "juicyads.com", "trafficjunky.com", "trafficfactory.biz", "adsterra.com",
    "hilltopads.net", "clickadu.com", "adcash.com", "bidvertiser.com", "admaven.com", "zedo.com",
    "smartadserver.com", "adform.net", "moatads.com", "scorecardresearch.com", "adcolony.com",
    "applovin.com", "unityads.unity3d.com", "startappservice.com", "inmobi.com", "mopub.com",
    "yieldmo.com", "sharethrough.com", "teads.tv", "adskeeper.com", "richpush.co", "pushame.com",
    "onclickads.net", "onclkds.com", "clickaine.com", "tsyndicate.com", "a-ads.com", "ad-maven.com",
    "adtng.com", "realsrv.com", "tapad.com", "bluekai.com", "quantserve.com", "hotjar.com",
  ];

  function normalizeUrl(raw) {
    let t = String(raw || "").trim();
    if (!t) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(t)) {
      if (/^[\w-]+(\.[\w-]+)+(\/|$|\?|#|:)/.test(t)) t = "https://" + t;
      else return { search: t };
    }
    try {
      const u = new URL(t);
      if (u.protocol !== "https:" && u.protocol !== "http:") return { bad: "الروابط المسموحة http و https فقط." };
      return { url: u.href, host: u.hostname.toLowerCase() };
    } catch {
      return { bad: "الرابط غير صالح." };
    }
  }

  function isAdHost(host) {
    return AD_HOSTS.some((d) => host === d || host.endsWith("." + d));
  }

  function renderBrowser() {
    view.innerHTML = `
      <h1 class="h1">المتصفح</h1>
      <p class="muted mt-sm">الصق رابط مقطع أو ابحث بالعنوان. المتصفح هنا مخصّص لاسترداد الفيديو لمكتبتك — بدون سجل دائم.</p>
      <div class="field mt">
        <input id="q" dir="ltr" placeholder="رابط أو كلمة" />
        <button type="button" class="btn btn-sm btn-primary" id="open" style="width:auto">فتح</button>
        <button type="button" class="btn btn-sm btn-tonal" id="browse" style="width:auto">تصفح</button>
      </div>
      <div class="stack mt gap-sm">
        <div class="card soft">
          <div style="font-weight:800">يوتيوب / تيك توك / فيميو</div>
          <p class="muted mt-sm" style="font-size:.8rem">نحفظ المقطع في المكتبة ونشغّله بالمشغّل الرسمي. لا استخراج للملف.</p>
        </div>
        <div class="card soft">
          <div style="font-weight:800">ملفات مباشرة وقوائم HLS</div>
          <p class="muted mt-sm" style="font-size:.8rem">يدعم تنزيل ملفات الفيديو المباشرة وقوائم M3U8 غير المشفّرة، مع جمع المقاطع بالترتيب. يلزم أن يسمح الخادم بالوصول من المتصفح.</p>
        </div>
        <div class="card soft">
          <div style="font-weight:800">تصفح محمي</div>
          <p class="muted mt-sm" style="font-size:.8rem">زر «تصفح» يفتح الصفحة داخل التطبيق: تُمنع النوافذ المنبثقة وفتح تبويب ثاني وتحويلك لصفحة أخرى، وتُحظر مواقع الإعلانات المعروفة. بعض المواقع ترفض العرض داخل التطبيق.</p>
        </div>
        <div class="card soft">
          <div style="font-weight:800">بدون سجل</div>
          <p class="muted mt-sm" style="font-size:.8rem">ما يُكتب هنا يبقى على جهازك في هذا المتصفح فقط.</p>
        </div>
      </div>
      <button type="button" class="btn btn-primary mt" data-fill="${SAMPLE_YT}">تجربة رابط يوتيوب</button>
      <div id="bstatus" class="mt-sm"></div>
      <div id="bresult" class="mt"></div>
      <div id="viewer" class="viewer hidden" role="dialog" aria-label="التصفح">
        <div class="viewer-bar">
          <button type="button" class="icon-btn" data-vclose aria-label="إغلاق">✕</button>
          <div class="viewer-url" id="vurl" dir="ltr"></div>
          <button type="button" class="icon-btn" data-vreload aria-label="تحديث">↻</button>
          <button type="button" class="icon-btn" data-vsave aria-label="حفظ في المكتبة">⬇</button>
          <button type="button" class="icon-btn" data-vext aria-label="فتح في المتصفح الخارجي">↗</button>
        </div>
        <div class="viewer-note" id="vnote">محمي: لا نوافذ منبثقة ولا تحويل لتبويب آخر.</div>
        <div class="viewer-body" id="vbody"></div>
      </div>`;

    const q = view.querySelector("#q");
    const st = view.querySelector("#bstatus");
    const res = view.querySelector("#bresult");

    async function run(val) {
      const text = (val ?? q.value).trim();
      if (!text) return;
      q.value = text;
      st.innerHTML = `<p class="muted">جارٍ…</p>`;
      res.innerHTML = "";
      // If it looks like URL → recover; else treat as search hint
      if (/^https?:\/\//i.test(text) || /^[\w.-]+\.[a-z]{2,}/i.test(text)) {
        try {
          const out = await recoverUrl(text, (done, total) => {
            st.innerHTML = `<p class="muted">تنزيل ودمج المقاطع: ${done} من ${total} (${Math.round(done / total * 100)}٪)</p>`;
          });
          st.innerHTML = `<p class="ok">تم.</p>`;
          res.innerHTML = renderResultCard(out.item, out.mode);
          bindResultActions(res);
          toast("في المكتبة");
          updateBadge();
        } catch (e) {
          st.innerHTML = `<p class="err">${escapeHtml(e instanceof Error ? e.message : "تعذّر")}</p>`;
        }
      } else {
        st.innerHTML = `<p class="muted">للبحث العام افتح الموقع في متصفحك ثم الصق رابط المقطع هنا. TikJil يركّز على استرداد الرابط لمكتبتك.</p>`;
        res.innerHTML = `<a class="btn btn-tonal" href="https://duckduckgo.com/?q=${encodeURIComponent(text)}" target="_blank" rel="noopener">بحث عن «${escapeHtml(text)}»</a>`;
      }
    }

    // ── protected in-app browsing ──
    const viewer = view.querySelector("#viewer");
    const vbody = view.querySelector("#vbody");
    const vurl = view.querySelector("#vurl");
    const vnote = view.querySelector("#vnote");
    let vcur = "";

    function closeViewer() {
      viewer.classList.add("hidden");
      vbody.innerHTML = "";
      vcur = "";
    }

    function loadViewer(url) {
      vcur = url;
      vurl.textContent = url;
      vbody.innerHTML = "";
      const f = document.createElement("iframe");
      f.title = "تصفح";
      // No allow-popups / allow-top-navigation: ads and buttons cannot open tabs or redirect the app.
      f.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-presentation");
      f.setAttribute("referrerpolicy", "no-referrer");
      f.setAttribute("allow", "fullscreen; encrypted-media");
      f.setAttribute("allowfullscreen", "");
      f.src = url;
      vbody.appendChild(f);
    }

    function browse(val) {
      const text = (val ?? q.value).trim();
      const n = normalizeUrl(text);
      if (!n) return;
      if (n.bad) {
        st.innerHTML = `<p class="err">${escapeHtml(n.bad)}</p>`;
        return;
      }
      let url = n.url;
      if (n.search) url = `https://www.bing.com/search?q=${encodeURIComponent(n.search)}`;
      else if (isAdHost(n.host)) {
        st.innerHTML = `<p class="err">تم حظر هذا الموقع لأنه شبكة إعلانات.</p>`;
        return;
      }
      st.innerHTML = "";
      vnote.textContent = "محمي: لا نوافذ منبثقة ولا تحويل لتبويب آخر. إذا ظهرت الصفحة فاضية فالموقع يمنع العرض هنا؛ افتحه بزر ↗.";
      viewer.classList.remove("hidden");
      loadViewer(url);
    }

    view.querySelector("#browse")?.addEventListener("click", () => browse());
    view.querySelector("[data-vclose]")?.addEventListener("click", closeViewer);
    view.querySelector("[data-vreload]")?.addEventListener("click", () => vcur && loadViewer(vcur));
    view.querySelector("[data-vext]")?.addEventListener("click", () => {
      if (vcur) window.open(vcur, "_blank", "noopener,noreferrer");
    });
    view.querySelector("[data-vsave]")?.addEventListener("click", () => {
      if (!vcur) return;
      closeViewer();
      run(vcur);
    });

    view.querySelector("#open")?.addEventListener("click", () => run());
    q?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") run();
    });
    view.querySelector("[data-fill]")?.addEventListener("click", () => {
      q.value = SAMPLE_YT;
      run(SAMPLE_YT);
    });
  }

  // ─── manga / manhwa page translation (English → Arabic) ─────
  // Pipeline: OCR (Tesseract.js, in the browser) → group lines into bubbles → translate → paint Arabic over the page.
  const TESS_URL = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  const AR_FONT = '"IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
  const mangaPages = [];
  const trCache = new Map();
  let mangaBusy = false;
  let mangaCur = null;
  let tessPromise = null;
  let nativeTr = null;

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    if (!tessPromise) {
      tessPromise = new Promise((resolve, reject) => {
        const el = document.createElement("script");
        el.src = TESS_URL;
        el.crossOrigin = "anonymous";
        el.onload = () => (window.Tesseract ? resolve(window.Tesseract) : reject(new Error("تعذّر تحميل محرك قراءة النص")));
        el.onerror = () => {
          tessPromise = null;
          reject(new Error("تعذّر تحميل محرك قراءة النص. تأكد من الاتصال بالإنترنت."));
        };
        document.head.appendChild(el);
      });
    }
    return tessPromise;
  }

  /** Comic lettering is usually ALL CAPS, which translates badly — turn it into sentence case. */
  function cleanEnglish(t) {
    let out = String(t)
      .replace(/-\s*\n\s*/g, "")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .replace(/[“”«»]/g, '"')
      .replace(/[‘’]/g, "'")
      .trim();
    // Remove common OCR artifacts from comic lettering
    out = out.replace(/[|]/g, "I").replace(/\b0\b/g, "O");
    const letters = out.replace(/[^A-Za-z]/g, "");
    const upper = letters.replace(/[^A-Z]/g, "");
    if (letters.length > 3 && upper.length / letters.length > 0.75) {
      out = out
        .toLowerCase()
        .replace(/(^|[.!?]\s+)([a-z])/g, (_, a, b) => a + b.toUpperCase())
        .replace(/\bi\b/g, "I")
        .replace(/\b(i'm|i'll|i'd|i've)\b/gi, (m) => m.charAt(0).toUpperCase() + m.slice(1).toLowerCase());
    }
    return out;
  }

  async function translateText(text) {
    if (trCache.has(text)) return trCache.get(text);
    let out = "";
    if (typeof window.Translator !== "undefined" && nativeTr !== false) {
      // Built-in browser translator: only if its model is already on the device, and never wait on it for long.
      const withTimeout = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
      try {
        if (!nativeTr) {
          const opts = { sourceLanguage: "en", targetLanguage: "ar" };
          const av = await withTimeout(window.Translator.availability(opts), 3000);
          nativeTr = av === "available" ? await withTimeout(window.Translator.create(opts), 5000) : false;
        }
        if (nativeTr) out = await withTimeout(nativeTr.translate(text), 8000);
      } catch {
        nativeTr = false;
      }
    }
    if (!out) {
      let res;
      try {
        res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text.slice(0, 480))}&langpair=en|ar`);
      } catch {
        throw new Error("تعذّر الاتصال بخدمة الترجمة. تأكد من الإنترنت.");
      }
      if (!res.ok) throw new Error("خدمة الترجمة غير متاحة الآن");
      const j = await res.json();
      const t = j?.responseData?.translatedText || "";
      if (/MYMEMORY WARNING|QUERY LENGTH LIMIT/i.test(t) || Number(j?.responseStatus) === 429) {
        const err = new Error("انتهى الحد اليومي المجاني للترجمة. جرّب لاحقًا.");
        err.fatal = true;
        throw err;
      }
      out = t;
    }
    out = String(out || "").trim();
    if (out) trCache.set(text, out);
    return out;
  }

  function extractLines(data) {
    if (Array.isArray(data?.lines) && data.lines.length) return data.lines;
    const out = [];
    for (const b of data?.blocks || []) for (const para of b.paragraphs || []) for (const l of para.lines || []) out.push(l);
    return out;
  }

  /** Merge nearby OCR lines into speech-bubble sized groups. Improved heuristics for comics. */
  function groupLines(rawLines) {
    const L = rawLines
      .filter((l) => l?.bbox && String(l.text || "").trim() && (l.confidence ?? 100) >= 45)
      .map((l) => ({
        x0: l.bbox.x0,
        y0: l.bbox.y0,
        x1: l.bbox.x1,
        y1: l.bbox.y1,
        text: String(l.text).trim(),
        conf: l.confidence ?? 80,
      }))
      .filter((l) => /[A-Za-z]{2,}/.test(l.text) && (l.x1 - l.x0) > 8 && (l.y1 - l.y0) > 6)
      .sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

    const groups = [];
    for (const l of L) {
      const lh = Math.max(8, l.y1 - l.y0);
      const g = groups.find((gr) => {
        const gap = l.y0 - gr.y1;
        const ov = Math.min(gr.x1, l.x1) - Math.max(gr.x0, l.x0);
        const minW = Math.min(gr.x1 - gr.x0, l.x1 - l.x0);
        // Allow slightly more vertical gap for multi-line bubbles and require reasonable horizontal overlap
        return gap < lh * 1.35 && gap > -lh * 0.6 && ov > minW * 0.22;
      });
      if (g) {
        g.lines.push(l);
        g.x0 = Math.min(g.x0, l.x0);
        g.y0 = Math.min(g.y0, l.y0);
        g.x1 = Math.max(g.x1, l.x1);
        g.y1 = Math.max(g.y1, l.y1);
      } else {
        groups.push({ x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1, lines: [l] });
      }
    }

    return groups
      .map((g) => {
        g.lines.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
        const lh = g.lines.reduce((s2, l) => s2 + (l.y1 - l.y0), 0) / g.lines.length;
        // Expand the box a little so we cover lettering outlines better
        const expandX = Math.max(4, Math.round((g.x1 - g.x0) * 0.04));
        const expandY = Math.max(3, Math.round(lh * 0.15));
        return {
          x: Math.max(0, g.x0 - expandX),
          y: Math.max(0, g.y0 - expandY),
          w: g.x1 - g.x0 + expandX * 2,
          h: g.y1 - g.y0 + expandY * 2,
          lh,
          en: cleanEnglish(g.lines.map((l) => l.text).join(" ")),
          ar: "",
          bg: [255, 255, 255],
        };
      })
      .filter((b) => b.en.length >= 2);
  }

  function sampleBg(ctx, W, H, b) {
    // Sample a ring around the text box to get a more reliable bubble background color
    const pad = 8;
    const x0 = Math.max(0, Math.floor(b.x - pad));
    const y0 = Math.max(0, Math.floor(b.y - pad));
    const x1 = Math.min(W, Math.ceil(b.x + b.w + pad));
    const y1 = Math.min(H, Math.ceil(b.y + b.h + pad));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return [255, 255, 255];
    const d = ctx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, bl = 0, n = 0;
    const inner = Math.max(3, Math.floor(pad * 0.6));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Only sample the border ring (ignore the interior where the original text lives)
        if (x >= inner && y >= inner && x < w - inner && y < h - inner) continue;
        const i = (y * w + x) * 4;
        r += d[i];
        g += d[i + 1];
        bl += d[i + 2];
        n++;
      }
    }
    if (!n) return [255, 255, 255];
    return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
  }

  function wrapText(ctx, text, maxW) {
    // Arabic-friendly wrapping: prefer splitting on spaces, but fall back to character-level if a single word is too long
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = "";
    for (const wd of words) {
      const t = cur ? `${cur} ${wd}` : wd;
      if (!cur || ctx.measureText(t).width <= maxW) {
        cur = t;
      } else {
        if (cur) lines.push(cur);
        // If a single word is wider than the box, break it
        if (ctx.measureText(wd).width > maxW) {
          let piece = "";
          for (const ch of wd) {
            const tryP = piece + ch;
            if (piece && ctx.measureText(tryP).width > maxW) {
              lines.push(piece);
              piece = ch;
            } else {
              piece = tryP;
            }
          }
          cur = piece;
        } else {
          cur = wd;
        }
      }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function paintBox(ctx, b) {
    if (!b.ar) return;
    // Slightly larger pad so original English lettering (often with thick outlines) is fully covered
    const pad = Math.max(8, Math.round(Math.min(b.w, b.h) * 0.06));
    const x = b.x - pad;
    const y = b.y - pad;
    const w = b.w + pad * 2;
    const h = b.h + pad * 2;
    const [r, g, bl] = b.bg;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * bl;
    const dark = luminance < 145;
    ctx.save();

    // Soft rounded cover
    ctx.fillStyle = `rgb(${r},${g},${bl})`;
    const rad = Math.min(14, Math.min(w, h) * 0.22);
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, rad);
    else ctx.rect(x, y, w, h);
    ctx.fill();

    // Optional very subtle inner padding for text
    const textPad = 10;
    ctx.direction = "rtl";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let size = Math.max(13, Math.min(48, Math.round(b.lh * 0.92)));
    let lines = [];
    for (; size >= 10; size--) {
      ctx.font = `700 ${size}px ${AR_FONT}`;
      lines = wrapText(ctx, b.ar, w - textPad * 2);
      if (lines.length * size * 1.28 <= h - 4) break;
    }

    const lineH = size * 1.28;
    const totalH = lines.length * lineH;
    const top = y + h / 2 - totalH / 2 + lineH / 2;

    // Draw a soft outline (stroke) then the fill for better readability on any background
    const fillColor = dark ? "#ffffff" : "#111111";
    const strokeColor = dark ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.75)";
    ctx.lineJoin = "round";
    ctx.miterLimit = 2;

    lines.forEach((ln, i) => {
      const cx = x + w / 2;
      const cy = top + i * lineH;
      ctx.font = `700 ${size}px ${AR_FONT}`;
      // Stroke first
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(2, Math.round(size * 0.12));
      ctx.strokeText(ln, cx, cy, w - textPad);
      // Then fill
      ctx.fillStyle = fillColor;
      ctx.fillText(ln, cx, cy, w - textPad);
    });

    ctx.restore();
  }

  async function paintPage(pg) {
    if (!pg.out) {
      pg.out = document.createElement("canvas");
      pg.out.width = pg.base.width;
      pg.out.height = pg.base.height;
    }
    const ctx = pg.out.getContext("2d");
    ctx.drawImage(pg.base, 0, 0);
    try {
      await document.fonts?.load?.(`700 20px ${AR_FONT}`);
    } catch {
      /* font is optional */
    }
    pg.boxes.forEach((b) => paintBox(ctx, b));
    const blob = await new Promise((res) => pg.out.toBlob(res, "image/jpeg", 0.92));
    if (pg.outUrl) URL.revokeObjectURL(pg.outUrl);
    pg.outUrl = blob ? URL.createObjectURL(blob) : "";
  }

  function setMStatus(pg, text) {
    pg.status = text;
    const el = view.querySelector(`[data-page="${pg.id}"] .mstat`);
    if (el) el.textContent = text;
  }

  function repaintCard(pg) {
    const old = view.querySelector(`[data-page="${pg.id}"]`);
    if (!old) return;
    const wasOpen = !!old.querySelector("details")?.open;
    old.outerHTML = mangaCardHtml(pg, wasOpen);
  }

  async function translatePage(pg, worker) {
    setMStatus(pg, "تجهيز الصورة…");
    const img = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("تعذّر فتح الصورة"));
      im.src = pg.srcUrl;
    });
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const base = document.createElement("canvas");
    base.width = W;
    base.height = H;
    const bctx = base.getContext("2d", { willReadFrequently: true });
    bctx.drawImage(img, 0, 0);
    pg.base = base;
    pg.out = null;

    // Long webtoon strips are cut into overlapping tiles so OCR stays fast and accurate.
    // We also apply a light contrast boost before OCR — comics lettering benefits a lot from it.
    const TILE = 1800, OV = 160;
    const scale = W < 900 ? 2 : 1;
    const found = [];

    function boostContrast(srcCanvas) {
      const c = document.createElement("canvas");
      c.width = srcCanvas.width;
      c.height = srcCanvas.height;
      const cctx = c.getContext("2d", { willReadFrequently: true });
      cctx.drawImage(srcCanvas, 0, 0);
      try {
        const imgData = cctx.getImageData(0, 0, c.width, c.height);
        const d = imgData.data;
        // Simple contrast + slight desaturation toward grayscale (helps Tesseract)
        const factor = 1.35;
        const intercept = 128 * (1 - factor);
        for (let i = 0; i < d.length; i += 4) {
          let y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          y = Math.max(0, Math.min(255, y * factor + intercept));
          d[i] = d[i + 1] = d[i + 2] = y;
        }
        cctx.putImageData(imgData, 0, 0);
      } catch {
        /* getImageData can fail on huge canvases — fall back to original */
      }
      return c;
    }

    for (let y = 0; y < H; y += TILE - OV) {
      const h = Math.min(TILE, H - y);
      const last = y + h >= H;
      const tile = document.createElement("canvas");
      tile.width = W * scale;
      tile.height = h * scale;
      const tctx = tile.getContext("2d");
      tctx.drawImage(base, 0, y, W, h, 0, 0, W * scale, h * scale);
      const ocrTile = boostContrast(tile);
      const { data } = await worker.recognize(ocrTile);
      const keepTop = y + (y > 0 ? OV / 2 : 0);
      const keepBottom = y + h - (last ? 0 : OV / 2);
      for (const l of extractLines(data)) {
        if (!l?.bbox) continue;
        const bb = {
          x0: l.bbox.x0 / scale,
          y0: l.bbox.y0 / scale + y,
          x1: l.bbox.x1 / scale,
          y1: l.bbox.y1 / scale + y,
        };
        const cy = (bb.y0 + bb.y1) / 2;
        if (cy < keepTop || cy >= keepBottom) continue;
        found.push({ text: l.text, confidence: l.confidence, bbox: bb });
      }
      if (last) break;
    }

    const boxes = groupLines(found);
    pg.boxes = boxes;
    if (!boxes.length) {
      pg.outUrl = "";
      setMStatus(pg, "ما لقيت نصًا إنجليزيًا في الصفحة");
      return;
    }
    for (let i = 0; i < boxes.length; i++) {
      setMStatus(pg, `ترجمة ${i + 1} من ${boxes.length}`);
      try {
        boxes[i].ar = await translateText(boxes[i].en);
      } catch (e) {
        if (e?.fatal) {
          await paintPage(pg);
          throw e;
        }
        boxes[i].ar = "";
      }
      boxes[i].bg = sampleBg(bctx, W, H, boxes[i]);
    }
    await paintPage(pg);
    setMStatus(pg, `تمت الترجمة (${boxes.length} نص)`);
  }

  async function runTranslate(pages) {
    if (!pages.length) return;
    if (mangaBusy) {
      toast("جارٍ المعالجة، انتظر لحظة");
      return;
    }
    mangaBusy = true;
    let worker = null;
    try {
      toast("تحميل محرك القراءة (أول مرة فقط)…");
      const T = await loadTesseract();
      worker = await T.createWorker("eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text" && mangaCur) setMStatus(mangaCur, `قراءة النص ${Math.round((m.progress || 0) * 100)}٪`);
        },
      });
      // Sparse text works well for scattered speech bubbles.
      // We also allow a slightly wider character set and disable dictionaries that hurt comic lettering.
      await worker.setParameters({
        tessedit_pageseg_mode: String(T.PSM?.SPARSE_TEXT ?? 11),
        preserve_interword_spaces: "1",
        tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?'\"-—…:()[] ",
      });
      for (const pg of pages) {
        mangaCur = pg;
        try {
          await translatePage(pg, worker);
        } catch (e) {
          setMStatus(pg, e?.message || "تعذّرت الترجمة");
          if (e?.fatal) {
            repaintCard(pg);
            break;
          }
        }
        repaintCard(pg);
      }
    } catch (e) {
      toast(e?.message || "تعذّر بدء الترجمة");
    } finally {
      try {
        await worker?.terminate();
      } catch {
        /* ignore */
      }
      mangaCur = null;
      mangaBusy = false;
    }
  }

  function downloadPage(pg) {
    if (!pg.out) return;
    pg.out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ar-${pg.name.replace(/\.[^.]+$/, "")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, "image/png");
  }

  function mangaCardHtml(pg, openEditor) {
    const src = pg.showOrig || !pg.outUrl ? pg.srcUrl : pg.outUrl;
    const editor = pg.boxes?.length
      ? `<details class="mt-sm" ${openEditor ? "open" : ""}>
          <summary class="muted" style="font-size:.85rem">تعديل الترجمة (${pg.boxes.length})</summary>
          ${pg.boxes
            .map(
              (b, i) => `<div class="mrow">
            <div class="muted" dir="ltr" style="font-size:.75rem;text-align:left">${escapeHtml(b.en)}</div>
            <textarea dir="rtl" rows="2" data-box="${i}">${escapeHtml(b.ar)}</textarea>
          </div>`,
            )
            .join("")}
          <button type="button" class="btn btn-primary mt-sm" data-act="redraw">إعادة الرسم</button>
        </details>`
      : "";
    return `<div class="card mpage mt" data-page="${pg.id}">
      <div class="between"><strong class="mname">${escapeHtml(pg.name)}</strong><span class="muted mstat" style="font-size:.78rem">${escapeHtml(pg.status)}</span></div>
      <img class="mimg mt-sm" src="${src}" alt="" />
      <div class="mbtns mt-sm">
        <button type="button" class="btn btn-tonal" data-act="tr">ترجمة</button>
        ${pg.outUrl ? `<button type="button" class="btn btn-ghost" data-act="toggle">${pg.showOrig ? "المترجمة" : "الأصلية"}</button><button type="button" class="btn btn-ghost" data-act="dl">تنزيل</button>` : ""}
        <button type="button" class="btn btn-ghost" data-act="rm">حذف</button>
      </div>
      ${editor}
    </div>`;
  }

  function addMangaFiles(files) {
    const imgs = [...files].filter((f) => f.type.startsWith("image/")).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    let skipped = 0;
    for (const f of imgs) {
      if (f.size > 25 * 1024 * 1024 || mangaPages.length >= 40) {
        skipped += 1;
        continue;
      }
      mangaPages.push({ id: uid(), name: f.name, srcUrl: URL.createObjectURL(f), status: "في الانتظار", boxes: null, outUrl: "", showOrig: false });
    }
    if (skipped) toast(`تخطّينا ${skipped} صورة (كبيرة أو تجاوزت 40 صفحة)`);
  }

  function renderManga() {
    view.innerHTML = `
      <h1 class="h1">ترجمة المانغا</h1>
      <p class="muted mt-sm">ارفع صفحات مانغا أو مانهوا بالإنجليزي. النظام يقرأ النص من الفقاعات، يترجمه للعربية، ويضع الترجمة فوق الصفحة مع طمس النص الأصلي. للاستخدام الشخصي على صفحاتك.</p>
      <label class="btn btn-primary mt" style="cursor:pointer">اختيار صفحات
        <input type="file" id="mt-file" accept="image/*" multiple class="hidden" />
      </label>
      <div class="mbtns mt-sm">
        <button type="button" class="btn btn-tonal" id="mt-all">ترجمة الكل</button>
        <button type="button" class="btn btn-ghost" id="mt-dlall">تنزيل الكل</button>
        <button type="button" class="btn btn-ghost" id="mt-clear">مسح الكل</button>
      </div>
      <div class="notice mt">أول مرة يحتاج إنترنت لتحميل محرك القراءة (Tesseract). تم تحسين التباين وتجميع الفقاعات ورسم النص العربي. الجودة تعتمد على وضوح الخط الأصلي — إذا طلعت ترجمة غير دقيقة عدّلها من «تعديل الترجمة» ثم اضغط «إعادة الرسم».</div>
      <div id="mt-list"></div>`;
    const list = view.querySelector("#mt-list");
    mangaPages.forEach((pg) => list.insertAdjacentHTML("beforeend", mangaCardHtml(pg)));

    view.querySelector("#mt-file")?.addEventListener("change", (e) => {
      addMangaFiles(e.target.files || []);
      e.target.value = "";
      renderManga();
    });
    view.querySelector("#mt-all")?.addEventListener("click", () => void runTranslate(mangaPages.filter((p) => !p.boxes)));
    view.querySelector("#mt-dlall")?.addEventListener("click", () => {
      const done = mangaPages.filter((p) => p.out);
      if (!done.length) return toast("ما فيه صفحات مترجمة بعد");
      done.forEach((p, i) => setTimeout(() => downloadPage(p), i * 400));
    });
    view.querySelector("#mt-clear")?.addEventListener("click", () => {
      if (mangaBusy) return toast("انتظر انتهاء المعالجة");
      if (mangaPages.length && !confirm("مسح كل الصفحات؟")) return;
      mangaPages.forEach((p) => {
        URL.revokeObjectURL(p.srcUrl);
        if (p.outUrl) URL.revokeObjectURL(p.outUrl);
      });
      mangaPages.length = 0;
      renderManga();
    });

    list.addEventListener("input", (e) => {
      const ta = e.target.closest?.("textarea[data-box]");
      const card = e.target.closest?.("[data-page]");
      if (!ta || !card) return;
      const pg = mangaPages.find((p) => p.id === card.getAttribute("data-page"));
      if (pg?.boxes?.[Number(ta.getAttribute("data-box"))]) pg.boxes[Number(ta.getAttribute("data-box"))].ar = ta.value;
    });
    list.addEventListener("click", async (e) => {
      const btn = e.target.closest?.("[data-act]");
      const card = e.target.closest?.("[data-page]");
      if (!btn || !card) return;
      const pg = mangaPages.find((p) => p.id === card.getAttribute("data-page"));
      if (!pg) return;
      const act = btn.getAttribute("data-act");
      if (act === "tr") void runTranslate([pg]);
      else if (act === "dl") downloadPage(pg);
      else if (act === "toggle") {
        pg.showOrig = !pg.showOrig;
        repaintCard(pg);
      } else if (act === "redraw") {
        pg.out = null;
        await paintPage(pg);
        repaintCard(pg);
        toast("تمت إعادة الرسم");
      } else if (act === "rm") {
        if (mangaBusy && mangaCur === pg) return toast("انتظر انتهاء المعالجة");
        URL.revokeObjectURL(pg.srcUrl);
        if (pg.outUrl) URL.revokeObjectURL(pg.outUrl);
        mangaPages.splice(mangaPages.indexOf(pg), 1);
        card.remove();
      }
    });
  }

  function renderInbox() {
    const list = state.inbox.filter((m) => !m.adult);
    view.innerHTML = `
      <h1 class="h1">الوارد</h1>
      <p class="muted mt-sm">سجل الحفظ والاستيراد على هذا الجهاز فقط.</p>
      ${
        !list.length
          ? `<p class="muted mt" style="text-align:center">الوارد فاضي.</p>`
          : `<div class="stack mt">${list
              .map(
                (m) => `
            <article class="inbox-item ${m.read ? "" : "unread"}" data-id="${m.id}" data-vid="${m.videoId || ""}">
              <div class="between">
                <h3>${escapeHtml(m.title)}</h3>
                <span class="pill">${escapeHtml(m.kind)}</span>
              </div>
              <p>${escapeHtml(m.body)}</p>
              <div class="row mt-sm">
                <button type="button" class="btn btn-sm btn-ghost" data-del-msg="${m.id}">حذف</button>
              </div>
            </article>`,
              )
              .join("")}</div>`
      }`;

    view.querySelectorAll(".inbox-item").forEach((el) =>
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-del-msg]")) return;
        const id = el.getAttribute("data-id");
        const vid = el.getAttribute("data-vid");
        state.inbox = state.inbox.map((m) => (m.id === id ? { ...m, read: true } : m));
        save();
        updateBadge();
        if (vid) openPlayer(vid);
        else render();
      }),
    );
    view.querySelectorAll("[data-del-msg]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        state.inbox = state.inbox.filter((m) => m.id !== b.getAttribute("data-del-msg"));
        save();
        updateBadge();
        render();
      }),
    );
  }

  function renderProfile() {
    const visible = publicItems();
    const likes = visible.filter((i) => i.liked).length;
    const bytes = visible.reduce((s, i) => s + (i.kind === "local" ? i.sizeBytes : 0), 0);
    const initial = (state.profile.name || "؟").trim().slice(0, 1);
    view.innerHTML = `
      <div class="row">
        <div style="width:3.5rem;height:3.5rem;border-radius:999px;background:var(--primary);color:var(--bg);display:grid;place-items:center;font-weight:800;font-size:1.25rem">${escapeHtml(initial)}</div>
        <div>
          <h1 class="h1" style="font-size:1.25rem">${escapeHtml(state.profile.name)}</h1>
          <p class="muted" style="margin:0">${escapeHtml(state.profile.bio)}</p>
        </div>
      </div>
      <div class="stats mt">
        <div class="stat"><b>${visible.length}</b><span>فيديو</span></div>
        <div class="stat"><b>${likes}</b><span>إعجاب</span></div>
        <div class="stat"><b>${state.watchCount}</b><span>مشاهدة</span></div>
        <div class="stat"><b>${formatBytes(bytes)}</b><span>مساحة</span></div>
      </div>
      <div class="notice mt">هذا التطبيق خاص بجهازك/متصفحك. لا حساب سحابي ولا نشر تلقائي. مقاطع قسم البالغين لا تظهر هنا ولا تُحسب في الأرقام.</div>
      <div class="card mt">
        <h2 class="h2">تعديل الاسم</h2>
        <div class="field mt-sm"><input id="pname" dir="rtl" value="${escapeHtml(state.profile.name)}" /></div>
        <div class="field mt-sm"><input id="pbio" dir="rtl" value="${escapeHtml(state.profile.bio)}" /></div>
        <button type="button" class="btn btn-primary mt" id="psave">حفظ</button>
      </div>
      <div class="card mt">
        <h2 class="h2">نسخة احتياطية</h2>
        <p class="muted" style="margin:.35rem 0 0;font-size:.82rem;line-height:1.6">المكتبة محفوظة في متصفحك فقط، فإذا مسحت بيانات المتصفح تضيع. صدّر نسخة واحتفظ بها، واستوردها وقت الحاجة.</p>
        <button type="button" class="btn btn-tonal mt" id="bk-export">تصدير المكتبة (JSON)</button>
        <button type="button" class="btn btn-ghost mt-sm" id="bk-import">استيراد نسخة</button>
        <input type="file" id="bk-file" accept="application/json,.json" class="hidden" />
        <p class="muted" style="margin:.6rem 0 0;font-size:.75rem;line-height:1.6">النسخة تشمل الروابط والإعجابات والإعدادات. لا تشمل قسم البالغين ولا الرقم السري، ولا الفيديوهات المرفوعة من جهازك (تبقى في جهازك فقط).</p>
      </div>
      <div class="card mt">
        <h2 class="h2">فيديوهاتي</h2>
        <div class="video-list mt-sm">
          ${
            visible.length
              ? visible
                  .slice(0, 12)
                  .map(
                    (i) => `
            <button type="button" class="video-row" data-play="${i.id}">
              ${i.thumbnail ? `<img class="thumb" src="${escapeHtml(i.thumbnail)}" alt="" />` : `<div class="thumb ph">▶</div>`}
              <div style="min-width:0">
                <p class="title">${escapeHtml(i.title)}</p>
                <div class="meta">${platformLabel(i)}</div>
              </div>
            </button>`,
                  )
                  .join("")
              : `<p class="muted">لا شيء بعد.</p>`
          }
        </div>
      </div>`;

    view.querySelector("#bk-export")?.addEventListener("click", exportLibrary);
    view.querySelector("#bk-import")?.addEventListener("click", () => view.querySelector("#bk-file")?.click());
    view.querySelector("#bk-file")?.addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) void importLibrary(f);
      e.target.value = "";
    });
    view.querySelector("#psave")?.addEventListener("click", () => {
      state.profile.name = view.querySelector("#pname").value.trim() || "أنا";
      state.profile.bio = view.querySelector("#pbio").value.trim();
      save();
      toast("تم الحفظ");
      render();
    });
    view.querySelectorAll("[data-play]").forEach((b) =>
      b.addEventListener("click", () => openPlayer(b.getAttribute("data-play"))),
    );
  }

  // ─── backup / restore ──────────────────────────────────────
  function exportLibrary() {
    const items = publicItems().filter((i) => i.kind !== "local");
    const skipped = publicItems().length - items.length;
    const payload = {
      app: "tikjil",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: state.profile,
      settings: { layout: state.settings.layout, loop: state.settings.loop, sort: state.settings.sort, speed: state.settings.speed },
      items,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tikjil-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast(skipped ? `تم التصدير (${items.length}). تخطّينا ${skipped} ملف محلي` : `تم تصدير ${items.length} مقطع`);
  }

  async function importLibrary(file) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error("الملف كبير جدًا");
      const data = JSON.parse(await file.text());
      if (data?.app !== "tikjil" || !Array.isArray(data.items)) throw new Error("هذا ليس ملف نسخة TikJil");
      let added = 0;
      for (const raw of data.items) {
        if (!raw || typeof raw.sourceUrl !== "string" || typeof raw.title !== "string") continue;
        if (raw.kind === "local") continue;
        if (state.items.some((i) => i.id === raw.id || i.sourceUrl === raw.sourceUrl)) continue;
        state.items.push({
          id: typeof raw.id === "string" && raw.id ? raw.id : uid(),
          title: raw.title.slice(0, 300),
          sourceUrl: raw.sourceUrl,
          kind: raw.kind || "link",
          platform: raw.platform || "",
          platformId: raw.platformId,
          author: typeof raw.author === "string" ? raw.author.slice(0, 200) : undefined,
          thumbnail: typeof raw.thumbnail === "string" ? raw.thumbnail : undefined,
          sizeBytes: Number(raw.sizeBytes) || 0,
          addedAt: raw.addedAt || new Date().toISOString(),
          liked: !!raw.liked,
          views: Number(raw.views) || 0,
          adult: false,
        });
        added += 1;
      }
      if (data.profile?.name) state.profile = { ...state.profile, ...data.profile };
      save();
      toast(added ? `تم استيراد ${added} مقطع` : "ما فيه جديد للاستيراد");
      render();
    } catch (err) {
      toast(err?.message || "تعذّر قراءة الملف");
    }
  }

  function hashPin(pin) {
    const data = new TextEncoder().encode(`tikjil-adult-v1:${pin}`);
    return crypto.subtle.digest("SHA-256", data).then((buf) =>
      Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join(""),
    );
  }

  function lockVault() {
    state.vaultUnlocked = false;
    state.vaultStep = "warn";
    state.vaultEntry = "";
    state.vaultFirst = "";
    if (state.playingId) {
      const item = state.items.find((i) => i.id === state.playingId);
      if (item?.adult) closePlayer();
    }
  }

  function goTab(next) {
    if (!next) return;
    if (next === state.tab && next !== "vault") return;
    if (state.tab === "vault" && next !== "vault" && !state.vaultUnlocked) {
      state.pendingMoveId = null;
    }
    if (next === "vault" && state.tab !== "vault") {
      state.vaultUnlocked = false;
      state.vaultStep = "warn";
      state.vaultEntry = "";
      state.vaultFirst = "";
    }
    state.tab = next;
    syncNav();
    render();
  }

  function finishUnlock() {
    state.vaultUnlocked = true;
    state.vaultStep = "open";
    state.vaultEntry = "";
    state.vaultFirst = "";
    state.vaultFails = 0;
    state.vaultLockUntil = 0;
    save();
    if (state.pendingMoveId) {
      const id = state.pendingMoveId;
      state.pendingMoveId = null;
      const it = state.items.find((i) => i.id === id);
      if (it && !it.adult) {
        state.items = state.items.map((i) => (i.id === id ? { ...i, adult: true } : i));
        save();
        pushInbox("moved", "نُقل إلى قسم البالغين", `«${it.title}» مخفي الآن عن المكتبة العادية.`, id, true);
        toast("تم النقل إلى قسم البالغين");
      }
    }
    render();
  }

  async function wipeVault() {
    const doomed = state.items.filter((i) => i.adult && i.kind === "local");
    for (const item of doomed) {
      try {
        await idbDel(item.id);
      } catch {
        /* ignore */
      }
    }
    state.items = state.items.filter((i) => !i.adult);
    state.inbox = state.inbox.filter((m) => !m.adult);
    state.vaultPinHash = "";
    state.vaultFails = 0;
    state.vaultLockUntil = 0;
    state.vaultUnlocked = false;
    state.vaultStep = "warn";
    state.vaultEntry = "";
    state.vaultFirst = "";
    state.pendingMoveId = null;
    if (state.playingId) {
      const cur = state.items.find((i) => i.id === state.playingId);
      if (!cur) closePlayer();
    }
    save();
    toast("مُسحت خزنة البالغين ورقمها");
    render();
  }

  function pinDots(n, shake) {
    return `<div class="pin-dots ${shake ? "shake" : ""}" aria-label="أُدخل ${n} من 4">${[0, 1, 2, 3]
      .map((i) => `<i class="${i < n ? "on" : ""}"></i>`)
      .join("")}</div>`;
  }

  function keypadHtml() {
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "back"];
    return `<div class="keypad" dir="ltr">${keys
      .map((k) => {
        if (k === "clear") return `<button type="button" class="key ghost" data-key="clear">مسح</button>`;
        if (k === "back") return `<button type="button" class="key ghost" data-key="back" aria-label="حذف رقم">⌫</button>`;
        return `<button type="button" class="key" data-key="${k}">${k}</button>`;
      })
      .join("")}</div>`;
  }

  function armLockTimer() {
    clearTimeout(lockTimer);
    if (state.tab === "vault" && state.vaultLockUntil > Date.now()) {
      lockTimer = setTimeout(() => render(), Math.min(1000, Math.max(200, state.vaultLockUntil - Date.now())));
    }
  }

  async function submitPin() {
    const pin = state.vaultEntry;
    if (pin.length < 4) return;
    const step = state.vaultStep;
    if (step === "create" || step === "change-new") {
      state.vaultFirst = pin;
      state.vaultEntry = "";
      state.vaultStep = step === "create" ? "confirm" : "change-confirm";
      render();
      return;
    }
    if (step === "confirm" || step === "change-confirm") {
      if (pin !== state.vaultFirst) {
        state.vaultEntry = "";
        state.vaultFirst = "";
        state.vaultStep = step === "confirm" ? "create" : "change-new";
        state.vaultShake = true;
        toast("الرقمان غير متطابقين. أعد الاختيار.");
        render();
        return;
      }
      state.vaultPinHash = await hashPin(pin);
      state.vaultEntry = "";
      state.vaultFirst = "";
      save();
      toast(step === "confirm" ? "تم حفظ الرقم السري" : "تم تغيير الرقم السري");
      if (step === "confirm") finishUnlock();
      else {
        state.vaultStep = "open";
        state.vaultUnlocked = true;
        render();
      }
      return;
    }
    if (step === "unlock" || step === "change-old") {
      if (Date.now() < state.vaultLockUntil) return;
      const hashed = await hashPin(pin);
      if (hashed !== state.vaultPinHash) {
        state.vaultFails += 1;
        state.vaultEntry = "";
        state.vaultShake = true;
        if (state.vaultFails >= 5) {
          state.vaultLockUntil = Date.now() + 30000;
          state.vaultFails = 0;
          toast("خمس محاولات خاطئة. الانتظار 30 ثانية.");
        } else {
          toast(`رقم غير صحيح (${state.vaultFails}/5)`);
        }
        save();
        render();
        return;
      }
      state.vaultFails = 0;
      state.vaultLockUntil = 0;
      save();
      if (step === "change-old") {
        state.vaultEntry = "";
        state.vaultStep = "change-new";
        render();
        return;
      }
      finishUnlock();
    }
  }

  function bindKeypad() {
    const locked = state.vaultStep === "unlock" && Date.now() < state.vaultLockUntil;
    view.querySelectorAll("[data-key]").forEach((btn) => {
      btn.disabled = locked;
      btn.addEventListener("click", () => {
        if (state.vaultStep === "unlock" && Date.now() < state.vaultLockUntil) {
          toast("الانتظار ما زال ساريًا");
          return;
        }
        const key = btn.getAttribute("data-key");
        if (key === "clear") state.vaultEntry = "";
        else if (key === "back") state.vaultEntry = state.vaultEntry.slice(0, -1);
        else if (state.vaultEntry.length < 4) state.vaultEntry += key;
        if (state.vaultEntry.length === 4) {
          void submitPin();
          return;
        }
        render();
      });
    });
  }

  function renderPinScreen(title, lead) {
    const remain = Math.max(0, Math.ceil((state.vaultLockUntil - Date.now()) / 1000));
    const locked = state.vaultStep === "unlock" && remain > 0;
    const shake = state.vaultShake;
    state.vaultShake = false;
    return `
      <button type="button" class="btn btn-ghost btn-sm vault-back" data-vault-back>رجوع</button>
      <div class="vault-pin">
        <div class="age-badge" aria-hidden="true">18+</div>
        <h1 class="h1">${title}</h1>
        <p class="muted">${lead}</p>
        ${pinDots(state.vaultEntry.length, shake)}
        ${locked ? `<p class="err">محاولات كثيرة. أعد المحاولة بعد ${remain} ث.</p>` : ""}
        ${keypadHtml()}
        ${
          state.vaultStep === "unlock"
            ? `<button type="button" class="btn btn-ghost" data-forgot>نسيت الرقم؟ مسح الخزنة</button>`
            : ""
        }
      </div>`;
  }

  function renderVault() {
    const step = state.vaultUnlocked && state.vaultStep === "open" ? "open" : state.vaultStep;
    if (!state.vaultUnlocked && step === "open") state.vaultStep = "warn";

    if (step === "warn" || (!state.vaultUnlocked && step !== "create" && step !== "confirm" && step !== "unlock" && step !== "wipe")) {
      const pending = state.pendingMoveId
        ? `<p class="notice">بعد التأكيد والرقم السري سيُنقل المقطع إلى هذا القسم ويختفي من المكتبة العادية.</p>`
        : "";
      view.innerHTML = `
        <div class="vault-gate">
          <div class="age-badge" aria-hidden="true">18+</div>
          <p class="eyebrow">NSFW</p>
          <h1 class="h1">تحذير — للبالغين فقط</h1>
          <p class="muted">هذا القسم مخفي ومخصص لمن أتم 18 سنة. الدخول يعني أنك بلغت هذه السن، وأن مشاهدة ما تضيفه هنا مسموحة لك.</p>
          ${pending}
          <ul class="warn-list">
            <li>لا يظهر شيء من هنا في الرئيسية أو الحساب أو الوارد.</li>
            <li>TikJil لا يضع مقاطع جاهزة. أنت من تضيف روابطك أو ملفاتك.</li>
            <li>الرقم السري يُحفظ على هذا الجهاز فقط. نسيانه يتطلب مسح الخزنة.</li>
            <li>القسم يُقفل تلقائيًا كلما غادرته.</li>
          </ul>
          <label class="agree">
            <input type="checkbox" id="age-ok" />
            <span>أؤكد أن عمري 18 سنة أو أكثر، وأتحمل مسؤولية ما أضيفه هنا.</span>
          </label>
          <button type="button" class="btn btn-primary" id="age-continue" disabled>متابعة إلى الرقم السري</button>
          <button type="button" class="btn btn-ghost" data-vault-back>ليس الآن</button>
        </div>`;
      const box = view.querySelector("#age-ok");
      const go = view.querySelector("#age-continue");
      box?.addEventListener("change", () => {
        if (go) go.disabled = !box.checked;
      });
      go?.addEventListener("click", () => {
        if (!box?.checked) return;
        state.vaultEntry = "";
        state.vaultFirst = "";
        state.vaultStep = state.vaultPinHash ? "unlock" : "create";
        render();
      });
      view.querySelector("[data-vault-back]")?.addEventListener("click", () => goTab("home"));
      return;
    }

    if (step === "create") {
      view.innerHTML = renderPinScreen(
        "اختر رقمًا سريًا",
        "أربعة أرقام. ستُطلب منك مع التحذير في كل مرة تدخل هذا القسم.",
      );
      bindKeypad();
      view.querySelector("[data-vault-back]")?.addEventListener("click", () => {
        state.vaultStep = "warn";
        state.vaultEntry = "";
        render();
      });
      return;
    }

    if (step === "confirm") {
      view.innerHTML = renderPinScreen("أكّد الرقم السري", "أدخل نفس الأرقام مرة ثانية.");
      bindKeypad();
      view.querySelector("[data-vault-back]")?.addEventListener("click", () => {
        state.vaultStep = "create";
        state.vaultEntry = "";
        state.vaultFirst = "";
        render();
      });
      return;
    }

    if (step === "unlock") {
      view.innerHTML = renderPinScreen("أدخل الرقم السري", "قسم البالغين مقفل على هذا الجهاز.");
      bindKeypad();
      view.querySelector("[data-vault-back]")?.addEventListener("click", () => goTab("home"));
      view.querySelector("[data-forgot]")?.addEventListener("click", () => {
        state.vaultStep = "wipe";
        render();
      });
      return;
    }

    if (step === "wipe") {
      view.innerHTML = `
        <div class="vault-gate">
          <h1 class="h1">مسح الخزنة؟</h1>
          <p class="muted">سيُحذف الرقم السري وكل المقاطع المحفوظة داخل قسم البالغين فقط. المكتبة العادية تبقى كما هي. لا يمكن التراجع.</p>
          <button type="button" class="btn btn-primary vault-danger" id="do-wipe">نعم، امسح قسم البالغين</button>
          <button type="button" class="btn btn-ghost" data-vault-back>إلغاء</button>
        </div>`;
      view.querySelector("#do-wipe")?.addEventListener("click", () => {
        void wipeVault();
      });
      view.querySelector("[data-vault-back]")?.addEventListener("click", () => {
        state.vaultStep = "unlock";
        render();
      });
      return;
    }

    if (step === "change-old" || step === "change-new" || step === "change-confirm") {
      const copy = {
        "change-old": ["الرقم الحالي", "أدخل الرقم السري الحالي قبل تغييره."],
        "change-new": ["رقم سري جديد", "اختر أربعة أرقام جديدة."],
        "change-confirm": ["تأكيد الرقم الجديد", "أدخل الرقم الجديد مرة ثانية."],
      }[step];
      view.innerHTML = renderPinScreen(copy[0], copy[1]);
      bindKeypad();
      view.querySelector("[data-vault-back]")?.addEventListener("click", () => {
        state.vaultStep = "open";
        state.vaultEntry = "";
        state.vaultFirst = "";
        render();
      });
      return;
    }

    const items = adultItems();
    const notes = state.inbox.filter((m) => m.adult).slice(0, 3);
    view.innerHTML = `
      <div class="between mb">
        <div>
          <p class="eyebrow">NSFW · 18+</p>
          <h1 class="h1">قسم البالغين</h1>
        </div>
        <button type="button" class="btn btn-sm btn-ghost" id="lock-now" style="width:auto">قفل</button>
      </div>
      <div class="vault-banner">مقفل تلقائيًا عند المغادرة. المحتوى هنا لا يظهر في بقية التطبيق.</div>
      ${
        items.length
          ? `<div class="video-list mt">${items
              .map(
                (i) => `
            <div class="video-row">
              <button type="button" data-play="${i.id}" style="display:contents">
                ${i.thumbnail ? `<img class="thumb" src="${escapeHtml(i.thumbnail)}" alt="" />` : `<div class="thumb ph">▶</div>`}
                <div style="flex:1;min-width:0;text-align:start">
                  <p class="title">${escapeHtml(i.title)}</p>
                  <div class="meta">${platformLabel(i)}${i.sizeBytes ? " · " + formatBytes(i.sizeBytes) : ""}</div>
                </div>
              </button>
              <button type="button" class="icon-btn" data-del="${i.id}" aria-label="حذف">✕</button>
            </div>`,
              )
              .join("")}</div>`
          : `<div class="empty card mt"><h2 class="h2">الخزنة فارغة</h2><p class="muted">أضف رابطًا أو ملفًا من جهازك. لن يظهر في الرئيسية.</p></div>`
      }
      <div class="card mt">
        <h2 class="h2">إضافة إلى الخزنة</h2>
        <p class="muted mt-sm">رابط يوتيوب أو تيك توك أو فيميو أو ملف مباشر. يُحفظ هنا فقط.</p>
        <div class="field mt">
          <input id="vurl" dir="ltr" placeholder="https://…" />
        </div>
        <button type="button" class="btn btn-primary mt" id="vsave">حفظ الرابط في الخزنة</button>
        <input type="file" id="vfile" accept="video/*" hidden />
        <button type="button" class="btn btn-ghost mt-sm" id="vpick">استيراد فيديو من الجهاز</button>
        <div id="vstatus" class="mt-sm"></div>
      </div>
      <div class="card mt">
        <h2 class="h2">الرقم السري</h2>
        <button type="button" class="btn btn-ghost mt" id="change-pin">تغيير الرقم السري</button>
      </div>
      ${
        notes.length
          ? `<div class="stack mt">${notes
              .map(
                (m) => `<article class="inbox-item"><h3>${escapeHtml(m.title)}</h3><p>${escapeHtml(m.body)}</p></article>`,
              )
              .join("")}</div>`
          : ""
      }`;

    view.querySelector("#lock-now")?.addEventListener("click", () => {
      lockVault();
      state.vaultStep = "warn";
      render();
    });
    view.querySelectorAll("[data-play]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        openPlayer(b.getAttribute("data-play"));
      }),
    );
    view.querySelectorAll("[data-del]").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm("حذف من قسم البالغين؟")) removeItem(b.getAttribute("data-del"));
      }),
    );
    view.querySelector("#change-pin")?.addEventListener("click", () => {
      state.vaultStep = "change-old";
      state.vaultEntry = "";
      state.vaultFirst = "";
      render();
    });

    const status = view.querySelector("#vstatus");
    view.querySelector("#vsave")?.addEventListener("click", async () => {
      const raw = view.querySelector("#vurl")?.value || "";
      status.innerHTML = `<p class="muted">جارٍ الحفظ في الخزنة…</p>`;
      state.captureAdult = true;
      try {
        const out = await recoverUrl(raw, (done, total) => {
          status.innerHTML = `<p class="muted">تنزيل: ${done} من ${total}</p>`;
        });
        status.innerHTML = `<p class="ok">حُفظ «${escapeHtml(out.item.title)}» داخل قسم البالغين فقط.</p>`;
        toast("في الخزنة");
        render();
      } catch (e) {
        status.innerHTML = `<p class="err">${escapeHtml(e instanceof Error ? e.message : "تعذّر الحفظ")}</p>`;
      } finally {
        state.captureAdult = false;
      }
    });
    view.querySelector("#vpick")?.addEventListener("click", () => view.querySelector("#vfile")?.click());
    view.querySelector("#vfile")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      state.captureAdult = true;
      try {
        const item = await importLocal(file);
        toast("تم الاستيراد إلى الخزنة");
        status.innerHTML = `<p class="ok">«${escapeHtml(item.title)}» داخل الخزنة.</p>`;
        render();
      } catch (err) {
        status.innerHTML = `<p class="err">${escapeHtml(err instanceof Error ? err.message : "فشل الاستيراد")}</p>`;
      } finally {
        state.captureAdult = false;
      }
    });
  }

  function render() {
    teardownReels();
    view.classList.remove("reels-mode");
    if (state.tab !== "vault" && state.vaultUnlocked) lockVault();
    if (state.tab === "home") renderHome();
    else if (state.tab === "browser") renderBrowser();
    else if (state.tab === "recover") renderRecover();
    else if (state.tab === "manga") renderManga();
    else if (state.tab === "inbox") renderInbox();
    else if (state.tab === "vault") renderVault();
    else renderProfile();
    armLockTimer();
  }

  function syncNav() {
    root.querySelectorAll(".nav-btn").forEach((b) => {
      b.classList.toggle("active", b.getAttribute("data-tab") === state.tab);
    });
  }

  function onOnline() {
    offlineEl.classList.add("hidden");
  }
  function onOffline() {
    offlineEl.classList.remove("hidden");
  }
  function onKey(e) {
    if (e.key === "Escape") closePlayer();
  }

  root.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => {
      goTab(b.getAttribute("data-tab"));
    }),
  );

  window.addEventListener("online", onOnline);
  window.addEventListener("offline", onOffline);
  if (!navigator.onLine) offlineEl.classList.remove("hidden");
  document.addEventListener("keydown", onKey);

  load();
  ensureSeed();
  updateBadge();
  render();

  return () => {
    mangaPages.forEach((pg) => {
      if (pg.srcUrl) URL.revokeObjectURL(pg.srcUrl);
      if (pg.outUrl) URL.revokeObjectURL(pg.outUrl);
    });
    teardownReels();
    clearTimeout(lockTimer);
    closePlayer();
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("keydown", onKey);
    root.innerHTML = "";
  };
}
