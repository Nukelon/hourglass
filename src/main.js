import * as THREE from 'https://unpkg.com/three@0.161.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.161.0/examples/jsm/controls/OrbitControls.js';

const container = document.getElementById('scene');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0f17);
scene.fog = new THREE.Fog(scene.background, 6, 14);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 50);
camera.position.set(2.6, 1.8, 4.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.2, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.3;
controls.maxDistance = 7.2;
controls.maxPolarAngle = Math.PI * 0.9;
renderer.domElement.addEventListener('dblclick', () => controls.reset());

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function addLights() {
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const hemi = new THREE.HemisphereLight(0x6db7ff, 0xffe5c5, 0.55);
  hemi.position.set(0, 2.5, 0);
  scene.add(hemi);

  const key = new THREE.SpotLight(0xffffff, 1.2, 20, Math.PI / 6, 0.35, 1.4);
  key.position.set(5, 6, 3);
  key.target.position.set(0, 0.2, 0);
  scene.add(key, key.target);

  const rim = new THREE.DirectionalLight(0x6db7ff, 0.35);
  rim.position.set(-6, 2, -2);
  scene.add(rim);
}

function createBase() {
  const group = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x1e222d, metalness: 0.15, roughness: 0.32 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0xcbb8ff, metalness: 0.8, roughness: 0.28 });

  const plateGeom = new THREE.CylinderGeometry(1.1, 1.2, 0.16, 48);
  const plateBottom = new THREE.Mesh(plateGeom, woodMat);
  plateBottom.position.y = -1.62;
  plateBottom.castShadow = plateBottom.receiveShadow = true;

  const plateTop = plateBottom.clone();
  plateTop.position.y = 1.62;
  group.add(plateBottom, plateTop);

  const pillarGeom = new THREE.CylinderGeometry(0.04, 0.04, 3.05, 24);
  const offsets = [0.58, -0.58];
  offsets.forEach(x => {
    offsets.forEach(z => {
      const pillar = new THREE.Mesh(pillarGeom, metalMat);
      pillar.position.set(x, 0, z);
      group.add(pillar);
    });
  });

  const ringGeom = new THREE.TorusGeometry(0.78, 0.03, 16, 60);
  const ring1 = new THREE.Mesh(ringGeom, metalMat);
  ring1.rotation.x = Math.PI / 2;
  ring1.position.y = 0.95;
  const ring2 = ring1.clone();
  ring2.position.y = -0.95;
  group.add(ring1, ring2);

  const podiumGeom = new THREE.CylinderGeometry(1.5, 1.8, 0.15, 48);
  const podium = new THREE.Mesh(podiumGeom, new THREE.MeshStandardMaterial({
    color: 0x090b12,
    metalness: 0.25,
    roughness: 0.42,
    emissive: 0x05060a,
  }));
  podium.position.y = -1.8;
  group.add(podium);

  const bloom = new THREE.PointLight(0xffd9a1, 0.6, 12);
  bloom.position.set(0.2, -0.5, 0.8);
  group.add(bloom);

  scene.add(group);
}

function createGlass() {
  const points = [];
  const height = 1.6;
  const neck = 0.08;
  const radius = 0.58;
  for (let i = 0; i <= 32; i++) {
    const t = i / 32;
    const y = t * height;
    const ease = Math.sin(t * Math.PI);
    const r = THREE.MathUtils.lerp(radius, neck, Math.pow(ease, 1.2));
    points.push(new THREE.Vector2(r, y));
  }
  const lathe = new THREE.LatheGeometry(points, 80);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xb9d6ff,
    roughness: 0.05,
    metalness: 0.0,
    transmission: 1,
    thickness: 0.2,
    transparent: true,
    opacity: 0.95,
    ior: 1.3,
    clearcoat: 0.6,
  });

  const top = new THREE.Mesh(lathe, glassMat);
  top.position.y = height * 0.5;
  top.rotation.x = Math.PI;

  const bottom = new THREE.Mesh(lathe, glassMat);
  bottom.position.y = -height * 0.5;

  const group = new THREE.Group();
  group.add(top, bottom);
  group.position.y = 0.8;

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.32, 48),
    new THREE.MeshStandardMaterial({ color: 0x2b2e38, metalness: 0.5, roughness: 0.2 }));
  collar.position.y = 0.05;
  group.add(collar);

  scene.add(group);
}

const particleCount = 5200;
const positions = new Float32Array(particleCount * 3);
const velocities = new Float32Array(particleCount * 3);
const states = new Uint8Array(particleCount); // 0 = falling, 1 = resting top, 2 = settled bottom

const sandGeometry = new THREE.BufferGeometry();
const sandMaterial = new THREE.PointsMaterial({
  color: 0xffc978,
  size: 0.03,
  sizeAttenuation: true,
  transparent: true,
  opacity: 0.92,
  depthWrite: false,
});

const sand = new THREE.Points(sandGeometry, sandMaterial);
sand.position.y = 0.1;
scene.add(sand);

function randomOnDisk(radius) {
  const r = Math.sqrt(Math.random()) * radius;
  const theta = Math.random() * Math.PI * 2;
  return new THREE.Vector2(Math.cos(theta) * r, Math.sin(theta) * r);
}

function topSurface(r, ratio) {
  const maxRadius = 0.55;
  const height = 0.65 * ratio + 0.08;
  const slope = Math.max(0.2, 1 - r / (maxRadius + 0.01));
  return 1.25 + height * slope;
}

function bottomSurface(r, ratio) {
  const maxRadius = 0.55 + ratio * 0.25;
  const height = 0.7 * ratio + 0.08;
  const slope = Math.max(0.12, 1 - r / (maxRadius + 0.01));
  return -1.2 + height * slope;
}

function seedSand() {
  const topRatio = 0.72;
  const topCount = Math.floor(particleCount * topRatio);

  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;
    if (i < topCount) {
      const r = randomOnDisk(0.55);
      positions[idx] = r.x;
      positions[idx + 2] = r.y;
      const radius = Math.sqrt(r.x * r.x + r.y * r.y);
      positions[idx + 1] = topSurface(radius, 1 - i / topCount) + Math.random() * 0.05;
      states[i] = 1;
    } else {
      positions[idx] = (Math.random() - 0.5) * 0.06;
      positions[idx + 2] = (Math.random() - 0.5) * 0.06;
      positions[idx + 1] = 0.05 + Math.random() * 0.05;
      velocities[idx] = (Math.random() - 0.5) * 0.4;
      velocities[idx + 1] = -0.6;
      velocities[idx + 2] = (Math.random() - 0.5) * 0.4;
      states[i] = 0;
    }
  }

  sandGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
}

function updateWaitingTop(idx, ratio, delta) {
  const x = positions[idx];
  const z = positions[idx + 2];
  const r = Math.sqrt(x * x + z * z);
  const target = topSurface(r, ratio);
  positions[idx + 1] = THREE.MathUtils.lerp(positions[idx + 1], target, delta * 2.5);
  positions[idx] *= 1 - delta * 0.08;
  positions[idx + 2] *= 1 - delta * 0.08;
}

function settleBottom(idx, settledRatio) {
  const disc = randomOnDisk(0.55 + settledRatio * 0.3);
  const r = Math.sqrt(disc.x * disc.x + disc.y * disc.y);
  positions[idx] = disc.x;
  positions[idx + 2] = disc.y;
  positions[idx + 1] = bottomSurface(r, settledRatio) + Math.random() * 0.01;
  velocities[idx] = velocities[idx + 1] = velocities[idx + 2] = 0;
  states[idx / 3] = 2;
}

let elapsed = 0;

function updateSand(delta) {
  elapsed += delta;
  let waitingCount = 0;
  let settledCount = 0;
  const emissionTarget = Math.max(4, 12 * delta);
  let emitted = 0;

  for (let i = 0; i < particleCount; i++) {
    const idx = i * 3;
    const state = states[i];

    if (state === 1) {
      waitingCount++;
      updateWaitingTop(idx, waitingCount / particleCount, delta);
      const releaseChance = 0.35 * delta + Math.pow(1 - waitingCount / particleCount, 2) * 0.25 * delta;
      if (emitted < emissionTarget && Math.random() < releaseChance) {
        states[i] = 0;
        positions[idx] = (Math.random() - 0.5) * 0.04;
        positions[idx + 2] = (Math.random() - 0.5) * 0.04;
        positions[idx + 1] = 0.12 + Math.random() * 0.04;
        velocities[idx] = (Math.random() - 0.5) * 0.45;
        velocities[idx + 1] = -0.8 - Math.random() * 0.3;
        velocities[idx + 2] = (Math.random() - 0.5) * 0.45;
        emitted++;
      }
      continue;
    }

    if (state === 2) {
      settledCount++;
      const r = Math.hypot(positions[idx], positions[idx + 2]);
      const target = bottomSurface(r, settledCount / particleCount);
      positions[idx + 1] = THREE.MathUtils.lerp(positions[idx + 1], target, delta * 1.8);
      continue;
    }

    // Falling particles
    const wind = Math.sin(elapsed * 0.8 + positions[idx + 2] * 20) * 0.4;
    velocities[idx] += wind * delta;
    velocities[idx + 1] -= 4.3 * delta;
    velocities[idx + 2] += Math.cos(elapsed * 1.1 + positions[idx] * 18) * 0.35 * delta;

    velocities[idx] *= 1 - 0.45 * delta;
    velocities[idx + 1] *= 1 - 0.05 * delta;
    velocities[idx + 2] *= 1 - 0.45 * delta;

    positions[idx] += velocities[idx] * delta;
    positions[idx + 1] += velocities[idx + 1] * delta;
    positions[idx + 2] += velocities[idx + 2] * delta;

    const radius = Math.hypot(positions[idx], positions[idx + 2]);
    const surface = bottomSurface(radius, settledCount / particleCount);
    if (positions[idx + 1] <= surface) {
      settleBottom(idx, settledCount / particleCount);
      continue;
    }

    // keep inside bell
    const maxR = 0.6 + positions[idx + 1] * 0.1;
    if (radius > maxR) {
      const norm = maxR / radius;
      positions[idx] *= norm;
      positions[idx + 2] *= norm;
      velocities[idx] *= -0.3;
      velocities[idx + 2] *= -0.3;
    }
  }

  sandGeometry.attributes.position.needsUpdate = true;
}

function createFloor() {
  const plane = new THREE.Mesh(
    new THREE.CircleGeometry(6, 80),
    new THREE.MeshStandardMaterial({
      color: 0x0f1321,
      metalness: 0.2,
      roughness: 0.65,
      emissive: 0x05060c,
    })
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -1.82;
  plane.receiveShadow = true;
  scene.add(plane);
}

function init() {
  addLights();
  createBase();
  createGlass();
  createFloor();
  seedSand();
}

init();

let last = performance.now();
function animate() {
  const now = performance.now();
  const delta = Math.min(0.04, (now - last) / 1000);
  last = now;

  controls.update();
  updateSand(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
