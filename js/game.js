import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { applyDarkMode } from "./darkmode.js";
import { applyLightMode } from "./lightmode.js";

const root = document.getElementById("game-root");
const $ = (id) => document.getElementById(id);

const ui = {
  hud: $("hud"),
  start: $("start-screen"),
  pause: $("pause-screen"),
  upgrade: $("upgrade-screen"),
  end: $("end-screen"),
  play: $("play-button"),
  resume: $("resume-button"),
  pauseRestart: $("pause-restart-button"),
  restart: $("restart-button"),
  score: $("score"),
  enemies: $("enemies-left"),
  timer: $("timer"),
  wave: $("wave-number"),
  healthFill: $("health-fill"),
  healthText: $("health-text"),
  ammo: $("ammo"),
  minimap: $("minimap"),
  message: $("message"),
  modeBadge: $("mode-badge"),
  modeToggle: $("mode-toggle"),
  muteToggle: $("mute-toggle"),
  loading: $("loading-note"),
  endEyebrow: $("end-eyebrow"),
  endTitle: $("end-title"),
  endSummary: $("end-summary"),
  upgradeTitle: $("upgrade-title"),
  upgradeSubtitle: $("upgrade-subtitle"),
  upgradeCards: $("upgrade-cards"),
  bossHud: $("boss-hud"),
  bossName: $("boss-name"),
  bossHealthText: $("boss-health-text"),
  bossHealthFill: $("boss-health-fill"),
};

const TILE = 4;
const WALL_HEIGHT = 3.8;
const PLAYER_RADIUS = 0.48;
const BASE_MAGAZINE = 30;
const BASE_RELOAD_MS = 1150;
const BASE_FIRE_DELAY = 1000 / 6;
const BASE_WEAPON_DAMAGE = 10;
const BASE_PLAYER_SPEED = 5.1;

const maze = [
  "#################",
  "#P....#.........#",
  "#.##..#.###.###.#",
  "#....##...#...#.#",
  "###.####..#.#.#.#",
  "#...#.....#.#...#",
  "#.#.#.#####.###.#",
  "#.#...#...#.....#",
  "#.###.#.#.#####.#",
  "#.....#.#.....#.#",
  "#.#####.###.#.#.#",
  "#.....#.....#...#",
  "#.###.#####.###.#",
  "#...#.....#.....#",
  "#.#.###.#.#.###.#",
  "#E....E...E....E#",
  "#################",
];

let scene, camera, renderer, controls, clock, raycaster;
let wallMaterial, floorMaterial;
let ambientLight, keyLight, flashlight, gun, muzzleFlash;

let enemyMaterials = [];
let enemies = [];
let wallMeshes = [];
let enemyMeshes = [];
let effectObjects = [];
let projectiles = [];

let audio = {};
let mode = "dark";
let running = false;
let paused = false;
let ended = false;
let muted = false;
let menuTransition = false;

let score = 0;
let health = 100;
let maxHealth = 100;
let ammo = BASE_MAGAZINE;
let magazineSize = BASE_MAGAZINE;

let reloading = false;
let reloadUntil = 0;
let reloadDuration = BASE_RELOAD_MS;
let fireDelay = BASE_FIRE_DELAY;
let damageMultiplier = 1;
let damageBonus = 0;

let playerSpeed = BASE_PLAYER_SPEED;
let scoreMultiplier = 1;
let armorPiercing = 0;
let armorReduction = 0;

let shotCount = 1;
let explosiveRadius = 0;
let executionBonus = 0;
let bossDamageBonus = 0;
let mouseHeld = false;

let regeneration = 0;
let shield = 0;
let lifesteal = 0;
let wave = 1;
let elapsed = 0;
let lastShot = 0;
let lastDamage = 0;

let messageUntil = 0;
let audioStarted = false;
let waveTransitioning = false;
let bossDefeated = false;
let boss = null;

let playerStart = new THREE.Vector3(4, 1.65, 4);
let lastPlayerCell = "";
let pathCache = new Map();
let regenClock = 0;

const keys = { w: false, a: false, s: false, d: false };
const movement = new THREE.Vector3();
const direction = new THREE.Vector3();
const rightVector = new THREE.Vector3();

const mapContext = ui.minimap.getContext("2d");
const textureLoader = new THREE.TextureLoader();

const powerUps = [
  {
    id: "projectile",
    name: "+1 Projectile",
    description: "Add one projectile per shot, up to 5 total. Every projectile deals full damage.",
    rarity: "Common",
    category: "offense",
    apply: () => {
      shotCount = Math.min(5, shotCount + 1);
    },
  },
  {
    id: "magazine",
    name: "+10 Magazine Capacity",
    description: "Add 10 bullets to your magazine and refill it.",
    rarity: "Common",
    category: "offense",
    apply: () => {
      magazineSize += 10;
      ammo = magazineSize;
    },
  },
  {
    id: "damage",
    name: "Heavy Hitter",
    description: "Increase each projectile's damage by 5 points.",
    rarity: "Rare",
    category: "offense",
    apply: () => {
      damageBonus += 5;
    },
  },
  {
    id: "piercing",
    name: "Piercing Shot",
    description: "Each projectile can damage up to 3 enemies in a straight line, but walls still block shots.",
    rarity: "Rare",
    category: "offense",
    apply: () => {
      armorPiercing = Math.min(2, armorPiercing + 1);
    },
  },
  {
    id: "explosive",
    name: "Explosive Shot",
    description: "Direct hits deal 10 splash damage to other enemies within 3 metres.",
    rarity: "Epic",
    category: "offense",
    apply: () => {
      explosiveRadius = Math.max(explosiveRadius, 3);
    },
  },
  {
    id: "reload",
    name: "Fast Reload",
    description: "Reload your weapon 400 milliseconds faster.",
    rarity: "Common",
    category: "offense",
    apply: () => {
      reloadDuration = Math.max(450, reloadDuration - 400);
    },
  },
  {
    id: "health",
    name: "+30 Health",
    description: "Increase maximum health by 30 and restore 30 health immediately.",
    rarity: "Common",
    category: "defense",
    apply: () => {
      maxHealth += 30;
      health = Math.min(maxHealth, health + 30);
    },
  },
  {
    id: "armor",
    name: "Reinforced Armor",
    description: "Reduce every enemy hit by 3 damage, to a maximum reduction of 9.",
    rarity: "Rare",
    category: "defense",
    apply: () => {
      armorReduction = Math.min(9, armorReduction + 3);
    },
  },
  {
    id: "lifesteal",
    name: "Alien Siphon",
    description: "Restore 5 health whenever you eliminate an enemy.",
    rarity: "Rare",
    category: "utility",
    apply: () => {
      lifesteal = Math.min(20, lifesteal + 5);
    },
  },
];

function loadTexture(path, repeatX = 1, repeatY = 1) {
  return new Promise((resolve) => {
    textureLoader.load(
      path,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeatX, repeatY);
        resolve(texture);
      },
      undefined,
      () => resolve(null),
    );
  });
}

function createMaterial(texture, fallback, roughness = 0.9) {
  return new THREE.MeshStandardMaterial({
    map: texture || null,
    color: texture ? 0xffffff : fallback,
    roughness,
  });
}

async function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050a12);
  scene.fog = new THREE.Fog(0x050a12, 8, 32);

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 120);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "high-performance",
  });

  renderer.domElement.id = "world";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  root.prepend(renderer.domElement);

  controls = new PointerLockControls(camera, renderer.domElement);
  clock = new THREE.Clock();
  raycaster = new THREE.Raycaster();
  raycaster.far = 55;

  const [wallTexture, floorTexture, gunTexture, alienTexture] = await Promise.all([
    loadTexture("assets/images/walltexture.jpg"),
    loadTexture("assets/images/floortexture.jpg"),
    loadTexture("assets/images/guntexture.jpg"),
    loadTexture("assets/images/alientexture.jpg"),
  ]);

  wallMaterial = createMaterial(wallTexture, 0x45515c);
  floorMaterial = createMaterial(floorTexture, 0x39434b);

  const alienMaterial = createMaterial(alienTexture, 0x55d6a3, 0.65);
  alienMaterial.emissive = new THREE.Color(0x0b2419);
  enemyMaterials = [alienMaterial];

  ambientLight = new THREE.HemisphereLight(0xc8e5ff, 0x17202b, 0.22);
  scene.add(ambientLight);

  keyLight = new THREE.DirectionalLight(0xd3e9ff, 0.28);
  keyLight.position.set(-10, 18, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  scene.add(keyLight);

  flashlight = new THREE.SpotLight(0xe4f7ff, 3.3, 27, Math.PI / 5, 0.45, 1.2);

  flashlight.position.set(0, 0, 0);
  flashlight.target.position.set(0, 0, -1);
  camera.add(flashlight);
  camera.add(flashlight.target);
  scene.add(camera);

  buildWorld();
  buildGun(gunTexture);
  setupAudio();
  setMode("dark");
  resetGame(true);
  bindEvents();

  ui.loading.textContent = "Ready — click Enter the Maze";
  animate();
}

function buildWorld() {
  const width = maze[0].length * TILE;
  const depth = maze.length * TILE;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMaterial);

  floor.rotation.x = -Math.PI / 2;
  floor.position.set(width / 2 - TILE / 2, 0, depth / 2 - TILE / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({
      color: 0x1b2730,
      side: THREE.BackSide,
      roughness: 1,
    }),
  );

  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(width / 2 - TILE / 2, WALL_HEIGHT, depth / 2 - TILE / 2);
  scene.add(ceiling);

  const geometry = new THREE.BoxGeometry(TILE, WALL_HEIGHT, TILE);

  for (let r = 0; r < maze.length; r++) {
    for (let c = 0; c < maze[r].length; c++) {
      const char = maze[r][c];
      const x = c * TILE;
      const z = r * TILE;

      if (char === "#") {
        const wall = new THREE.Mesh(geometry, wallMaterial);
        wall.position.set(x, WALL_HEIGHT / 2, z);
        wall.userData.isWall = true;
        wall.castShadow = true;
        wall.receiveShadow = true;
        scene.add(wall);
        wallMeshes.push(wall);
      } else if (char === "P") {
        playerStart.set(x, 1.65, z);
      }
    }
  }
}

function buildGun(texture) {
  gun = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    map: texture || null,
    color: texture ? 0xffffff : 0x3b5965,
    metalness: 0.65,
    roughness: 0.35,
  });

  const dark = new THREE.MeshStandardMaterial({
    color: 0x18232b,
    metalness: 0.6,
    roughness: 0.35,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.62), bodyMat);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.36, 12), dark);

  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.43);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, 0.17), dark);

  grip.position.set(0, -0.15, 0.12);
  gun.add(body, barrel, grip);
  gun.position.set(0.34, -0.28, -0.62);
  camera.add(gun);

  muzzleFlash = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    new THREE.MeshBasicMaterial({
      color: 0x72f5c3,
      transparent: true,
      opacity: 0.9,
    }),
  );

  muzzleFlash.position.set(0, 0.02, -0.67);
  muzzleFlash.visible = false;
  gun.add(muzzleFlash);
}

function setupAudio() {
  audio.music = new Audio("assets/sound/backgroundmusic.mp3");
  audio.music.loop = true;
  audio.music.volume = 0.22;

  audio.run = new Audio("assets/sound/running.mp3");
  audio.run.loop = true;
  audio.run.volume = 0.38;

  audio.laser = new Audio("assets/sound/lasergun.mp3");
  audio.laser.volume = 0.55;

  for (const item of Object.values(audio)) {
    item.addEventListener("error", () => {});
  }
}

function startAudio() {
  if (muted || audioStarted) return;

  audioStarted = true;

  audio.music.play().catch(() => {
    audioStarted = false;
  });
}

function setMode(nextMode) {
  mode = nextMode;

  const config = {
    scene,
    ambientLight,
    keyLight,
    flashlight,
    wallMaterial,
    floorMaterial,
    enemyMaterials,
  };

  if (mode === "dark") {
    applyDarkMode(config);
    ui.modeBadge.textContent = "DARK MODE";
    ui.modeToggle.textContent = "Switch to Light";
  } else {
    applyLightMode(config);
    ui.modeBadge.textContent = "LIGHT MODE";
    ui.modeToggle.textContent = "Switch to Dark";
  }

  drawMinimap();
}

function cellFromPosition(x, z) {
  return {
    c: Math.round(x / TILE),
    r: Math.round(z / TILE),
  };
}

function cellKey(c, r) {
  return `${c},${r}`;
}

function isWalkableCell(c, r) {
  return r >= 0 && c >= 0 && r < maze.length && c < maze[0].length && maze[r][c] !== "#";
}

function findPath(start, goal) {
  const startKey = cellKey(start.c, start.r);
  const goalKey = cellKey(goal.c, goal.r);

  if (startKey === goalKey) return [];

  const cacheKey = `${startKey}>${goalKey}`;

  if (pathCache.has(cacheKey)) {
    return pathCache.get(cacheKey);
  }

  const queue = [{ c: start.c, r: start.r }];
  const previous = new Map([[startKey, null]]);
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  let found = false;

  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    const key = cellKey(current.c, current.r);

    if (key === goalKey) {
      found = true;
      break;
    }

    for (const [dc, dr] of steps) {
      const c = current.c + dc;
      const r = current.r + dr;
      const nextKey = cellKey(c, r);

      if (!isWalkableCell(c, r) || previous.has(nextKey)) continue;

      previous.set(nextKey, key);
      queue.push({ c, r });
    }
  }

  let path = [];

  if (found) {
    let cursor = goalKey;

    while (cursor && cursor !== startKey) {
      const [c, r] = cursor.split(",").map(Number);
      path.unshift({ c, r });
      cursor = previous.get(cursor);
    }
  }

  if (pathCache.size > 500) pathCache.clear();

  pathCache.set(cacheKey, path);
  return path;
}

function getSpawnCells() {
  const playerCell = cellFromPosition(camera.position.x, camera.position.z);

  const cells = [];

  for (let r = 1; r < maze.length - 1; r++) {
    for (let c = 1; c < maze[r].length - 1; c++) {
      if (!isWalkableCell(c, r) || maze[r][c] === "P") continue;

      const distance = Math.hypot((c - playerCell.c) * TILE, (r - playerCell.r) * TILE);

      if (distance >= 7) {
        cells.push({ c, r });
      }
    }
  }

  return cells;
}

function createEnemy(isBoss = false, spawnCell = null, level = wave) {
  const group = new THREE.Group();

  const bodyMaterial = isBoss
    ? new THREE.MeshStandardMaterial({
        color: 0x752b9b,
        emissive: 0x3b0b52,
        emissiveIntensity: 0.85,
        roughness: 0.4,
      })
    : enemyMaterials[0];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(isBoss ? 2.1 : 1.05, isBoss ? 2.7 : 1.5, isBoss ? 1.65 : 0.72),
    bodyMaterial,
  );

  body.position.y = isBoss ? 1.35 : 0.78;
  body.castShadow = true;

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(isBoss ? 1.4 : 0.72, isBoss ? 1 : 0.55, isBoss ? 1.2 : 0.65),
    bodyMaterial,
  );

  head.position.y = isBoss ? 2.75 : 1.72;
  head.castShadow = true;

  const eyeMaterial = new THREE.MeshStandardMaterial({
    color: isBoss ? 0xffe2f5 : 0xeafff7,
    emissive: isBoss ? 0xff145c : 0x50ffbf,
    emissiveIntensity: isBoss ? 3 : 1.6,
  });

  const eyes = new THREE.Mesh(new THREE.BoxGeometry(isBoss ? 0.8 : 0.4, isBoss ? 0.18 : 0.1, 0.1), eyeMaterial);

  eyes.position.set(0, isBoss ? 2.85 : 1.78, isBoss ? -0.64 : -0.34);

  group.add(body, head, eyes);

  if (isBoss) {
    const hornGeometry = new THREE.ConeGeometry(0.22, 0.75, 6);

    for (const side of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeometry, bodyMaterial);
      horn.position.set(side * 0.65, 3.35, 0);
      horn.rotation.z = side * -0.35;
      group.add(horn);
    }

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.25, 0.09, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xff477e }),
    );

    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.2;
    group.add(ring);
  }

  const cell = spawnCell || { c: 1, r: 1 };

  group.position.set(cell.c * TILE, 0, cell.r * TILE);
  scene.add(group);

  const enemy = {
    group,
    meshes: [...group.children],
    headMesh: head,
    isBoss,
    health: isBoss ? 1000 : 30 + Math.floor((level - 1) / 2) * 10,
    maxHealth: isBoss ? 1000 : 30 + Math.floor((level - 1) / 2) * 10,
    speed: isBoss ? 2.6 : 2.5 + Math.min(level * 0.12, 0.65),
    damage: isBoss ? 24 : 8 + level,
    attackAt: 0,
    nextRangedAt: performance.now() + 2400,
    nextChargeAt: performance.now() + 6000,
    path: [],
    pathIndex: 0,
    repathAt: 0,
    stuckSince: performance.now(),
    lastPosition: group.position.clone(),
    chargeUntil: 0,
  };

  for (const mesh of enemy.meshes) {
    mesh.userData.enemyRef = enemy;
  }

  enemies.push(enemy);
  enemyMeshes.push(...enemy.meshes);

  if (isBoss) boss = enemy;

  return enemy;
}

function clearEnemies() {
  for (const enemy of enemies) {
    scene.remove(enemy.group);
  }

  enemies = [];
  enemyMeshes = [];
  boss = null;
  pathCache.clear();
}

function spawnWave() {
  clearEnemies();

  waveTransitioning = false;
  bossDefeated = false;
  ui.wave.textContent = `${wave} / 5`;
  ui.bossHud.classList.add("hidden");

  const count = [0, 8, 12, 16, 20, 8][wave];
  const cells = getSpawnCells();

  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  const occupied = [];

  for (let i = 0; i < count; i++) {
    let chosen = cells.find((cell) => !occupied.some((other) => Math.hypot(cell.c - other.c, cell.r - other.r) < 1.1));

    if (!chosen) chosen = cells[i % cells.length];

    occupied.push(chosen);
    createEnemy(false, chosen, wave);
  }

  if (wave === 5) {
    const bossCell =
      cells.find((cell) => !occupied.some((other) => cell.c === other.c && cell.r === other.r)) || cells[0];

    createEnemy(true, bossCell, wave);

    ui.bossName.textContent = "THE OVERMIND";
    ui.bossHud.classList.remove("hidden");
    showMessage("FINAL WAVE — THE OVERMIND HAS ARRIVED");
  } else {
    showMessage(`WAVE ${wave} — THEY KNOW WHERE YOU ARE`);
  }

  updateHud();
}

function resetUpgrades() {
  maxHealth = 100;
  health = 100;
  magazineSize = BASE_MAGAZINE;
  ammo = magazineSize;

  reloadDuration = BASE_RELOAD_MS;
  fireDelay = BASE_FIRE_DELAY;
  damageMultiplier = 1;
  damageBonus = 0;

  playerSpeed = BASE_PLAYER_SPEED;
  scoreMultiplier = 1;
  armorPiercing = 0;
  armorReduction = 0;

  regeneration = 0;
  shield = 0;
  lifesteal = 0;
  regenClock = 0;

  shotCount = 1;
  explosiveRadius = 0;
  executionBonus = 0;
  bossDamageBonus = 0;

  mouseHeld = false;
}

function resetGame(showMenu = true) {
  score = 0;
  wave = 1;
  elapsed = 0;
  lastShot = 0;
  lastDamage = 0;
  ended = false;
  paused = false;
  mouseHeld = false;

  running = false;
  reloading = false;
  reloadUntil = 0;
  waveTransitioning = false;
  bossDefeated = false;

  resetUpgrades();

  controls.unlock();

  camera.position.copy(playerStart);
  camera.rotation.set(0, 0, 0);
  gun.visible = true;

  for (const obj of effectObjects) {
    scene.remove(obj);
  }

  effectObjects = [];

  for (const projectile of projectiles) {
    scene.remove(projectile.mesh);
  }

  projectiles = [];

  clearEnemies();
  spawnWave();

  ui.end.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.upgrade.classList.add("hidden");

  ui.hud.classList.toggle("hidden", showMenu);
  ui.start.classList.toggle("hidden", !showMenu);

  if (showMenu) {
    ui.loading.classList.add("hidden");
  }

  updateHud();
  drawMinimap();
}

function bindEvents() {
  ui.play.addEventListener("click", () => {
    ui.start.classList.add("hidden");
    ui.hud.classList.remove("hidden");
    startAudio();
    controls.lock();
  });

  ui.resume.addEventListener("click", () => controls.lock());
  ui.pauseRestart.addEventListener("click", () => resetGame(true));
  ui.restart.addEventListener("click", () => resetGame(true));

  ui.modeToggle.addEventListener("click", () => {
    setMode(mode === "dark" ? "light" : "dark");
  });

  ui.muteToggle.addEventListener("click", () => {
    muted = !muted;

    for (const item of Object.values(audio)) {
      item.muted = muted;
    }

    ui.muteToggle.textContent = muted ? "Unmute Audio" : "Mute Audio";

    if (!muted && running) {
      startAudio();
    }
  });

  controls.addEventListener("lock", () => {
    if (ended || waveTransitioning) {
      controls.unlock();
      return;
    }

    running = true;
    paused = false;
    menuTransition = false;

    ui.start.classList.add("hidden");
    ui.pause.classList.add("hidden");
    ui.hud.classList.remove("hidden");

    startAudio();
  });

  controls.addEventListener("unlock", () => {
    mouseHeld = false;

    if (ended || waveTransitioning || menuTransition) return;

    if (running) {
      running = false;
      paused = true;
      ui.pause.classList.remove("hidden");

      if (audio.run) {
        audio.run.pause();
      }
    }
  });

  window.addEventListener("keydown", (event) => {
    const key = event.key.toLowerCase();

    if (key === "l" && !event.repeat && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const target = event.target;

      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));

      if (!isTyping) {
        setMode(mode === "dark" ? "light" : "dark");
        return;
      }
    }

    if (key in keys && running && !waveTransitioning) {
      keys[key] = true;
    }

    if (key === "r" && running && !waveTransitioning) {
      reload();
    }
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.toLowerCase();

    if (key in keys) {
      keys[key] = false;
    }
  });

  window.addEventListener("blur", () => {
    for (const key of Object.keys(keys)) {
      keys[key] = false;
    }

    mouseHeld = false;

    if (controls.isLocked) {
      controls.unlock();
    }
  });

  renderer.domElement.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;

    if (running && controls.isLocked && !waveTransitioning && !ended) {
      mouseHeld = true;
      shoot();
    }
  });

  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) {
      mouseHeld = false;
    }
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function isWallAt(x, z, radius = PLAYER_RADIUS) {
  const colMin = Math.floor((x - radius + TILE / 2) / TILE);
  const colMax = Math.floor((x + radius + TILE / 2) / TILE);
  const rowMin = Math.floor((z - radius + TILE / 2) / TILE);
  const rowMax = Math.floor((z + radius + TILE / 2) / TILE);

  for (let r = rowMin; r <= rowMax; r++) {
    for (let c = colMin; c <= colMax; c++) {
      if (r < 0 || c < 0 || r >= maze.length || c >= maze[0].length || maze[r][c] === "#") {
        const cx = c * TILE;
        const cz = r * TILE;

        const nearestX = THREE.MathUtils.clamp(x, cx - TILE / 2, cx + TILE / 2);

        const nearestZ = THREE.MathUtils.clamp(z, cz - TILE / 2, cz + TILE / 2);

        if ((x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2) {
          return true;
        }
      }
    }
  }

  return false;
}

function movePlayer(dt) {
  movement.set(0, 0, 0);

  if (keys.w) movement.z -= 1;
  if (keys.s) movement.z += 1;
  if (keys.a) movement.x -= 1;
  if (keys.d) movement.x += 1;

  const moving = movement.lengthSq() > 0;

  if (moving) {
    movement.normalize();

    direction.set(0, 0, -1);
    direction.applyQuaternion(camera.quaternion);
    direction.y = 0;
    direction.normalize();

    rightVector.crossVectors(direction, new THREE.Vector3(0, 1, 0)).normalize();

    const dx = (direction.x * -movement.z + rightVector.x * movement.x) * playerSpeed * dt;

    const dz = (direction.z * -movement.z + rightVector.z * movement.x) * playerSpeed * dt;

    if (!isWallAt(camera.position.x + dx, camera.position.z)) {
      camera.position.x += dx;
    }

    if (!isWallAt(camera.position.x, camera.position.z + dz)) {
      camera.position.z += dz;
    }
  }

  if (moving && running && !muted && audio.run.paused) {
    audio.run.play().catch(() => {});
  }

  if ((!moving || !running || muted) && !audio.run.paused) {
    audio.run.pause();
  }

  gun.position.y = -0.28 + (moving ? Math.sin(performance.now() * 0.012) * 0.018 : 0);
}

function canEnemyMove(x, z, radius = 0.45) {
  return !isWallAt(x, z, radius);
}

function updateEnemies(dt, now) {
  const playerCell = cellFromPosition(camera.position.x, camera.position.z);

  const playerKey = cellKey(playerCell.c, playerCell.r);

  if (playerKey !== lastPlayerCell) {
    pathCache.clear();
    lastPlayerCell = playerKey;
  }

  for (const enemy of [...enemies]) {
    const group = enemy.group;

    const dx = camera.position.x - group.position.x;
    const dz = camera.position.z - group.position.z;
    const distance = Math.hypot(dx, dz);

    if (now >= enemy.repathAt || enemy.pathIndex >= enemy.path.length) {
      const start = cellFromPosition(group.position.x, group.position.z);

      enemy.path = findPath(start, playerCell);
      enemy.pathIndex = 0;
      enemy.repathAt = now + (enemy.isBoss ? 250 : 350);
    }

    if (distance > (enemy.isBoss ? 2.4 : 1.25) && enemy.path.length) {
      const targetCell = enemy.path[Math.min(enemy.pathIndex, enemy.path.length - 1)];

      const tx = targetCell.c * TILE;
      const tz = targetCell.r * TILE;

      const vx = tx - group.position.x;
      const vz = tz - group.position.z;
      const length = Math.hypot(vx, vz);

      if (length < 0.35) {
        enemy.pathIndex++;
      } else {
        const speed = enemy.speed * (enemy.chargeUntil > now ? 2.1 : 1);

        const nx = group.position.x + (vx / length) * speed * dt;
        const nz = group.position.z + (vz / length) * speed * dt;

        if (canEnemyMove(nx, group.position.z, enemy.isBoss ? 0.72 : 0.42)) {
          group.position.x = nx;
        }

        if (canEnemyMove(group.position.x, nz, enemy.isBoss ? 0.72 : 0.42)) {
          group.position.z = nz;
        }
      }
    }

    if (distance < 2.6) {
      if (now >= enemy.attackAt) {
        damagePlayer(enemy.damage);
        enemy.attackAt = now + (enemy.isBoss ? 1500 : 850);

        if (enemy.isBoss) {
          showMessage("OVERMIND SLAM!");
        }
      }
    } else if (enemy.isBoss && now >= enemy.nextRangedAt) {
      spawnProjectile(enemy);
      enemy.nextRangedAt = now + 2600;
      showMessage("BOSS RANGED ATTACK — KEEP MOVING");
    }

    if (enemy.isBoss && now >= enemy.nextChargeAt && distance > 4) {
      enemy.chargeUntil = now + 800;
      enemy.nextChargeAt = now + 6500;
      showMessage("OVERMIND CHARGE!");
    }

    if (distance > 0.1) {
      group.rotation.y = Math.atan2(dx, dz);
    }

    if (group.position.distanceTo(enemy.lastPosition) < 0.02) {
      if (now - enemy.stuckSince > 900) {
        enemy.path = [];
        enemy.pathIndex = 0;
        enemy.repathAt = 0;
        enemy.stuckSince = now;
      }
    } else {
      enemy.lastPosition.copy(group.position);
      enemy.stuckSince = now;
    }
  }

  separateEnemies();
  updateProjectiles(dt);

  if (regeneration > 0 && running && !waveTransitioning) {
    regenClock += dt;

    if (regenClock >= 1) {
      const ticks = Math.floor(regenClock);
      regenClock -= ticks;
      health = Math.min(maxHealth, health + regeneration * ticks);
      updateHud();
    }
  }

  if (wave === 5 && boss && !enemies.includes(boss)) {
    winGame();
  }

  if (enemies.length === 0 && !waveTransitioning && !ended) {
    clearWave();
  }
}

function separateEnemies() {
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i];
      const b = enemies[j];

      const dx = a.group.position.x - b.group.position.x;
      const dz = a.group.position.z - b.group.position.z;
      const distance = Math.hypot(dx, dz);
      const minDistance = a.isBoss || b.isBoss ? 1.7 : 0.9;

      if (distance > 0.001 && distance < minDistance) {
        const push = (minDistance - distance) * 0.16;

        const ax = a.group.position.x + (dx / distance) * push;
        const az = a.group.position.z + (dz / distance) * push;
        const bx = b.group.position.x - (dx / distance) * push;
        const bz = b.group.position.z - (dz / distance) * push;

        if (canEnemyMove(ax, az, a.isBoss ? 0.72 : 0.42)) {
          a.group.position.set(ax, 0, az);
        }

        if (canEnemyMove(bx, bz, b.isBoss ? 0.72 : 0.42)) {
          b.group.position.set(bx, 0, bz);
        }
      }
    }
  }
}

function damagePlayer(amount) {
  if (ended || waveTransitioning) return;

  let incoming = Math.max(1, amount - armorReduction);

  if (shield > 0) {
    const absorbed = Math.min(shield, incoming);
    shield -= absorbed;
    incoming -= absorbed;
  }

  if (incoming > 0) {
    health = Math.max(0, health - incoming);
  }

  lastDamage = performance.now();
  updateHud();

  if (health <= 0) {
    finishGame(false);
  }
}

function spawnProjectile(enemy) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), new THREE.MeshBasicMaterial({ color: 0xff3977 }));

  mesh.position.copy(enemy.group.position).add(new THREE.Vector3(0, 1.5, 0));

  scene.add(mesh);

  const target = camera.position.clone();
  target.y = 1.1;

  const velocity = target.sub(mesh.position).normalize().multiplyScalar(8.5);

  projectiles.push({
    mesh,
    velocity,
    life: 4,
    damage: 18,
  });
}

function updateProjectiles(dt) {
  for (const projectile of [...projectiles]) {
    projectile.mesh.position.addScaledVector(projectile.velocity, dt);
    projectile.life -= dt;

    const p = projectile.mesh.position;

    if (projectile.life <= 0 || isWallAt(p.x, p.z, 0.18)) {
      scene.remove(projectile.mesh);
      projectiles = projectiles.filter((item) => item !== projectile);
      continue;
    }

    if (
      Math.hypot(p.x - camera.position.x, p.z - camera.position.z) < 0.75 &&
      Math.abs(p.y - camera.position.y) < 1.5
    ) {
      damagePlayer(projectile.damage);
      showMessage("OVERMIND BLAST — HIT!");

      scene.remove(projectile.mesh);
      projectiles = projectiles.filter((item) => item !== projectile);
    }
  }
}

function shoot() {
  const now = performance.now();

  if (
    !running ||
    !controls.isLocked ||
    reloading ||
    ammo <= 0 ||
    now - lastShot < fireDelay ||
    waveTransitioning ||
    ended ||
    paused
  ) {
    if (ammo <= 0 && !reloading && running) {
      showMessage("Out of ammo — press R");
    }

    return;
  }

  lastShot = now;
  ammo--;

  if (!muted && audio.laser) {
    audio.laser.currentTime = 0;
    audio.laser.play().catch(() => {});
  }

  muzzleFlash.visible = true;

  setTimeout(() => {
    if (muzzleFlash) {
      muzzleFlash.visible = false;
    }
  }, 65);

  camera.updateMatrixWorld();
  camera.getWorldDirection(direction);
  rightVector.setFromMatrixColumn(camera.matrixWorld, 0).normalize();

  const totalShots = Math.max(1, shotCount);
  const spread = totalShots === 1 ? 0 : 0.045 + totalShots * 0.012;

  let anyEnemyHit = false;
  let wallHit = null;

  for (let shot = 0; shot < totalShots; shot++) {
    const offset = shot - (totalShots - 1) / 2;

    const shotDirection = direction
      .clone()
      .addScaledVector(rightVector, offset * spread)
      .normalize();

    raycaster.set(camera.position, shotDirection);

    const hits = raycaster.intersectObjects([...wallMeshes, ...enemyMeshes], false);

    const damagedThisProjectile = new Set();
    let enemyHits = 0;

    const beamEnd = camera.position.clone().addScaledVector(shotDirection, raycaster.far);

    for (const hit of hits) {
      if (hit.object.userData.isWall) {
        wallHit = wallHit || hit;
        beamEnd.copy(hit.point);
        break;
      }

      const enemy = hit.object.userData.enemyRef;

      if (!enemy || !enemies.includes(enemy) || damagedThisProjectile.has(enemy)) {
        continue;
      }

      damagedThisProjectile.add(enemy);
      anyEnemyHit = true;
      beamEnd.copy(hit.point);

      const headshot = hit.object === enemy.headMesh;
      const executionMultiplier = enemy.health / enemy.maxHealth <= 0.35 ? 1 + executionBonus : 1;

      const bossMultiplier = enemy.isBoss ? 1 + bossDamageBonus : 1;

      const damage =
        (BASE_WEAPON_DAMAGE + damageBonus) *
        damageMultiplier *
        executionMultiplier *
        bossMultiplier *
        (headshot ? 2 : 1);

      enemy.health -= damage;
      enemyHits++;

      showMessage(
        `${headshot ? "HEADSHOT! " : "HIT! "}${Math.ceil(damage)} DAMAGE · ${
          enemy.isBoss ? "BOSS" : "ALIEN"
        } ${Math.max(0, Math.ceil(enemy.health))} HP LEFT`,
      );

      if (explosiveRadius > 0) {
        for (const nearby of [...enemies]) {
          if (nearby === enemy || !enemies.includes(nearby)) continue;

          if (nearby.group.position.distanceTo(hit.point) <= explosiveRadius) {
            nearby.health -= 10;

            if (nearby.health <= 0) {
              eliminateEnemy(nearby);
            }
          }
        }
      }

      if (enemy.health <= 0) {
        eliminateEnemy(enemy);
      }

      if (enemyHits > armorPiercing) {
        break;
      }
    }

    const beamGeometry = new THREE.BufferGeometry().setFromPoints([camera.position.clone(), beamEnd.clone()]);

    const beamMaterial = new THREE.LineBasicMaterial({
      color: 0x72f5c3,
      transparent: true,
      opacity: totalShots > 1 ? 0.85 : 0.95,
    });

    const beam = new THREE.Line(beamGeometry, beamMaterial);
    scene.add(beam);
    effectObjects.push(beam);

    setTimeout(() => {
      scene.remove(beam);
      effectObjects = effectObjects.filter((item) => item !== beam);
      beamGeometry.dispose();
      beamMaterial.dispose();
    }, 110);
  }

  if (!anyEnemyHit && wallHit) {
    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x72f5c3 }),
    );

    spark.position.copy(wallHit.point);
    scene.add(spark);
    effectObjects.push(spark);

    setTimeout(() => {
      scene.remove(spark);
      effectObjects = effectObjects.filter((item) => item !== spark);
      spark.geometry.dispose();
      spark.material.dispose();
    }, 180);
  }

  updateHud();
}

function eliminateEnemy(enemy) {
  if (!enemies.includes(enemy)) return;

  scene.remove(enemy.group);
  enemies = enemies.filter((item) => item !== enemy);
  enemyMeshes = enemyMeshes.filter((mesh) => !enemy.meshes.includes(mesh));

  score += Math.round((enemy.isBoss ? 2500 : 100) * scoreMultiplier);
  health = Math.min(maxHealth, health + lifesteal);

  if (enemy.isBoss) {
    boss = null;
    bossDefeated = true;
    winGame();
    return;
  }

  updateHud();
}

function reload() {
  if (reloading || ammo === magazineSize || ended || waveTransitioning) {
    return;
  }

  reloading = true;
  reloadUntil = performance.now() + reloadDuration;
  showMessage("Reloading...");
}

function updateReload(now) {
  if (reloading && now >= reloadUntil) {
    reloading = false;
    ammo = magazineSize;
    updateHud();
    showMessage("Magazine reloaded");
  }
}

function clearWave() {
  if (waveTransitioning || ended) return;

  waveTransitioning = true;
  running = false;
  paused = false;

  controls.unlock();
  audio.run.pause();
  ui.pause.classList.add("hidden");

  if (wave >= 5) {
    winGame();
    return;
  }

  ui.upgradeTitle.textContent = `Wave ${wave} cleared`;
  ui.upgradeSubtitle.textContent = `Score: ${score.toLocaleString()} · Choose one upgrade before Wave ${wave + 1}.`;

  showUpgradeChoices();

  ui.upgrade.classList.remove("hidden");
  ui.hud.classList.remove("hidden");

  showMessage("WAVE CLEARED — CHOOSE AN UPGRADE");
}

function showUpgradeChoices() {
  ui.upgradeCards.replaceChildren();

  const pool = [...powerUps];
  const choices = [];

  const rarityWeight = {
    Common: 6,
    Rare: 3,
    Epic: 1,
  };

  const categoryWeight = {
    offense: 4,
    utility: 1.1,
    defense: 1,
  };

  while (choices.length < 3 && pool.length) {
    const weights = pool.map((item) => rarityWeight[item.rarity] * categoryWeight[item.category || "offense"]);

    let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
    let index = 0;

    for (; index < weights.length - 1 && roll >= weights[index]; index++) {
      roll -= weights[index];
    }

    const candidate = pool.splice(index, 1)[0];

    if (choices.some((item) => item.category === candidate.category && item.id === candidate.id)) {
      continue;
    }

    choices.push(candidate);
  }

  for (const power of choices) {
    const card = document.createElement("button");

    card.type = "button";
    card.className = `upgrade-card rarity-${power.rarity.toLowerCase()}`;

    const rarity = document.createElement("span");
    rarity.className = "rarity";
    rarity.textContent = `${power.rarity} · ${power.category.toUpperCase()}`;

    const title = document.createElement("h3");
    title.textContent = power.name;

    const description = document.createElement("p");
    description.textContent = power.description;

    const level = document.createElement("span");
    level.className = "upgrade-level";
    level.textContent = `BUILD UPGRADE · WAVE ${wave}`;

    const choose = document.createElement("span");
    choose.className = "choose";
    choose.textContent = "SELECT UPGRADE →";

    card.append(rarity, title, description, level, choose);
    card.addEventListener("click", () => choosePowerUp(power));

    ui.upgradeCards.append(card);
  }
}

function choosePowerUp(power) {
  if (!waveTransitioning || ended) return;

  power.apply();
  wave++;

  waveTransitioning = false;
  ui.upgrade.classList.add("hidden");
  camera.position.y = 1.65;

  spawnWave();
  updateHud();

  showMessage(`${power.name.toUpperCase()} ACQUIRED`);
  controls.lock();
}

function showMessage(text) {
  ui.message.textContent = text;
  ui.message.classList.add("visible");
  messageUntil = performance.now() + 1700;
}

function updateHud() {
  ui.score.textContent = String(score);
  ui.enemies.textContent = String(enemies.length);
  ui.wave.textContent = `${wave} / 5`;

  ui.healthText.textContent =
    `${Math.ceil(health)} / ${maxHealth} HP` + (shield > 0 ? ` · SHIELD ${Math.ceil(shield)}` : "");

  ui.healthFill.style.width = `${Math.max(0, (health / maxHealth) * 100)}%`;

  ui.healthFill.style.background = health <= maxHealth * 0.3 ? "#ff5e66" : "var(--accent)";

  ui.ammo.textContent = reloading ? "RELOADING…" : `${ammo} / ${magazineSize}`;

  if (boss) {
    ui.bossHud.classList.remove("hidden");

    ui.bossHealthFill.style.width = `${Math.max(0, (boss.health / boss.maxHealth) * 100)}%`;

    ui.bossHealthText.textContent = `${Math.max(0, Math.ceil(boss.health))} / ${boss.maxHealth} HP`;
  } else {
    ui.bossHud.classList.add("hidden");
  }
}

function drawMinimap() {
  if (!mapContext || !maze.length) return;

  const size = ui.minimap.width;
  const cell = size / maze[0].length;

  mapContext.clearRect(0, 0, size, size);

  const wall = mode === "dark" ? "#33404c" : "#91a6a8";
  const path = mode === "dark" ? "#101922" : "#e6f0ed";

  for (let r = 0; r < maze.length; r++) {
    for (let c = 0; c < maze[r].length; c++) {
      mapContext.fillStyle = maze[r][c] === "#" ? wall : path;
      mapContext.fillRect(c * cell, r * cell, cell + 0.5, cell + 0.5);
    }
  }

  for (const enemy of enemies) {
    mapContext.fillStyle = enemy.isBoss ? "#d96aff" : "#ff5964";
    mapContext.beginPath();

    mapContext.arc(
      (enemy.group.position.x / TILE + 0.5) * cell,
      (enemy.group.position.z / TILE + 0.5) * cell,
      Math.max(enemy.isBoss ? 5 : 2.5, cell * (enemy.isBoss ? 0.26 : 0.16)),
      0,
      Math.PI * 2,
    );

    mapContext.fill();
  }

  mapContext.fillStyle = "#72f5c3";
  mapContext.beginPath();

  mapContext.arc(
    (camera.position.x / TILE + 0.5) * cell,
    (camera.position.z / TILE + 0.5) * cell,
    Math.max(3, cell * 0.2),
    0,
    Math.PI * 2,
  );

  mapContext.fill();

  camera.getWorldDirection(direction);

  mapContext.strokeStyle = "#72f5c3";
  mapContext.lineWidth = 2;
  mapContext.beginPath();

  mapContext.moveTo((camera.position.x / TILE + 0.5) * cell, (camera.position.z / TILE + 0.5) * cell);

  mapContext.lineTo(
    (camera.position.x / TILE + 0.5 + direction.x * 0.65) * cell,
    (camera.position.z / TILE + 0.5 + direction.z * 0.65) * cell,
  );

  mapContext.stroke();
}

function finishGame(won) {
  if (ended) return;

  ended = true;
  running = false;
  paused = false;
  waveTransitioning = false;

  controls.unlock();
  gun.visible = false;
  audio.run.pause();
  audio.music.pause();

  ui.pause.classList.add("hidden");
  ui.start.classList.add("hidden");
  ui.upgrade.classList.add("hidden");
  ui.end.classList.remove("hidden");

  ui.endEyebrow.textContent = won ? "FINAL BOSS DEFEATED" : "MISSION FAILED";

  ui.endTitle.textContent = won ? "You survived." : "You were overrun.";

  ui.endSummary.textContent =
    `${won ? "The Overmind has been eliminated" : "Your health reached zero"} · ` +
    `Score ${score.toLocaleString()} · ` +
    `Waves ${won ? "5 / 5" : `${wave - 1} / 5`} · ` +
    `Time ${formatTime(elapsed)}`;

  ui.hud.classList.remove("hidden");
}

function winGame() {
  if (ended) return;

  bossDefeated = true;
  finishGame(true);
}

function formatTime(seconds) {
  const total = Math.floor(seconds);

  return `${String(Math.floor(total / 60)).padStart(2, "0")}:` + `${String(total % 60).padStart(2, "0")}`;
}

function animate() {
  requestAnimationFrame(animate);

  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();

  if (running && controls.isLocked && !ended && !waveTransitioning) {
    elapsed += dt;

    movePlayer(dt);
    updateEnemies(dt, now);
    updateReload(now);

    if (
      mouseHeld &&
      running &&
      controls.isLocked &&
      !reloading &&
      !waveTransitioning &&
      !ended &&
      ammo > 0 &&
      now - lastShot >= fireDelay
    ) {
      shoot();
    }

    if (messageUntil && now > messageUntil) {
      ui.message.classList.remove("visible");
      messageUntil = 0;
    }

    ui.timer.textContent = formatTime(elapsed);
    drawMinimap();
  }

  renderer.render(scene, camera);
}

init().catch((error) => {
  console.error(error);

  ui.loading.textContent = "Could not initialize the game. Check the browser console and run through Live Server.";

  ui.start.classList.remove("hidden");
});
