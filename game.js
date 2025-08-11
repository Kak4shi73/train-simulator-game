'use strict';

(function main() {
  // Canvas and rendering setup
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');

  // Device pixel ratio handling for crisp rendering
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const baseWidth = canvas.width;
  const baseHeight = canvas.height;
  function resize() {
    const styleWidth = canvas.clientWidth;
    const styleHeight = canvas.clientHeight;
    canvas.width = Math.floor(styleWidth * dpr);
    canvas.height = Math.floor(styleHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  addEventListener('resize', resize);

  // UI elements
  const speedEl = document.getElementById('speedValue');
  const throttleEl = document.getElementById('throttleValue');
  const brakeEl = document.getElementById('brakeValue');
  const passengersEl = document.getElementById('passengersValue');
  const capacityEl = document.getElementById('capacityValue');
  const currentStationEl = document.getElementById('currentStation');
  const nextStationEl = document.getElementById('nextStation');
  const nextStationDistanceEl = document.getElementById('nextStationDistance');
  const signalAspectEl = document.getElementById('signalAspect');
  const ruleHintEl = document.getElementById('ruleHint');

  const throttleUpBtn = document.getElementById('throttleUp');
  const throttleDownBtn = document.getElementById('throttleDown');
  const brakeBtn = document.getElementById('brakeBtn');
  const hornBtn = document.getElementById('hornBtn');

  // Simple Audio (WebAudio API) for horn
  let audioCtx = null;
  function ensureAudioCtx() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
  }

  function playHorn(durationMs = 1400) {
    ensureAudioCtx();

    const now = audioCtx.currentTime;

    // Two oscillators to mimic a train horn timbre
    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const lpf = audioCtx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc2.type = 'triangle';

    // Base frequency sweep
    const fStart = 250; // Hz
    const fEnd = 180;   // Hz

    osc1.frequency.setValueAtTime(fStart, now);
    osc1.frequency.exponentialRampToValueAtTime(fEnd, now + durationMs / 1000);

    osc2.frequency.setValueAtTime(fStart * 0.5, now);
    osc2.frequency.exponentialRampToValueAtTime(fEnd * 0.5, now + durationMs / 1000);

    // Gentle pitch modulation
    const mod = audioCtx.createOscillator();
    mod.type = 'sine';
    mod.frequency.setValueAtTime(3.2, now);
    const modGain = audioCtx.createGain();
    modGain.gain.setValueAtTime(6, now); // +/- 6 Hz
    mod.connect(modGain);
    modGain.connect(osc1.frequency);

    // Filter for softer tone
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(1200, now);

    // Amplitude envelope
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.6, now + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.25, now + (durationMs / 1000) - 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(lpf);
    lpf.connect(audioCtx.destination);

    osc1.start(now);
    osc2.start(now);
    mod.start(now);

    osc1.stop(now + durationMs / 1000);
    osc2.stop(now + durationMs / 1000);
    mod.stop(now + durationMs / 1000);
  }

  // Route definition (Mumbai CSMT → Pune Jn) with real-ish distances (km)
  // Distances are cumulative along the route
  const routeStations = [
    { name: 'Mumbai CSMT', km: 0 },
    { name: 'Dadar', km: 10 },
    { name: 'Thane', km: 24 },
    { name: 'Kalyan Jn', km: 44 },
    { name: 'Karjat', km: 84 },
    { name: 'Lonavala', km: 113 },
    { name: 'Shivajinagar', km: 171 },
    { name: 'Pune Jn', km: 177 }
  ];
  const routeLengthKm = routeStations[routeStations.length - 1].km;

  // Random level crossings along the open track (not near stations)
  const levelCrossings = [];
  (function generateCrossings() {
    const minGap = 18; // km
    let pos = 30;
    while (pos < routeLengthKm - 20) {
      const nearStation = routeStations.some(s => Math.abs(s.km - pos) < 4);
      if (!nearStation) levelCrossings.push(pos);
      pos += minGap + Math.random() * 25;
    }
  })();

  // Signals along the route
  const signals = [];
  (function generateSignals() {
    // Place a signal roughly every 20–35 km, with mostly green aspects
    let pos = 20;
    while (pos < routeLengthKm - 5) {
      const r = Math.random();
      /** @type {'G'|'Y'|'R'} */
      let aspect = 'G';
      if (r < 0.10) aspect = 'R';
      else if (r < 0.25) aspect = 'Y';

      // Avoid red next to station to simplify
      const nearStation = routeStations.some(s => Math.abs(s.km - pos) < 3);
      if (nearStation && aspect === 'R') aspect = 'Y';

      signals.push({ km: pos, aspect });
      pos += 20 + Math.random() * 15;
    }
  })();

  // Train and gameplay state
  const train = {
    positionKm: 0, // 0 → routeLengthKm
    speedKmh: 0,
    throttle: 0, // 0..1
    brake: 0,    // 0..1
    passengers: 120,
    capacity: 900,
    dwellRemainingS: 0,
    atStationIndex: 0 // next station to stop at
  };

  // Core constants
  const MAX_SPEED_KMH = 1000; // as requested
  const MAX_ACCEL_KMH_S = 80; // acceleration per second when full throttle
  const MAX_BRAKE_KMH_S = 140; // braking per second at full brake
  const DRAG_DECEL_PER_S = 3.5; // natural drag deceleration per second

  // Rules and limits
  const STATION_SPEED_LIMIT_KMH = 50; // within station area
  const STATION_SLOWDOWN_RADIUS_KM = 1.8; // start slowing ahead of station
  const DWELL_TIME_S = [18, 42]; // dwell range

  // UI initial values
  capacityEl.textContent = String(train.capacity);

  // Helper: get current and next station based on position
  function getStationContext(positionKm) {
    let currentIdx = 0;
    for (let i = 0; i < routeStations.length; i++) {
      if (positionKm >= routeStations[i].km) currentIdx = i;
    }
    const current = routeStations[currentIdx];
    const next = routeStations[Math.min(currentIdx + 1, routeStations.length - 1)];
    const distToNext = Math.max(0, next.km - positionKm);
    return { currentIdx, current, next, distToNext };
  }

  // Helper: find next signal within a lookahead window
  function getUpcomingSignal(positionKm, lookaheadKm = 5) {
    for (const s of signals) {
      if (s.km >= positionKm && s.km - positionKm <= lookaheadKm) return s;
    }
    return null;
  }

  function isInStationArea(positionKm, stationKm, radiusKm = STATION_SLOWDOWN_RADIUS_KM) {
    return Math.abs(positionKm - stationKm) <= radiusKm;
  }

  // Passenger model: random load/unload at stops
  function handlePassengersAtStop(stationName) {
    const alight = Math.min(train.passengers, Math.floor(Math.random() * 80));
    const board = Math.min(
      train.capacity - (train.passengers - alight),
      Math.floor(40 + Math.random() * 120)
    );
    train.passengers = Math.min(train.capacity, train.passengers - alight + board);

    // Update UI immediately
    passengersEl.textContent = String(train.passengers);
    capacityEl.textContent = String(train.capacity);

    // Provide a small hint
    showRuleHint(
      `Stop at ${stationName}: -${alight} +${board} passengers`,
      'ok'
    );
  }

  // Rules hints (UI)
  let ruleHintTimer = 0;
  function showRuleHint(text, level = 'ok') {
    ruleHintEl.textContent = text;
    ruleHintEl.classList.remove('rule-warning', 'rule-ok');
    ruleHintEl.classList.add(level === 'ok' ? 'rule-ok' : 'rule-warning');
    ruleHintTimer = 3; // seconds to show
  }

  // Input handling
  const input = {
    throttleUp: false,
    throttleDown: false,
    brake: false,
  };

  function updateInputsFromKeys(e, isDown) {
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        input.throttleUp = isDown; break;
      case 'ArrowDown':
      case 'KeyS':
        input.throttleDown = isDown; break;
      case 'KeyB':
        input.brake = isDown; break;
      case 'KeyH':
      case 'Space':
        if (isDown) playHorn();
        break;
      default:
        break;
    }
  }

  addEventListener('keydown', (e) => updateInputsFromKeys(e, true));
  addEventListener('keyup', (e) => updateInputsFromKeys(e, false));

  // Buttons
  throttleUpBtn.addEventListener('click', () => { train.throttle = Math.min(1, train.throttle + 0.1); });
  throttleDownBtn.addEventListener('click', () => { train.throttle = Math.max(0, train.throttle - 0.1); });
  brakeBtn.addEventListener('mousedown', () => { train.brake = Math.min(1, train.brake + 0.5); });
  brakeBtn.addEventListener('mouseup', () => { train.brake = Math.max(0, train.brake - 0.5); });
  hornBtn.addEventListener('click', () => playHorn());

  // Simulation tick
  let lastTs = performance.now();

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  // Visual state for parallax
  let bgOffset = 0; // for parallax scrolling

  function update(dt) {
    // Input to throttle/brake changes (smooth)
    if (input.throttleUp) train.throttle = Math.min(1, train.throttle + 0.5 * dt);
    if (input.throttleDown) train.throttle = Math.max(0, train.throttle - 0.5 * dt);
    if (input.brake) train.brake = Math.min(1, train.brake + 0.8 * dt); else train.brake = Math.max(0, train.brake - 0.8 * dt);

    // Station context
    const { currentIdx, current, next, distToNext } = getStationContext(train.positionKm);

    // Rules: station speed limit zone
    const inStationZone = isInStationArea(train.positionKm, next.km, STATION_SLOWDOWN_RADIUS_KM);
    let currentSpeedLimit = inStationZone ? STATION_SPEED_LIMIT_KMH : MAX_SPEED_KMH;

    // Rules: upcoming signal
    const upcomingSignal = getUpcomingSignal(train.positionKm, 4);
    if (upcomingSignal) {
      signalAspectEl.textContent = upcomingSignal.aspect;
      if (upcomingSignal.aspect === 'Y') {
        currentSpeedLimit = Math.min(currentSpeedLimit, 60);
        showRuleHint('Caution: Yellow signal ahead. Prepare to slow.', 'ok');
      } else if (upcomingSignal.aspect === 'R') {
        currentSpeedLimit = Math.min(currentSpeedLimit, 0); // must stop
        const dist = Math.max(0, upcomingSignal.km - train.positionKm);
        if (dist < 0.12 && train.speedKmh > 0.5) {
          // SPAD (signal passed at danger): emergency brake
          train.brake = 1;
          showRuleHint('Signal passed at danger! Emergency braking engaged.', 'warn');
        } else {
          showRuleHint('Red signal ahead. Stop before signal.', 'ok');
        }
      }
    } else {
      signalAspectEl.textContent = 'G';
    }

    // Rules: level crossing horn
    const nextCrossing = levelCrossings.find(km => km >= train.positionKm && km - train.positionKm < 1.0);
    if (nextCrossing) {
      const dist = (nextCrossing - train.positionKm).toFixed(2);
      showRuleHint(`Level crossing in ${dist} km. Sound horn.`, 'ok');
    }

    // Dwell handling at stations
    const atTerminal = currentIdx === routeStations.length - 1 && train.positionKm >= routeLengthKm;
    if (atTerminal) {
      train.speedKmh = 0;
      train.throttle = 0;
      train.brake = 1;
      draw(0); // draw once to update view
      showEndOverlay();
      return; // stop simulation
    }

    // Auto-stop at stations
    if (train.dwellRemainingS > 0) {
      train.speedKmh = 0;
      train.throttle = 0;
      train.brake = 1;
      train.dwellRemainingS -= dt;
      if (train.dwellRemainingS <= 0) {
        train.brake = 0.2; // gentle release
      }
    } else {
      const nextStationDist = distToNext;
      const wantStopHere = nextStationDist < 0.02; // inside platform area
      if (inStationZone && nextStationDist < 0.15) {
        // Begin braking profile
        train.brake = Math.max(train.brake, 0.6);
      }
      if (wantStopHere) {
        train.positionKm = routeStations[currentIdx + 1].km;
        train.speedKmh = 0;
        train.throttle = 0;
        train.brake = 1;
        train.dwellRemainingS = randBetween(DWELL_TIME_S[0], DWELL_TIME_S[1]);
        handlePassengersAtStop(routeStations[currentIdx + 1].name);
      }
    }

    // Physics integration
    const accel = train.throttle * MAX_ACCEL_KMH_S;
    const decel = train.brake * MAX_BRAKE_KMH_S + DRAG_DECEL_PER_S;

    let newSpeed = train.speedKmh + (accel - decel) * dt;

    // Enforce speed limits
    if (newSpeed > currentSpeedLimit) {
      newSpeed = Math.max(newSpeed - 220 * dt, currentSpeedLimit); // quick bleed to limit
      // warn if above a realistic operating limit
      if (currentSpeedLimit < MAX_SPEED_KMH) {
        showRuleHint('Speed limited in this section.', 'ok');
      }
    }

    train.speedKmh = clamp(newSpeed, 0, MAX_SPEED_KMH);

    // Position update (km) — convert km/h to km/s
    const deltaKm = (train.speedKmh / 3600) * (dt);
    train.positionKm = clamp(train.positionKm + deltaKm, 0, routeLengthKm);

    // Update UI
    speedEl.textContent = String(train.speedKmh.toFixed(0));
    throttleEl.textContent = String((train.throttle * 100).toFixed(0));
    brakeEl.textContent = String((train.brake * 100).toFixed(0));
    passengersEl.textContent = String(train.passengers);

    currentStationEl.textContent = routeStations[currentIdx].name;
    nextStationEl.textContent = routeStations[Math.min(currentIdx + 1, routeStations.length - 1)].name;
    nextStationDistanceEl.textContent = (distToNext).toFixed(2);

    // Rule hint timer
    if (ruleHintTimer > 0) {
      ruleHintTimer -= dt;
      if (ruleHintTimer <= 0) {
        ruleHintEl.textContent = '—';
        ruleHintEl.classList.remove('rule-warning', 'rule-ok');
      }
    }

    // Parallax offset by speed
    bgOffset += (train.speedKmh / 3.6) * dt; // m/s scaled – used as a seed for parallax

    draw(dt);
  }

  function draw(dt) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Clear to sky gradient is done by CSS background; draw ground and scenery
    ctx.clearRect(0, 0, w, h);

    const horizonY = h * 0.62;

    // Ground
    ctx.fillStyle = '#7fb96a';
    ctx.fillRect(0, horizonY, w, h - horizonY);

    // Parallax hills
    drawHills(horizonY, 0.3, '#3a6d5b', 0.2);
    drawHills(horizonY + 10, 0.5, '#2e5b77', 0.12);

    // Tracks
    drawTracks(horizonY + 40);

    // Stations and platforms
    drawStations(horizonY + 25);

    // Signals
    drawSignals(horizonY + 10);

    // Level crossings
    drawCrossings(horizonY + 20);

    // Train (stylized)
    drawTrain(horizonY + 12);

    // Speedometer gauge
    drawGauge(w - 180, h - 180, 150, train.speedKmh, MAX_SPEED_KMH);
  }

  function drawHills(baseY, amplitude, color, speedFactor) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    ctx.fillStyle = color;
    ctx.beginPath();
    const seed = bgOffset * speedFactor;
    const step = 40;
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= w; x += step) {
      const y = baseY - 20 - 18 * Math.sin((x + seed) * 0.01) - 10 * Math.cos((x * 0.7 + seed * 0.6) * 0.015);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
  }

  function drawTracks(y) {
    const w = canvas.clientWidth;
    // Sleepers
    const sleeperSpacing = 22;
    const scroll = (bgOffset * 0.6) % sleeperSpacing;

    ctx.fillStyle = '#a38a6a';
    for (let x = -scroll; x < w; x += sleeperSpacing) {
      ctx.fillRect(x, y + 18, 12, 6);
    }

    // Rails
    ctx.strokeStyle = '#777';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, y + 24);
    ctx.lineTo(w, y + 24);
    ctx.stroke();
  }

  function drawStations(y) {
    const w = canvas.clientWidth;
    const kmToPx = 16; // purely visual scale
    const centerX = w * 0.35; // train visual position

    const { currentIdx } = getStationContext(train.positionKm);

    for (let i = 0; i < routeStations.length; i++) {
      const station = routeStations[i];
      const dxKm = station.km - train.positionKm;
      const x = centerX + dxKm * kmToPx;

      if (x < -200 || x > w + 200) continue;

      // Platform
      ctx.fillStyle = '#c9c3a6';
      const platformWidth = 140;
      ctx.fillRect(x - platformWidth / 2, y - 14, platformWidth, 8);

      // Station building
      ctx.fillStyle = i === currentIdx ? '#ef8c5b' : '#bd7c55';
      ctx.fillRect(x - 24, y - 30, 48, 16);
      ctx.fillStyle = '#2b2b2b';
      ctx.fillRect(x - 18, y - 26, 12, 8);
      ctx.fillRect(x + 6, y - 26, 12, 8);

      // Name tag
      ctx.fillStyle = '#0b0f14';
      ctx.fillRect(x - 46, y - 42, 92, 14);
      ctx.fillStyle = '#f6d36d';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(station.name, x, y - 35);
    }
  }

  function drawSignals(y) {
    const w = canvas.clientWidth;
    const kmToPx = 16;
    const centerX = w * 0.35;

    for (const s of signals) {
      const x = centerX + (s.km - train.positionKm) * kmToPx;
      if (x < -50 || x > w + 50) continue;

      // Post
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(x - 2, y - 28, 4, 28);
      ctx.fillRect(x - 8, y - 28, 16, 8);

      // Lights
      const lightY = y - 20;
      const radius = 4;
      // Red
      ctx.beginPath();
      ctx.arc(x, lightY, radius, 0, Math.PI * 2);
      ctx.fillStyle = s.aspect === 'R' ? '#ff5454' : '#662d2d';
      ctx.fill();
      // Yellow
      ctx.beginPath();
      ctx.arc(x, lightY + 10, radius, 0, Math.PI * 2);
      ctx.fillStyle = s.aspect === 'Y' ? '#ffd24a' : '#6b5b2b';
      ctx.fill();
      // Green
      ctx.beginPath();
      ctx.arc(x, lightY + 20, radius, 0, Math.PI * 2);
      ctx.fillStyle = s.aspect === 'G' ? '#6fff84' : '#255a2f';
      ctx.fill();
    }
  }

  function drawCrossings(y) {
    const w = canvas.clientWidth;
    const kmToPx = 16;
    const centerX = w * 0.35;

    for (const cKm of levelCrossings) {
      const x = centerX + (cKm - train.positionKm) * kmToPx;
      if (x < -80 || x > w + 80) continue;

      // Gate arms
      ctx.fillStyle = '#b5342c';
      ctx.fillRect(x - 2, y - 8, 4, 40);
      ctx.save();
      ctx.translate(x, y - 8);
      const armAngle = Math.sin((bgOffset + cKm * 20) * 0.02) * 0.05; // idle sway
      ctx.rotate(-Math.PI / 2 + armAngle);
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, -2, 40, 4);
      ctx.restore();

      // Sign
      ctx.fillStyle = '#333';
      ctx.fillRect(x - 10, y - 18, 20, 8);
      ctx.fillStyle = '#ffd24a';
      ctx.font = '10px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('XING', x, y - 14);
    }
  }

  function drawTrain(y) {
    const w = canvas.clientWidth;
    const x = w * 0.35; // fixed camera on train

    // Engine
    ctx.fillStyle = '#2f3a48';
    ctx.fillRect(x - 80, y - 22, 160, 22);
    ctx.fillStyle = '#e66347';
    ctx.fillRect(x + 58, y - 20, 16, 14);
    ctx.fillStyle = '#9fb5c9';
    ctx.fillRect(x - 70, y - 18, 42, 10);

    // Wheels
    ctx.fillStyle = '#1f262e';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(x - i * 28 - 10, y + 2, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Smoke puff (simple)
    const t = performance.now() * 0.001;
    const puffX = x + 50;
    const puffY = y - 26 - Math.abs(Math.sin(t * 3)) * 6;
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#e8f0f7';
    ctx.beginPath();
    ctx.arc(puffX, puffY, 10 + Math.abs(Math.cos(t * 2)) * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGauge(cx, cy, radius, speed, maxSpeed) {
    // Background
    ctx.save();
    ctx.translate(cx, cy);

    ctx.fillStyle = 'rgba(10,14,18,0.65)';
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    roundedRect(ctx, -radius, -radius, radius * 2, radius * 2, 14);
    ctx.fill();
    ctx.stroke();

    // Arc
    const start = Math.PI * 0.75;
    const end = Math.PI * 0.25;
    const frac = clamp(speed / maxSpeed, 0, 1);
    const angle = start + (end - start) * frac;

    // Ticks
    ctx.strokeStyle = '#4a6a8f';
    for (let i = 0; i <= 10; i++) {
      const a = start + (end - start) * (i / 10);
      drawTick(a, i % 2 === 0 ? 12 : 8);
    }

    // Needle
    ctx.strokeStyle = '#ff6b5c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(angle) * (radius - 24), Math.sin(angle) * (radius - 24));
    ctx.stroke();

    // Text
    ctx.fillStyle = '#e8f0f7';
    ctx.font = 'bold 18px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${speed.toFixed(0)} km/h`, 0, radius * 0.4);

    ctx.restore();

    function drawTick(a, len) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (radius - 10), Math.sin(a) * (radius - 10));
      ctx.lineTo(Math.cos(a) * (radius - 10 - len), Math.sin(a) * (radius - 10 - len));
      ctx.stroke();
    }
  }

  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function randBetween(a, b) { return a + Math.random() * (b - a); }

  // Overlay for end
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlayText');
  const resumeBtn = document.getElementById('resumeBtn');

  function showEndOverlay() {
    overlay.classList.remove('hidden');
    overlayText.textContent = 'Route completed. Congratulations!';
    resumeBtn.classList.remove('hidden');
  }

  resumeBtn.addEventListener('click', () => {
    overlay.classList.add('hidden');
    resumeBtn.classList.add('hidden');
    // Restart route
    train.positionKm = 0;
    train.speedKmh = 0;
    train.throttle = 0;
    train.brake = 0;
    train.dwellRemainingS = 0;
    ruleHintEl.textContent = '—';
    requestAnimationFrame(loop);
  });

  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastTs) / 1000); // clamp to 50 ms
    lastTs = ts;
    update(dt);
    requestAnimationFrame(loop);
  }

  requestAnimationFrame(loop);
})(); 