"use strict";

(() => {
  const canvas = document.getElementById("hourglassCanvas");
  const flipButton = document.getElementById("flipButton");
  const grainSlider = document.getElementById("grainCount");
  const grainLabel = document.getElementById("grainCountLabel");

  if (!canvas || !flipButton || !grainSlider || !grainLabel) {
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) {
    return;
  }

  const TAU = Math.PI * 2;
  const config = {
    halfHeight: 1,
    bodyRadius: 0.82,
    neckRadius: 0.09,
    neckBand: 0.06,
    grainRadius: 0.017,
    gravity: 5.7,
    airDrag: 0.992,
    wallBounce: 0.18,
    capBounce: 0.26,
    wallFriction: 0.986,
    surfaceFriction: 0.92,
    flowFactor: 0.017,
    cameraDistance: 3.8,
    viewYaw: -0.53,
    viewPitch: 0.27,
    flipSpring: 24,
    flipDamping: 8.6,
    cellSize: 0.05,
    hashBound: 1.4,
    hashOffset: 200,
    collisionThreshold: 980
  };
  config.coneSlope = (config.bodyRadius - config.neckRadius) / config.halfHeight;
  config.invCellSize = 1 / config.cellSize;

  const view = {
    width: 1,
    height: 1,
    cx: 0,
    cy: 0,
    scale: 1
  };

  const state = {
    grains: [],
    targetCount: Number(grainSlider.value) || 900,
    angle: 0,
    angleVel: 0,
    targetAngle: 0,
    flowBudget: 0,
    lastFrameTime: performance.now(),
    startX: 0,
    startY: 0,
    pointerDown: false,
    lastTapTime: 0
  };

  const projectTmp = { x: 0, y: 0, scale: 0, depth: 0, vz: 0 };
  const projectTmpB = { x: 0, y: 0, scale: 0, depth: 0, vz: 0 };
  const collisionBuckets = new Map();
  const neighborOffsets = [];
  const cosYaw = Math.cos(config.viewYaw);
  const sinYaw = Math.sin(config.viewYaw);
  const cosPitch = Math.cos(config.viewPitch);
  const sinPitch = Math.sin(config.viewPitch);

  for (let dx = -1; dx <= 1; dx += 1) {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        neighborOffsets.push({ dx, dy, dz });
      }
    }
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function radiusAt(y) {
    const t = clamp(Math.abs(y) / config.halfHeight, 0, 1);
    return config.neckRadius + (config.bodyRadius - config.neckRadius) * t;
  }

  function toCellKey(ix, iy, iz) {
    return (ix + config.hashOffset) | ((iy + config.hashOffset) << 9) | ((iz + config.hashOffset) << 18);
  }

  function feedChamberSign() {
    return Math.cos(state.angle) >= 0 ? -1 : 1;
  }

  function samplePosition(chamberSign) {
    const marginY = config.grainRadius * 2.2;
    const minY = chamberSign < 0 ? -config.halfHeight + marginY : marginY;
    const maxY = chamberSign < 0 ? -marginY : config.halfHeight - marginY;
    const y = minY + Math.random() * (maxY - minY);
    const maxR = Math.max(config.neckRadius * 0.6, radiusAt(y) - config.grainRadius * 1.8);
    const theta = Math.random() * TAU;
    const radial = Math.sqrt(Math.random()) * maxR * 0.97;

    return {
      x: Math.cos(theta) * radial,
      y,
      z: Math.sin(theta) * radial,
      vx: (Math.random() - 0.5) * 0.02,
      vy: (Math.random() - 0.5) * 0.02,
      vz: (Math.random() - 0.5) * 0.02,
      ix: 0,
      iy: 0,
      iz: 0
    };
  }

  function refillGrains(nextCount) {
    state.grains.length = 0;
    const source = feedChamberSign();
    const mostlyUpper = Math.floor(nextCount * 0.93);

    for (let i = 0; i < nextCount; i += 1) {
      const chamber = i < mostlyUpper ? source : -source;
      state.grains.push(samplePosition(chamber));
    }

    state.flowBudget = nextCount * 0.12;
  }

  function setGrainCount(nextCount) {
    const min = Number(grainSlider.min) || 200;
    const max = Number(grainSlider.max) || 1400;
    const target = clamp(Math.round(nextCount), min, max);
    const current = state.grains.length;

    if (target === current) {
      return;
    }

    if (target > current) {
      const source = feedChamberSign();
      for (let i = current; i < target; i += 1) {
        state.grains.push(samplePosition(source));
      }
    } else {
      state.grains.length = target;
    }
  }

  function applyBoundary(grain) {
    const minY = -config.halfHeight + config.grainRadius;
    const maxY = config.halfHeight - config.grainRadius;

    if (grain.y < minY) {
      grain.y = minY;
      if (grain.vy < 0) {
        grain.vy *= -config.capBounce;
      }
      grain.vx *= config.surfaceFriction;
      grain.vz *= config.surfaceFriction;
    } else if (grain.y > maxY) {
      grain.y = maxY;
      if (grain.vy > 0) {
        grain.vy *= -config.capBounce;
      }
      grain.vx *= config.surfaceFriction;
      grain.vz *= config.surfaceFriction;
    }

    const radial = Math.hypot(grain.x, grain.z);
    const limit = Math.max(0.0001, radiusAt(grain.y) - config.grainRadius);
    if (radial > limit) {
      const scale = limit / radial;
      grain.x *= scale;
      grain.z *= scale;

      const signY = grain.y === 0 ? Math.sign(grain.vy || 1) : Math.sign(grain.y);
      let nx = grain.x / limit;
      let ny = -config.coneSlope * signY;
      let nz = grain.z / limit;
      const normalLen = Math.hypot(nx, ny, nz) || 1;
      nx /= normalLen;
      ny /= normalLen;
      nz /= normalLen;

      const vn = grain.vx * nx + grain.vy * ny + grain.vz * nz;
      if (vn > 0) {
        grain.vx -= (1 + config.wallBounce) * vn * nx;
        grain.vy -= (1 + config.wallBounce) * vn * ny;
        grain.vz -= (1 + config.wallBounce) * vn * nz;
      }
      grain.vx *= config.wallFriction;
      grain.vy *= config.wallFriction;
      grain.vz *= config.wallFriction;
    }
  }

  function resolveCollisions() {
    const grains = state.grains;
    collisionBuckets.clear();

    for (let i = 0; i < grains.length; i += 1) {
      const grain = grains[i];
      grain.ix = Math.floor((grain.x + config.hashBound) * config.invCellSize);
      grain.iy = Math.floor((grain.y + config.hashBound) * config.invCellSize);
      grain.iz = Math.floor((grain.z + config.hashBound) * config.invCellSize);

      const key = toCellKey(grain.ix, grain.iy, grain.iz);
      let bucket = collisionBuckets.get(key);
      if (!bucket) {
        bucket = [];
        collisionBuckets.set(key, bucket);
      }
      bucket.push(i);
    }

    const minDist = config.grainRadius * 2;
    const minDistSq = minDist * minDist;
    const restitution = 0.12;

    for (let i = 0; i < grains.length; i += 1) {
      const a = grains[i];

      for (let n = 0; n < neighborOffsets.length; n += 1) {
        const off = neighborOffsets[n];
        const key = toCellKey(a.ix + off.dx, a.iy + off.dy, a.iz + off.dz);
        const bucket = collisionBuckets.get(key);
        if (!bucket) {
          continue;
        }

        for (let bIdx = 0; bIdx < bucket.length; bIdx += 1) {
          const j = bucket[bIdx];
          if (j <= i) {
            continue;
          }

          const b = grains[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dz = b.z - a.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq >= minDistSq || distSq <= 1e-8) {
            continue;
          }

          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          const nz = dz / dist;

          a.x -= nx * overlap;
          a.y -= ny * overlap;
          a.z -= nz * overlap;
          b.x += nx * overlap;
          b.y += ny * overlap;
          b.z += nz * overlap;

          const rvx = b.vx - a.vx;
          const rvy = b.vy - a.vy;
          const rvz = b.vz - a.vz;
          const rel = rvx * nx + rvy * ny + rvz * nz;
          if (rel < 0) {
            const impulse = -(1 + restitution) * rel * 0.5;
            a.vx -= impulse * nx;
            a.vy -= impulse * ny;
            a.vz -= impulse * nz;
            b.vx += impulse * nx;
            b.vy += impulse * ny;
            b.vz += impulse * nz;
          }
        }
      }
    }

    for (let i = 0; i < grains.length; i += 1) {
      applyBoundary(grains[i]);
    }
  }

  function updateSimulation(dt) {
    const grains = state.grains;
    const gx = Math.sin(state.angle) * config.gravity;
    const gy = Math.cos(state.angle) * config.gravity;
    const verticalPower = Math.abs(gy) / config.gravity;
    const drag = Math.pow(config.airDrag, dt * 60);

    const flowRate = grains.length * config.flowFactor * verticalPower + 2;
    state.flowBudget = clamp(state.flowBudget + flowRate * dt, 0, grains.length * 0.65);

    for (let i = 0; i < grains.length; i += 1) {
      const grain = grains[i];
      const prevY = grain.y;

      grain.vx += gx * dt;
      grain.vy += gy * dt;
      grain.vx *= drag;
      grain.vy *= drag;
      grain.vz *= drag;

      grain.x += grain.vx * dt;
      grain.y += grain.vy * dt;
      grain.z += grain.vz * dt;
      applyBoundary(grain);

      if (verticalPower > 0.35) {
        const radialSq = grain.x * grain.x + grain.z * grain.z;
        const neckOpen = config.neckRadius - config.grainRadius * 1.3;
        const movingWithFlow = grain.vy * gy > 0;
        const insideNeck = radialSq < neckOpen * neckOpen;

        if (movingWithFlow && insideNeck) {
          const crossed = gy > 0
            ? (prevY < 0 && grain.y >= 0)
            : (prevY > 0 && grain.y <= 0);

          if (crossed && Math.abs(grain.y) < config.neckBand * 1.9) {
            if (state.flowBudget >= 1) {
              state.flowBudget -= 1;
            } else {
              grain.y = gy > 0 ? -config.neckBand : config.neckBand;
              grain.vy *= -0.2;
              grain.vx *= 0.84;
              grain.vz *= 0.84;
            }
          }
        }
      }

      if (verticalPower > 0.58) {
        const floorY = gy > 0
          ? config.halfHeight - config.grainRadius
          : -config.halfHeight + config.grainRadius;
        if (Math.abs(grain.y - floorY) < config.grainRadius * 2.2) {
          grain.vx *= 0.9;
          grain.vy *= 0.58;
          grain.vz *= 0.9;
        }
      }
    }

    if (grains.length <= config.collisionThreshold) {
      resolveCollisions();
    }
  }

  function updateFlip(dt) {
    const delta = state.targetAngle - state.angle;
    state.angleVel += delta * config.flipSpring * dt;
    state.angleVel *= Math.exp(-config.flipDamping * dt);
    state.angle += state.angleVel * dt;

    if (Math.abs(delta) < 0.00025 && Math.abs(state.angleVel) < 0.00025) {
      state.angle = state.targetAngle;
      state.angleVel = 0;
    }
  }

  function projectPoint(x, y, z, sinFlip, cosFlip, out) {
    const wx = x * cosFlip - y * sinFlip;
    const wy = x * sinFlip + y * cosFlip;
    const wz = z;

    const vx = wx * cosYaw + wz * sinYaw;
    const vz0 = -wx * sinYaw + wz * cosYaw;
    const vy = wy * cosPitch - vz0 * sinPitch;
    const vz = wy * sinPitch + vz0 * cosPitch;

    const depth = config.cameraDistance - vz;
    if (depth <= 0.18) {
      return false;
    }

    const scale = view.scale / depth;
    out.x = view.cx + vx * scale;
    out.y = view.cy + vy * scale;
    out.scale = scale;
    out.depth = depth;
    out.vz = vz;
    return true;
  }

  function drawGroundShadow() {
    ctx.save();
    ctx.fillStyle = "rgba(24, 36, 36, 0.20)";
    ctx.beginPath();
    ctx.ellipse(view.cx, view.cy + view.scale * 0.72, view.scale * 0.42, view.scale * 0.09, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawRing(y, ringRadius, segments, sinFlip, cosFlip, strokeStyle, lineWidth) {
    let started = false;
    ctx.beginPath();
    for (let i = 0; i <= segments; i += 1) {
      const theta = (i / segments) * TAU;
      const x = Math.cos(theta) * ringRadius;
      const z = Math.sin(theta) * ringRadius;
      if (!projectPoint(x, y, z, sinFlip, cosFlip, projectTmp)) {
        continue;
      }
      if (!started) {
        ctx.moveTo(projectTmp.x, projectTmp.y);
        started = true;
      } else {
        ctx.lineTo(projectTmp.x, projectTmp.y);
      }
    }
    if (started) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function drawMeridian(phi, sinFlip, cosFlip, strokeStyle, lineWidth) {
    const steps = 28;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    let started = false;

    ctx.beginPath();
    for (let i = 0; i <= steps; i += 1) {
      const y = -config.halfHeight + (i / steps) * (config.halfHeight * 2);
      const r = radiusAt(y);
      const x = c * r;
      const z = s * r;
      if (!projectPoint(x, y, z, sinFlip, cosFlip, projectTmp)) {
        continue;
      }
      if (!started) {
        ctx.moveTo(projectTmp.x, projectTmp.y);
        started = true;
      } else {
        ctx.lineTo(projectTmp.x, projectTmp.y);
      }
    }

    if (started) {
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }

  function drawGlass(sinFlip, cosFlip) {
    const rings = 16;
    for (let i = 0; i <= rings; i += 1) {
      const y = -config.halfHeight + (i / rings) * (config.halfHeight * 2);
      const alpha = 0.12 + (Math.abs(i - rings / 2) / rings) * 0.12;
      const width = i % 4 === 0 ? 1.35 : 0.92;
      drawRing(y, radiusAt(y), 34, sinFlip, cosFlip, `rgba(188, 231, 228, ${alpha})`, width);
    }

    const meridians = 12;
    for (let i = 0; i < meridians; i += 1) {
      const phi = (i / meridians) * TAU;
      const alpha = i % 3 === 0 ? 0.32 : 0.18;
      drawMeridian(phi, sinFlip, cosFlip, `rgba(190, 237, 232, ${alpha})`, i % 3 === 0 ? 1.18 : 0.84);
    }

    drawMeridian(0, sinFlip, cosFlip, "rgba(232, 255, 249, 0.58)", 2.2);
    drawMeridian(Math.PI, sinFlip, cosFlip, "rgba(232, 255, 249, 0.58)", 2.2);
    drawRing(0, config.neckRadius, 34, sinFlip, cosFlip, "rgba(237, 255, 250, 0.55)", 1.8);
  }

  function drawBaseRims(sinFlip, cosFlip) {
    drawRing(config.halfHeight * 1.04, config.bodyRadius * 1.08, 36, sinFlip, cosFlip, "rgba(59, 87, 90, 0.24)", 2.8);
    drawRing(-config.halfHeight * 1.04, config.bodyRadius * 1.08, 36, sinFlip, cosFlip, "rgba(59, 87, 90, 0.24)", 2.8);
  }

  function drawGrains(sinFlip, cosFlip) {
    const grains = state.grains;
    const baseRadius = config.grainRadius * view.scale * 1.85;
    let neckTraffic = 0;

    ctx.beginPath();
    for (let i = 0; i < grains.length; i += 1) {
      const grain = grains[i];
      if (!projectPoint(grain.x, grain.y, grain.z, sinFlip, cosFlip, projectTmp)) {
        continue;
      }
      const r = clamp(baseRadius * projectTmp.scale, 0.58, 2.45);
      ctx.moveTo(projectTmp.x + r, projectTmp.y);
      ctx.arc(projectTmp.x, projectTmp.y, r, 0, TAU);

      if (Math.abs(grain.y) < config.neckBand * 1.3) {
        const radialSq = grain.x * grain.x + grain.z * grain.z;
        if (radialSq < (config.neckRadius * 0.68) * (config.neckRadius * 0.68)) {
          neckTraffic += 1;
        }
      }
    }
    ctx.fillStyle = "rgba(225, 177, 107, 0.90)";
    ctx.fill();

    if (neckTraffic > 7) {
      const topY = -config.neckBand * 1.7;
      const bottomY = config.neckBand * 1.7;
      if (projectPoint(0, topY, 0, sinFlip, cosFlip, projectTmp) &&
          projectPoint(0, bottomY, 0, sinFlip, cosFlip, projectTmpB)) {
        const flowAlpha = clamp(neckTraffic / grains.length * 20, 0.15, 0.52);
        ctx.strokeStyle = `rgba(255, 220, 156, ${flowAlpha.toFixed(3)})`;
        ctx.lineWidth = clamp(view.scale * 0.0032, 1.4, 3.2);
        ctx.beginPath();
        ctx.moveTo(projectTmp.x, projectTmp.y);
        ctx.lineTo(projectTmpB.x, projectTmpB.y);
        ctx.stroke();
      }
    }
  }

  function drawHUD() {
    const gy = Math.cos(state.angle);
    const dir = gy >= 0 ? "上方流向下方" : "下方流向上方";
    const text = `${state.grains.length} 粒 · ${dir}`;

    ctx.save();
    ctx.font = "600 12px 'Avenir Next', 'Trebuchet MS', sans-serif";
    ctx.fillStyle = "rgba(20, 42, 47, 0.68)";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(text, 14, 12);
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, view.width, view.height);

    const sinFlip = Math.sin(state.angle);
    const cosFlip = Math.cos(state.angle);

    drawGroundShadow();
    drawGlass(sinFlip, cosFlip);
    drawBaseRims(sinFlip, cosFlip);
    drawGrains(sinFlip, cosFlip);
    drawHUD();
  }

  function flipHourglass() {
    state.targetAngle += Math.PI;
  }

  function onGestureEnd(endX, endY) {
    const dx = endX - state.startX;
    const dy = endY - state.startY;
    const distSq = dx * dx + dy * dy;
    const now = performance.now();

    if (Math.abs(dy) > 54 || Math.abs(dx) > 118) {
      flipHourglass();
      state.lastTapTime = 0;
      return;
    }

    if (distSq < 256) {
      if (now - state.lastTapTime < 320) {
        flipHourglass();
        state.lastTapTime = 0;
      } else {
        state.lastTapTime = now;
      }
    }
  }

  function bindInputEvents() {
    flipButton.addEventListener("click", flipHourglass);

    grainSlider.addEventListener("input", () => {
      state.targetCount = Number(grainSlider.value);
      grainLabel.textContent = String(state.targetCount);
      setGrainCount(state.targetCount);
    });

    window.addEventListener("keydown", (event) => {
      if (event.code === "Space" || event.key === "f" || event.key === "F") {
        event.preventDefault();
        flipHourglass();
      }
    });

    if ("PointerEvent" in window) {
      canvas.addEventListener("pointerdown", (event) => {
        state.pointerDown = true;
        state.startX = event.clientX;
        state.startY = event.clientY;
        canvas.setPointerCapture(event.pointerId);
      }, { passive: true });

      canvas.addEventListener("pointerup", (event) => {
        if (!state.pointerDown) {
          return;
        }
        state.pointerDown = false;
        onGestureEnd(event.clientX, event.clientY);
      }, { passive: true });

      canvas.addEventListener("pointercancel", () => {
        state.pointerDown = false;
      }, { passive: true });
    } else {
      canvas.addEventListener("touchstart", (event) => {
        if (!event.changedTouches || !event.changedTouches.length) {
          return;
        }
        const t = event.changedTouches[0];
        state.startX = t.clientX;
        state.startY = t.clientY;
        event.preventDefault();
      }, { passive: false });

      canvas.addEventListener("touchend", (event) => {
        if (!event.changedTouches || !event.changedTouches.length) {
          return;
        }
        const t = event.changedTouches[0];
        onGestureEnd(t.clientX, t.clientY);
        event.preventDefault();
      }, { passive: false });
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.2);
    const pxWidth = Math.max(1, Math.round(rect.width * dpr));
    const pxHeight = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
      canvas.width = pxWidth;
      canvas.height = pxHeight;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    view.width = rect.width;
    view.height = rect.height;
    view.cx = rect.width * 0.5;
    view.cy = rect.height * 0.5;
    view.scale = Math.min(rect.width, rect.height) * 0.92;
  }

  function animate(now) {
    const dt = clamp((now - state.lastFrameTime) / 1000, 0.001, 0.032);
    state.lastFrameTime = now;

    updateFlip(dt);
    const subSteps = state.grains.length > 1100 ? 1 : 2;
    const stepDt = dt / subSteps;
    for (let i = 0; i < subSteps; i += 1) {
      updateSimulation(stepDt);
    }
    render();

    requestAnimationFrame(animate);
  }

  bindInputEvents();
  refillGrains(state.targetCount);
  grainLabel.textContent = String(state.targetCount);
  resizeCanvas();

  window.addEventListener("resize", resizeCanvas, { passive: true });
  window.addEventListener("orientationchange", resizeCanvas, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", resizeCanvas, { passive: true });
  }

  requestAnimationFrame(animate);
})();
