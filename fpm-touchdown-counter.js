// ==UserScript==
// @name         GeoFS Touchdown Pro (MSFS Style)
// @namespace    https://www.geo-fs.com/
// @version      1.0.0
// @description  Analisis touchdown profesional ala MSFS/X-Plane — FPM, G-Force, Pitch, Bank, Sparkline
// @author       DeepSeek
// @match        https://www.geo-fs.com/geofs.php*
// @match        https://geo-fs.com/geofs.php*
// @match        https://*.geo-fs.com/geofs.php*
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function () {
  "use strict";

  // ============================================================
  // 1. State
  // ============================================================
  const SAMPLE_WINDOW_MS = 5000;   // sparkline: 5 detik terakhir
  const CARD_HIDE_DELAY = 10000;   // card hilang setelah 10 detik
  const MS_TO_FPM = 196.85;

  let vsHistory = [];        // [{t, vs}] — vertical speed history (m/s)
  let lastGroundContact = false;
  let cardTimeout = null;
  let card = null;
  let styleInjected = false;

  // Untuk G-force: sampling setelah touchdown
  let gSample = { active: false, v0: 0, t0: 0 };

  // ============================================================
  // 2. Inject CSS (sekali aja)
  // ============================================================
  function injectStyle() {
    if (styleInjected) return;
    const style = document.createElement("style");
    style.id = "geofs-td-pro-style";
    style.textContent = `
      #geofs-td-pro {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%) scale(0.92);
        width: 420px;
        background: linear-gradient(145deg, rgba(18,24,38,0.96), rgba(10,14,22,0.96));
        border: 1px solid rgba(90,155,255,0.25);
        border-radius: 18px;
        padding: 26px 28px 22px;
        box-shadow:
          0 20px 60px rgba(0,0,0,0.7),
          0 0 0 1px rgba(255,255,255,0.03) inset,
          0 0 80px rgba(90,155,255,0.1);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        color: #fff;
        z-index: 2147483647;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
      }
      #geofs-td-pro.show {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      #geofs-td-pro .td-header {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px; padding-bottom: 14px;
        border-bottom: 1px solid rgba(90,155,255,0.12);
      }
      #geofs-td-pro .td-title {
        font-size: 11px; letter-spacing: 3px; text-transform: uppercase;
        color: #5a9fff; font-weight: 700;
      }
      #geofs-td-pro .td-aircraft {
        font-size: 11px; color: #6a8fa8;
        font-family: 'Consolas', monospace; letter-spacing: 1px;
      }
      #geofs-td-pro .td-fpm-block { text-align: center; margin-bottom: 18px; }
      #geofs-td-pro .td-fpm {
        font-size: 72px; font-weight: 800;
        font-family: 'Consolas', 'Monaco', monospace;
        line-height: 1; letter-spacing: -2px;
        background: linear-gradient(180deg, #fff 0%, #b0d0f0 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 0 20px rgba(90,155,255,0.4));
        transition: filter 0.3s ease;
      }
      #geofs-td-pro .td-fpm.butter { filter: drop-shadow(0 0 25px rgba(74,222,128,0.6)); }
      #geofs-td-pro .td-fpm.smooth { filter: drop-shadow(0 0 25px rgba(163,230,53,0.6)); }
      #geofs-td-pro .td-fpm.firm   { filter: drop-shadow(0 0 25px rgba(251,191,36,0.6)); }
      #geofs-td-pro .td-fpm.hard   { filter: drop-shadow(0 0 25px rgba(248,113,113,0.7)); }
      #geofs-td-pro .td-unit {
        font-size: 13px; letter-spacing: 4px; color: #5a8fc8;
        text-transform: uppercase; margin-top: 4px; font-weight: 600;
      }
      #geofs-td-pro .td-badge {
        display: inline-block; margin-top: 12px;
        padding: 6px 18px; border-radius: 30px;
        font-size: 13px; font-weight: 700;
        letter-spacing: 1.5px; text-transform: uppercase;
        transition: all 0.3s ease;
      }
      #geofs-td-pro .td-badge.butter { background: rgba(74,222,128,0.15); color: #4ade80; border: 1px solid rgba(74,222,128,0.4); }
      #geofs-td-pro .td-badge.smooth { background: rgba(163,230,53,0.15); color: #a3e635; border: 1px solid rgba(163,230,53,0.4); }
      #geofs-td-pro .td-badge.firm   { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.4); }
      #geofs-td-pro .td-badge.hard   { background: rgba(248,113,113,0.15); color: #f87171; border: 1px solid rgba(248,113,113,0.4); }
      #geofs-td-pro .td-spark-wrap {
        margin: 20px 0 16px; padding: 12px 14px;
        background: rgba(0,0,0,0.3); border-radius: 10px;
        border: 1px solid rgba(90,155,255,0.1);
      }
      #geofs-td-pro .td-spark-label {
        font-size: 9px; letter-spacing: 2px; color: #4a6a88;
        text-transform: uppercase; margin-bottom: 8px; font-weight: 600;
      }
      #geofs-td-pro .td-spark { width: 100%; height: 50px; display: block; }
      #geofs-td-pro .td-spark .line {
        fill: none; stroke: #5a9fff; stroke-width: 2;
        stroke-linecap: round; stroke-linejoin: round;
        filter: drop-shadow(0 0 4px rgba(90,155,255,0.6));
      }
      #geofs-td-pro .td-spark .area { fill: url(#tdGradient); opacity: 0.4; }
      #geofs-td-pro .td-stats {
        display: grid; grid-template-columns: 1fr 1fr 1fr;
        gap: 10px; margin-top: 14px;
      }
      #geofs-td-pro .td-stat {
        background: rgba(0,0,0,0.25);
        border: 1px solid rgba(90,155,255,0.1);
        border-radius: 8px; padding: 10px 8px; text-align: center;
      }
      #geofs-td-pro .td-stat-label {
        font-size: 9px; letter-spacing: 1.5px; color: #5a8fc8;
        text-transform: uppercase; margin-bottom: 5px; font-weight: 600;
      }
      #geofs-td-pro .td-stat-value {
        font-size: 18px; font-weight: 700;
        font-family: 'Consolas', monospace;
        color: #e0ecff; line-height: 1;
      }
      #geofs-td-pro .td-stat-unit {
        font-size: 10px; color: #6a8fa8;
        margin-left: 2px; font-weight: 500;
      }
      #geofs-td-pro .td-footer {
        display: flex; justify-content: space-between;
        margin-top: 18px; padding-top: 12px;
        border-top: 1px solid rgba(90,155,255,0.1);
        font-size: 10px; color: #4a6a88;
        font-family: 'Consolas', monospace; letter-spacing: 1px;
      }
    `;
    document.head.appendChild(style);
    styleInjected = true;
  }

  // ============================================================
  // 3. Bikin card DOM (sekali aja, disembunyiin)
  // ============================================================
  function createCard() {
    if (card) return;
    card = document.createElement("div");
    card.id = "geofs-td-pro";
    card.innerHTML = `
      <div class="td-header">
        <div class="td-title">Touchdown Analysis</div>
        <div class="td-aircraft" id="td-aircraft">--</div>
      </div>
      <div class="td-fpm-block">
        <div class="td-fpm" id="td-fpm">--</div>
        <div class="td-unit">Feet / Minute</div>
        <div class="td-badge" id="td-badge">Waiting...</div>
      </div>
      <div class="td-spark-wrap">
        <div class="td-spark-label">Vertical Speed · Last 5 Seconds</div>
        <svg class="td-spark" viewBox="0 0 340 50" preserveAspectRatio="none">
          <defs>
            <linearGradient id="tdGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#5a9fff" stop-opacity="0.6"/>
              <stop offset="100%" stop-color="#5a9fff" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <path class="area" id="td-spark-area" d=""/>
          <path class="line" id="td-spark-line" d=""/>
        </svg>
      </div>
      <div class="td-stats">
        <div class="td-stat">
          <div class="td-stat-label">G-Force</div>
          <div class="td-stat-value" id="td-g">--<span class="td-stat-unit">g</span></div>
        </div>
        <div class="td-stat">
          <div class="td-stat-label">Pitch</div>
          <div class="td-stat-value" id="td-pitch">--<span class="td-stat-unit">°</span></div>
        </div>
        <div class="td-stat">
          <div class="td-stat-label">Bank</div>
          <div class="td-stat-value" id="td-bank">--<span class="td-stat-unit">°</span></div>
        </div>
      </div>
      <div class="td-footer">
        <span id="td-time">--:--:-- UTC</span>
        <span id="td-loc">--</span>
      </div>
    `;
    document.body.appendChild(card);
  }

  // ============================================================
  // 4. Kategori FPM
  // ============================================================
  function categorize(fpm) {
    if (fpm <= 150) return { cls: "butter", label: "🧈 Butter" };
    if (fpm <= 300) return { cls: "smooth", label: "✅ Smooth" };
    if (fpm <= 600) return { cls: "firm",   label: "⚠️ Firm" };
    return { cls: "hard", label: "💥 Hard" };
  }

  // ============================================================
  // 5. Count-up animation
  // ============================================================
  function animateNumber(el, from, to, duration) {
    const start = performance.now();
    function step(now) {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (to - from) * eased);
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  // ============================================================
  // 6. Draw sparkline
  // ============================================================
  function drawSparkline(values, cls) {
    const W = 340, H = 50;
    if (values.length < 2) return;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 8) - 4;
      return [x, y];
    });

    const linePath = points.map((p, i) =>
      (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)
    ).join(" ");
    const areaPath = linePath + ` L${W} ${H} L0 ${H} Z`;

    const lineEl = card.querySelector("#td-spark-line");
    const areaEl = card.querySelector("#td-spark-area");

    const colors = {
      butter: "#4ade80", smooth: "#a3e635",
      firm: "#fbbf24", hard: "#f87171"
    };
    lineEl.style.stroke = colors[cls] || "#5a9fff";
    lineEl.style.filter = `drop-shadow(0 0 5px ${colors[cls]}88)`;

    lineEl.setAttribute("d", linePath);
    areaEl.setAttribute("d", areaPath);

    // Animasi gambar garis
    try {
      const len = lineEl.getTotalLength();
      lineEl.style.strokeDasharray = len;
      lineEl.style.strokeDashoffset = len;
      lineEl.style.transition = "none";
      void lineEl.getBoundingClientRect();
      lineEl.style.transition = "stroke-dashoffset 1.2s ease-out";
      lineEl.style.strokeDashoffset = 0;
    } catch (e) { /* ignore */ }

    areaEl.style.opacity = 0;
    areaEl.style.transition = "opacity 0.8s ease-out 0.4s";
    setTimeout(() => { areaEl.style.opacity = 0.4; }, 50);
  }

  // ============================================================
  // 7. Tampilkan card pas touchdown
  // ============================================================
  function showTouchdown(data) {
    createCard();

    const { fpm, g, pitch, bank, vsHistory: vs, aircraft, lat, lon } = data;
    const cat = categorize(fpm);

    // Aircraft name
    card.querySelector("#td-aircraft").textContent = aircraft || "--";

    // FPM count-up
    const fpmEl = card.querySelector("#td-fpm");
    fpmEl.className = "td-fpm " + cat.cls;
    animateNumber(fpmEl, 0, fpm, 800);

    // Badge
    const badge = card.querySelector("#td-badge");
    badge.className = "td-badge " + cat.cls;
    badge.textContent = cat.label;

    // Stats
    card.querySelector("#td-g").innerHTML = g.toFixed(2) + '<span class="td-stat-unit">g</span>';
    card.querySelector("#td-pitch").innerHTML = pitch.toFixed(1) + '<span class="td-stat-unit">°</span>';
    card.querySelector("#td-bank").innerHTML = bank.toFixed(1) + '<span class="td-stat-unit">°</span>';

    // Sparkline
    drawSparkline(vs, cat.cls);

    // Timestamp
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, "0");
    const mm = String(now.getUTCMinutes()).padStart(2, "0");
    const ss = String(now.getUTCSeconds()).padStart(2, "0");
    card.querySelector("#td-time").textContent = `${hh}:${mm}:${ss} UTC`;

    // Location (koordinat)
    if (lat != null && lon != null) {
      card.querySelector("#td-loc").textContent =
        `${lat.toFixed(3)}°, ${lon.toFixed(3)}°`;
    } else {
      card.querySelector("#td-loc").textContent = "--";
    }

    // Munculin
    card.classList.add("show");

    // Reset timer auto-hide
    if (cardTimeout) clearTimeout(cardTimeout);
    cardTimeout = setTimeout(() => {
      card.classList.remove("show");
    }, CARD_HIDE_DELAY);

    console.log("[Touchdown-Pro]", { fpm, g, pitch, bank });
  }

  // ============================================================
  // 8. Loop utama — sampling terus-terusan
  // ============================================================
  function tick() {
    requestAnimationFrame(tick);

    const geofs = window.geofs;
    if (!geofs || !geofs.aircraft || !geofs.aircraft.instance) return;

    const inst = geofs.aircraft.instance;
    const now = performance.now();

    // --- Sampling vertical speed ---
    const vs = inst.verticalSpeed;
    if (typeof vs === "number") {
      vsHistory.push({ t: now, vs });
      // Buang yang lebih lama dari window
      while (vsHistory.length && (now - vsHistory[0].t) > SAMPLE_WINDOW_MS) {
        vsHistory.shift();
      }
    }

    // --- Deteksi ground contact ---
    const isGround = inst.groundContact === true;

    // Transisi udara → tanah = TOUCHDOWN
    if (isGround && !lastGroundContact) {
      handleTouchdown(inst, now);
    }

    // Transisi tanah → udara = LEPAS LANDAS (reset)
    if (!isGround && lastGroundContact) {
      vsHistory = [];
      if (card) card.classList.remove("show");
      if (cardTimeout) { clearTimeout(cardTimeout); cardTimeout = null; }
    }

    lastGroundContact = isGround;
  }

  // ============================================================
  // 9. Logika saat touchdown
  // ============================================================
  function handleTouchdown(inst, now) {
    // FPM dari sample terakhir sebelum nyentuh
    const lastSample = vsHistory[vsHistory.length - 1];
    const vsMs = lastSample ? lastSample.vs : (inst.verticalSpeed || 0);
    const fpm = Math.round(Math.abs(vsMs) * MS_TO_FPM);

    // Pitch & Bank dari rotation
    // GeoFS: rotation = [pitch, roll, yaw] dalam radian
    let pitch = 0, bank = 0;
    const rot = inst.rotation;
    if (Array.isArray(rot) || (rot && typeof rot === "object")) {
      const p = rot[0] || 0;
      const r = rot[1] || 0;
      pitch = Math.abs(p) * (180 / Math.PI);
      bank = Math.abs(r) * (180 / Math.PI);
    }

    // Aircraft name
    let aircraft = "--";
    if (inst.aircraftRecord && inst.aircraftRecord.name) {
      aircraft = inst.aircraftRecord.name;
    } else if (geofs.aircraft.list && geofs.aircraft.instance.definition) {
      aircraft = geofs.aircraft.instance.definition.name || "--";
    }

    // Koordinat
    let lat = null, lon = null;
    if (inst.llaLocation && inst.llaLocation.length >= 2) {
      lat = inst.llaLocation[0];
      lon = inst.llaLocation[1];
    }

    // G-force: estimasi kasar dari perubahan vertical speed
    // Kita sampling lagi setelah ~200ms buat hitung delta
    const gForce = estimateG(inst, vsMs, now);

    // Sparkline data (5 detik terakhir, dibalik biar tua→baru dari kiri→kanan)
    const vsValues = vsHistory.map(s => Math.abs(s.vs) * MS_TO_FPM);
    if (vsValues.length < 2) vsValues.push(fpm);

    showTouchdown({
      fpm,
      g: gForce,
      pitch,
      bank,
      vsHistory: vsValues,
      aircraft,
      lat, lon
    });
  }

  // Estimasi G-force: pakai perubahan vertical speed / waktu / gravitasi
  // GeoFS gak nyediain akselerasi, jadi kita approksimasi.
  function estimateG(inst, v0, t0) {
    // Coba baca G-force kalau ada (beberapa versi GeoFS nyediain)
    if (typeof inst.gForce === "number") return inst.gForce;

    // Fallback: hitung dari perubahan vertical speed setelah 200ms
    // Karena kita gak bisa nunggu (fungsi synchronous), pakai heuristik
    // Berdasarkan FPM: makin keras, makin tinggi G
    const fpm = Math.abs(v0) * MS_TO_FPM;
    // Model sederhana: G ≈ 1 + (fpm / 1000) * 0.9, cap di 2.5
    const g = Math.min(2.5, 1 + (fpm / 1000) * 0.9);
    return g;
  }

  // ============================================================
  // 10. Init
  // ============================================================
  function init() {
    injectStyle();
    createCard();
    tick();
    console.log("[Touchdown-Pro] ✅ Aktif — landing buat lihat analisisnya");
  }

  let attempts = 0;
  const poller = setInterval(() => {
    if (window.geofs && window.geofs.aircraft && window.geofs.aircraft.instance) {
      clearInterval(poller);
      init();
    } else if (++attempts > 200) {
      clearInterval(poller);
      console.warn("[Touchdown-Pro] GeoFS gak kedeteksi setelah 60 detik.");
    }
  }, 300);

})();
