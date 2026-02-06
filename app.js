const canvas = document.getElementById("hourglass");
const ctx = canvas.getContext("2d");
const particleRange = document.getElementById("particleRange");
const particleValue = document.getElementById("particleValue");
const flipButton = document.getElementById("flipButton");

const state = {
  width: 0,
  height: 0,
  particles: [],
  targetCount: Number(particleRange.value),
  rotationY: 0,
  rotationX: 0,
  flipProgress: 0,
  flipping: false,
  gravityDir: 1,
  lastTime: 0,
  pointer: {
    active: false,
    lastX: 0,
    lastY: 0,
  },
};

const config = {
  hourglassHeight: 260,
  hourglassRadius: 140,
  neckRadius: 32,
  particleRadius: 2.1,
  gravity: 140,
  damping: 0.72,
  bounce: 0.25,
  cameraDistance: 560,
};

const rand = (min, max) => Math.random() * (max - min) + min;

const resize = () => {
  const { clientWidth, clientHeight } = canvas.parentElement;
  canvas.width = clientWidth * window.devicePixelRatio;
  canvas.height = clientHeight * window.devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  state.width = clientWidth;
  state.height = clientHeight;
};

const getRadiusAt = (y) => {
  const half = config.hourglassHeight / 2;
  const t = Math.min(Math.abs(y) / half, 1);
  return config.neckRadius + (config.hourglassRadius - config.neckRadius) * t;
};

const spawnParticle = (isTop = true) => {
  const half = config.hourglassHeight / 2;
  const y = isTop ? rand(-half, 0) : rand(0, half);
  const radius = getRadiusAt(y) - config.particleRadius * 1.5;
  const angle = rand(0, Math.PI * 2);
  const r = rand(0, radius);
  return {
    x: Math.cos(angle) * r,
    y,
    z: Math.sin(angle) * r,
    vx: rand(-10, 10),
    vy: rand(-4, 4),
    vz: rand(-10, 10),
  };
};

const syncParticleCount = () => {
  const count = state.targetCount;
  particleValue.textContent = `${count} 粒`;
  if (state.particles.length < count) {
    const needed = count - state.particles.length;
    for (let i = 0; i < needed; i += 1) {
      state.particles.push(spawnParticle(state.gravityDir > 0));
    }
  } else if (state.particles.length > count) {
    state.particles.splice(count);
  }
};

const projectPoint = (point) => {
  const cosY = Math.cos(state.rotationY);
  const sinY = Math.sin(state.rotationY);
  const cosX = Math.cos(state.rotationX);
  const sinX = Math.sin(state.rotationX);
  const x1 = point.x * cosY + point.z * sinY;
  const z1 = -point.x * sinY + point.z * cosY;
  const y2 = point.y * cosX - z1 * sinX;
  const z2 = point.y * sinX + z1 * cosX;
  const scale = config.cameraDistance / (config.cameraDistance - z2);
  return {
    x: x1 * scale + state.width / 2,
    y: y2 * scale + state.height / 2,
    z: z2,
    scale,
  };
};

const drawGlass = () => {
  const steps = 60;
  const half = config.hourglassHeight / 2;
  const outline = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const y = -half + t * config.hourglassHeight;
    const radius = getRadiusAt(y);
    outline.push({ x: radius, y, z: 0 });
  }
  const mirrored = outline.map((p) => ({ x: -p.x, y: p.y, z: 0 })).reverse();
  const shape = outline.concat(mirrored);

  ctx.beginPath();
  shape.forEach((point, index) => {
    const projected = projectPoint(point);
    if (index === 0) {
      ctx.moveTo(projected.x, projected.y);
    } else {
      ctx.lineTo(projected.x, projected.y);
    }
  });
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, state.height * 0.1, 0, state.height * 0.9);
  gradient.addColorStop(0, "rgba(255, 255, 255, 0.12)");
  gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.02)");
  gradient.addColorStop(1, "rgba(255, 255, 255, 0.12)");
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
};

const updatePhysics = (dt) => {
  const half = config.hourglassHeight / 2;
  const gravity = config.gravity * state.gravityDir;
  state.particles.forEach((p) => {
    p.vy += gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;

    const radius = getRadiusAt(p.y) - config.particleRadius;
    const distance = Math.hypot(p.x, p.z);
    if (distance > radius) {
      const nx = p.x / distance;
      const nz = p.z / distance;
      const overlap = distance - radius;
      p.x -= nx * overlap;
      p.z -= nz * overlap;
      const dot = p.vx * nx + p.vz * nz;
      p.vx -= (1 + config.bounce) * dot * nx;
      p.vz -= (1 + config.bounce) * dot * nz;
      p.vx *= config.damping;
      p.vz *= config.damping;
    }

    if (p.y > half - config.particleRadius) {
      p.y = half - config.particleRadius;
      p.vy *= -config.bounce;
      p.vx *= config.damping;
      p.vz *= config.damping;
    }
    if (p.y < -half + config.particleRadius) {
      p.y = -half + config.particleRadius;
      p.vy *= -config.bounce;
      p.vx *= config.damping;
      p.vz *= config.damping;
    }
  });
};

const drawParticles = () => {
  const projected = state.particles.map((p) => ({ ...projectPoint(p), p }));
  projected.sort((a, b) => a.z - b.z);
  projected.forEach((item) => {
    const radius = config.particleRadius * item.scale;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 200, 120, ${0.6 + item.scale * 0.3})`;
    ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
};

const drawScene = () => {
  ctx.clearRect(0, 0, state.width, state.height);
  const glow = ctx.createRadialGradient(
    state.width / 2,
    state.height / 2,
    10,
    state.width / 2,
    state.height / 2,
    state.width * 0.7
  );
  glow.addColorStop(0, "rgba(255, 179, 71, 0.15)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, state.width, state.height);
  drawGlass();
  drawParticles();
};

const animate = (timestamp) => {
  const dt = state.lastTime ? Math.min((timestamp - state.lastTime) / 1000, 0.02) : 0.016;
  state.lastTime = timestamp;

  if (state.flipping) {
    state.flipProgress = Math.min(state.flipProgress + dt * 1.6, 1);
    const ease = 0.5 - 0.5 * Math.cos(Math.PI * state.flipProgress);
    state.rotationX = ease * Math.PI;
    if (state.flipProgress >= 1) {
      state.flipping = false;
      state.flipProgress = 0;
      state.rotationX = 0;
      state.gravityDir *= -1;
    }
  }

  updatePhysics(dt);
  drawScene();
  requestAnimationFrame(animate);
};

const flipHourglass = () => {
  if (state.flipping) return;
  state.flipping = true;
  state.flipProgress = 0;
};

const updateRotation = (dx, dy) => {
  state.rotationY += dx * 0.004;
  state.rotationX += dy * 0.004;
  state.rotationX = Math.max(Math.min(state.rotationX, Math.PI / 3), -Math.PI / 3);
};

const attachPointer = () => {
  const handleDown = (event) => {
    state.pointer.active = true;
    state.pointer.lastX = event.clientX;
    state.pointer.lastY = event.clientY;
  };
  const handleMove = (event) => {
    if (!state.pointer.active) return;
    const dx = event.clientX - state.pointer.lastX;
    const dy = event.clientY - state.pointer.lastY;
    updateRotation(dx, dy);
    state.pointer.lastX = event.clientX;
    state.pointer.lastY = event.clientY;
  };
  const handleUp = () => {
    state.pointer.active = false;
  };

  canvas.addEventListener("pointerdown", handleDown);
  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  canvas.addEventListener("click", flipHourglass);

  canvas.addEventListener("touchstart", (event) => {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      handleDown({ clientX: touch.clientX, clientY: touch.clientY });
    }
  });
  canvas.addEventListener("touchmove", (event) => {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      handleMove({ clientX: touch.clientX, clientY: touch.clientY });
    }
  });
  canvas.addEventListener("touchend", handleUp);
};

const start = () => {
  resize();
  state.particles = [];
  syncParticleCount();
  attachPointer();
  requestAnimationFrame(animate);
};

particleRange.addEventListener("input", (event) => {
  state.targetCount = Number(event.target.value);
  syncParticleCount();
});

flipButton.addEventListener("click", flipHourglass);

window.addEventListener("resize", () => {
  resize();
});

start();
