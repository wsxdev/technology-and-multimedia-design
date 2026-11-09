/* ============================================================
   TYDM · Tecnología y Diseño Multimedia
   Visor 3D interactivo + interacciones de la página
   ============================================================ */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

window.__tydmBooted = true;

/* ------------------------------------------------------------
   Utilidades
   ------------------------------------------------------------ */

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const stage = $('#stage');
const canvas = $('#scene');
const loader = $('#loader');
const loaderFill = $('#loader-fill');
const loaderPct = $('#loader-pct');
const errorBox = $('#stage-error');
const toast = $('#toast');
const finishName = $('#finish-name');

let toastTimer = null;

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2300);
}

function setProgress(value) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  if (loaderFill) loaderFill.style.width = `${pct}%`;
  if (loaderPct) loaderPct.textContent = `${pct}%`;
}

function showModelError(message) {
  if (loader) loader.classList.add('is-hidden');
  if (errorBox) {
    if (message) {
      const p = $('p', errorBox);
      if (p) p.textContent = message;
    }
    errorBox.hidden = false;
  }
}

/* ------------------------------------------------------------
   Estado
   ------------------------------------------------------------ */

const state = {
  modelReady: false,
  pivot: null,
  materials: [],
  modelRadius: 1.8,
  modelHeight: 1,
  target: new THREE.Vector3(0, 0.5, 0),
  tween: null,
  finish: 'steel',
  wireframe: false,
  autoRotate: !prefersReducedMotion,
};

const FINISHES = {
  steel: { label: 'Acero cepillado', color: 0xc9d3dd, metalness: 0.9, roughness: 0.3 },
  graphite: { label: 'Grafito mate', color: 0x3c424b, metalness: 0.55, roughness: 0.52 },
  copper: { label: 'Cobre pulido', color: 0xc97a4a, metalness: 0.92, roughness: 0.28 },
  orange: { label: 'Naranja técnico', color: 0xff7a3d, metalness: 0.25, roughness: 0.45 },
  bone: { label: 'Blanco hueso', color: 0xece7dd, metalness: 0.1, roughness: 0.6 },
};

const VIEWS = {
  iso: { dir: [1, 0.58, 1.3], dist: 2.45, label: 'Isométrica' },
  front: { dir: [0, 0.16, 1], dist: 2.25, label: 'Frontal' },
  side: { dir: [1, 0.16, 0.04], dist: 2.45, label: 'Lateral' },
  top: { dir: [0.02, 1, 0.05], dist: 2.6, label: 'Superior' },
};

/* ------------------------------------------------------------
   Renderer, escena y cámara
   ------------------------------------------------------------ */

let renderer;

try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
} catch (error) {
  console.error(error);
  showModelError('Tu navegador no pudo iniciar WebGL. Probá con una versión actualizada de Chrome, Firefox, Edge o Safari.');
  throw error;
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 120);
camera.position.set(4.4, 3.1, 5.2);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.rotateSpeed = 0.82;
controls.zoomSpeed = 0.9;
controls.panSpeed = 0.7;
controls.screenSpacePanning = true;
controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI * 0.52;
controls.minDistance = 1;
controls.maxDistance = 14;
controls.autoRotate = state.autoRotate;
controls.autoRotateSpeed = 0.85;
controls.target.set(0, 0.9, 0);

/* ------------------------------------------------------------
   Entorno e iluminación
   ------------------------------------------------------------ */

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new RoomEnvironment();
const envTexture = pmrem.fromScene(envScene, 0.04).texture;
scene.environment = envTexture;
scene.environmentIntensity = 0.7;
if (typeof envScene.dispose === 'function') envScene.dispose();
pmrem.dispose();

const hemi = new THREE.HemisphereLight(0xdce8ff, 0x1c130d, 1.15);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xffe2c4, 3.2);
keyLight.position.set(5, 9, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 7;
keyLight.shadow.camera.bottom = -3;
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.02;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0x7db3ff, 2.2);
rimLight.position.set(-6, 4.5, -5);
scene.add(rimLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 0.65);
fillLight.position.set(2, 1.5, -7);
scene.add(fillLight);

/* Suelo invisible que recibe la sombra real */
const shadowGround = new THREE.Mesh(
  new THREE.CircleGeometry(14, 96).rotateX(-Math.PI / 2),
  new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.34, transparent: true, depthWrite: false })
);
shadowGround.position.y = 0;
shadowGround.receiveShadow = true;
scene.add(shadowGround);

/* Mancha de oclusión suave bajo el objeto */
function createContactShadowTexture() {
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 8, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
  gradient.addColorStop(0.5, 'rgba(0, 0, 0, 0.24)');
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const contactShadow = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({
    map: createContactShadowTexture(),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  })
);
contactShadow.position.y = 0.003;
contactShadow.visible = false;
scene.add(contactShadow);

/* Aros decorativos alrededor de la base */
const ringGroup = new THREE.Group();
ringGroup.visible = false;
scene.add(ringGroup);

/* ------------------------------------------------------------
   Cámara: transiciones y vistas
   ------------------------------------------------------------ */

function setActiveView(name) {
  $$('[data-view]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.view === name);
  });
}

function startCameraTween(position, target, duration = 0.9) {
  state.tween = {
    fromPos: camera.position.clone(),
    toPos: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    elapsed: 0,
    duration,
  };
  controls.autoRotate = false;
  controls.enabled = false;
}

function setView(name) {
  if (!state.modelReady) return;
  const view = VIEWS[name];
  if (!view) return;

  const direction = new THREE.Vector3(...view.dir).normalize();
  const target = state.target.clone();
  const position = target.clone().add(direction.multiplyScalar(state.modelRadius * view.dist));

  startCameraTween(position, target, 0.9);
  setActiveView(name);
  showToast(`Vista ${view.label.toLowerCase()}`);
}

function zoomBy(factor) {
  if (!state.modelReady || state.tween) return;
  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(
    offset.length() * factor,
    controls.minDistance,
    controls.maxDistance
  );
  const position = controls.target.clone().add(offset.setLength(distance));
  startCameraTween(position, controls.target.clone(), 0.45);
}

controls.addEventListener('start', () => {
  if (!state.tween) setActiveView(null);
});

/* ------------------------------------------------------------
   Carga del modelo
   ------------------------------------------------------------ */

const gltfLoader = new GLTFLoader();

/* Progreso visual estable: el archivo es local y liviano */
let fakeProgress = 0;
const progressTimer = window.setInterval(() => {
  fakeProgress = Math.min(92, fakeProgress + (92 - fakeProgress) * 0.1 + 1.2);
  setProgress(fakeProgress);
}, 110);

gltfLoader.load(
  './models/modelOpener/scene.gltf',
  onModelLoaded,
  (event) => {
    if (event && event.lengthComputable && event.total) {
      const pct = (event.loaded / event.total) * 100;
      if (pct > fakeProgress) {
        fakeProgress = Math.min(92, pct);
        setProgress(fakeProgress);
      }
    }
  },
  (error) => {
    window.clearInterval(progressTimer);
    console.error('Error al cargar el modelo:', error);
    showModelError(
      'Verificá que existan los archivos models/modelOpener/scene.gltf y scene.bin. Si abriste la página con file://, usá un servidor local: python -m http.server'
    );
  }
);

function prepareMaterial(material) {
  const clone = material.clone();
  clone.side = THREE.DoubleSide;
  clone.envMapIntensity = 1.15;
  clone.needsUpdate = true;
  state.materials.push(clone);
  return clone;
}

function onModelLoaded(gltf) {
  window.clearInterval(progressTimer);
  setProgress(100);

  const model = gltf.scene;

  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = false;

    if (Array.isArray(object.material)) {
      object.material = object.material.map(prepareMaterial);
    } else if (object.material) {
      object.material = prepareMaterial(object.material);
    }
  });

  /* El STL viene acostado: lo ponemos de pie para la exhibición */
  model.rotation.x = -Math.PI / 2;

  state.pivot = new THREE.Group();
  state.pivot.add(model);
  scene.add(state.pivot);
  state.pivot.updateMatrixWorld(true);

  /* Centrar la geometría */
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  model.position.sub(center);

  /* Escalar a una medida cómoda para la cámara */
  const maxDimension = Math.max(size.x, size.y, size.z) || 1;
  const scale = 3.4 / maxDimension;
  state.pivot.scale.setScalar(scale);
  state.pivot.updateMatrixWorld(true);

  /* Apoyar la base sobre el suelo */
  const scaledBox = new THREE.Box3().setFromObject(state.pivot);
  state.pivot.position.y = -scaledBox.min.y;
  state.pivot.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(state.pivot);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  const sphere = finalBox.getBoundingSphere(new THREE.Sphere());

  state.modelRadius = sphere.radius;
  state.modelHeight = finalSize.y;
  state.target.set(0, state.modelHeight * 0.52, 0);
  state.modelReady = true;

  /* Sombra de contacto y aros */
  const footprint = Math.max(finalSize.x, finalSize.z);
  contactShadow.scale.setScalar(footprint * 1.65);
  contactShadow.position.y = 0.003;
  contactShadow.visible = true;

  const ringRadius = footprint * 0.63;
  ringGroup.clear();
  ringGroup.add(makeRing(ringRadius, 0.006, 0.22));
  ringGroup.add(makeRing(ringRadius * 1.24, 0.004, 0.08));
  ringGroup.visible = true;

  /* Cámara y límites de órbita */
  controls.minDistance = state.modelRadius * 1.05;
  controls.maxDistance = state.modelRadius * 7;
  camera.near = 0.02;
  camera.far = Math.max(80, state.modelRadius * 30);
  camera.updateProjectionMatrix();

  applyFinish(state.finish, false);
  applyWireframe(state.wireframe);

  const iso = VIEWS.iso;
  const direction = new THREE.Vector3(...iso.dir).normalize();
  const target = state.target.clone();
  const position = target.clone().add(direction.multiplyScalar(state.modelRadius * iso.dist));
  startCameraTween(position, target, 1.15);
  setActiveView('iso');

  window.setTimeout(() => {
    loader.classList.add('is-hidden');
    showToast('Modelo cargado · Arrastrá para explorar');
  }, 380);
}

function makeRing(radius, y, opacity) {
  const geometry = new THREE.RingGeometry(radius * 0.992, radius, 128).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff7a3d,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  return mesh;
}

/* ------------------------------------------------------------
   Materiales y acabados
   ------------------------------------------------------------ */

function applyFinish(key, notify = true) {
  const finish = FINISHES[key];
  if (!finish) return;

  state.finish = key;

  state.materials.forEach((material) => {
    material.color.setHex(finish.color);
    material.metalness = finish.metalness;
    material.roughness = finish.roughness;
    material.needsUpdate = true;
  });

  if (finishName) finishName.textContent = finish.label;

  $$('.swatch').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.finish === key);
  });

  if (notify && state.modelReady) showToast(`Acabado: ${finish.label}`);
}

function applyWireframe(enabled) {
  state.wireframe = enabled;
  state.materials.forEach((material) => {
    material.wireframe = enabled;
    material.needsUpdate = true;
  });
}

/* ------------------------------------------------------------
   Controles de la interfaz
   ------------------------------------------------------------ */

$$('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setView(button.dataset.view));
});

$$('.swatch').forEach((button) => {
  button.addEventListener('click', () => applyFinish(button.dataset.finish));
});

const rotateInput = $('#toggle-rotate');
if (rotateInput) {
  rotateInput.checked = !prefersReducedMotion;
  rotateInput.addEventListener('change', () => {
    state.autoRotate = rotateInput.checked;
    controls.autoRotate = state.autoRotate;
    showToast(rotateInput.checked ? 'Rotación automática activada' : 'Rotación automática pausada');
  });
}

const wireInput = $('#toggle-wire');
if (wireInput) {
  wireInput.addEventListener('change', () => {
    applyWireframe(wireInput.checked);
    showToast(wireInput.checked ? 'Vista de malla activada' : 'Vista de malla desactivada');
  });
}

const zoomIn = $('#btn-zoom-in');
const zoomOut = $('#btn-zoom-out');
const resetView = $('#btn-reset-view');

if (zoomIn) zoomIn.addEventListener('click', () => zoomBy(0.78));
if (zoomOut) zoomOut.addEventListener('click', () => zoomBy(1.28));
if (resetView) {
  resetView.addEventListener('click', () => {
    if (!state.modelReady) return;
    setView('iso');
    showToast('Vista restablecida');
  });
}

/* Pantalla completa */

const fullscreenButton = $('#btn-fullscreen');

function isFullscreen() {
  return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullscreen() {
  if (!stage) return;

  if (!isFullscreen()) {
    const request = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (!request) {
      showToast('Pantalla completa no disponible');
      return;
    }
    Promise.resolve(request.call(stage)).catch(() => {
      showToast('Pantalla completa no disponible');
    });
  } else {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (exit) Promise.resolve(exit.call(document)).catch(() => {});
  }
}

if (fullscreenButton) {
  fullscreenButton.addEventListener('click', toggleFullscreen);
}

function syncFullscreenButton() {
  if (fullscreenButton) fullscreenButton.setAttribute('aria-pressed', String(isFullscreen()));
  window.setTimeout(resize, 120);
}

document.addEventListener('fullscreenchange', syncFullscreenButton);
document.addEventListener('webkitfullscreenchange', syncFullscreenButton);

/* Captura PNG */

const captureButton = $('#btn-capture');

function captureModel() {
  if (!state.modelReady) {
    showToast('El modelo todavía se está cargando');
    return;
  }

  renderer.render(scene, camera);

  const source = renderer.domElement;
  const output = document.createElement('canvas');
  output.width = source.width;
  output.height = source.height;

  const ctx = output.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, output.width, output.height);
  gradient.addColorStop(0, '#11151c');
  gradient.addColorStop(1, '#07080a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, output.width, output.height);
  ctx.drawImage(source, 0, 0);

  const unit = output.width / 1600;
  const padding = Math.max(20, 34 * unit);

  ctx.fillStyle = 'rgba(255, 122, 61, 0.9)';
  ctx.fillRect(padding, output.height - padding - 52 * unit, 34 * unit, 2 * unit);

  ctx.fillStyle = 'rgba(244, 241, 234, 0.92)';
  ctx.font = `600 ${Math.max(12, 19 * unit)}px "Space Grotesk", "Manrope", sans-serif`;
  ctx.fillText('OPENER PROTOTYPE 3.1', padding, output.height - padding - 24 * unit);

  ctx.fillStyle = 'rgba(150, 157, 168, 0.85)';
  ctx.font = `500 ${Math.max(9, 12 * unit)}px "Manrope", sans-serif`;
  ctx.fillText('TYDM · Tecnología y Diseño Multimedia', padding, output.height - padding);

  output.toBlob((blob) => {
    if (!blob) {
      showToast('No se pudo generar la captura');
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'opener-prototype-3.1.png';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1200);
    showToast('Captura descargada');
  }, 'image/png');
}

if (captureButton) captureButton.addEventListener('click', captureModel);

/* ------------------------------------------------------------
   Resize y bucle de render
   ------------------------------------------------------------ */

function resize() {
  if (!stage) return;
  const width = stage.clientWidth;
  const height = stage.clientHeight;
  if (!width || !height) return;

  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

if ('ResizeObserver' in window) {
  new ResizeObserver(resize).observe(stage);
} else {
  window.addEventListener('resize', resize);
}

resize();

const clock = new THREE.Clock();

function animate() {
  const delta = Math.min(clock.getDelta(), 0.05);

  if (state.tween) {
    const tween = state.tween;
    tween.elapsed += delta;
    const progress = Math.min(1, tween.elapsed / tween.duration);
    const eased = 1 - Math.pow(1 - progress, 3);

    camera.position.lerpVectors(tween.fromPos, tween.toPos, eased);
    controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);

    if (progress >= 1) {
      controls.enabled = true;
      controls.autoRotate = state.autoRotate;
      state.tween = null;
    }
  }

  controls.update(delta);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);

/* ------------------------------------------------------------
   Navegación, header y revelado de secciones
   ------------------------------------------------------------ */

const header = $('.site-header');
const navToggle = $('#nav-toggle');
const siteNav = $('#site-nav');
const navLinks = $$('.site-nav a');
const sections = navLinks
  .map((link) => $(link.getAttribute('href')))
  .filter(Boolean);

function closeMenu() {
  if (!navToggle || !siteNav) return;
  navToggle.setAttribute('aria-expanded', 'false');
  siteNav.classList.remove('is-open');
}

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = navToggle.getAttribute('aria-expanded') === 'true';
    navToggle.setAttribute('aria-expanded', String(!isOpen));
    siteNav.classList.toggle('is-open', !isOpen);
  });

  siteNav.addEventListener('click', (event) => {
    if (event.target.closest('a')) closeMenu();
  });

  document.addEventListener('click', (event) => {
    if (!siteNav.classList.contains('is-open')) return;
    if (siteNav.contains(event.target) || navToggle.contains(event.target)) return;
    closeMenu();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });
}

let scrollTicking = false;

function onScroll() {
  if (scrollTicking) return;
  scrollTicking = true;

  window.requestAnimationFrame(() => {
    const scrolled = window.scrollY > 16;
    if (header) header.classList.toggle('is-scrolled', scrolled);

    const marker = window.scrollY + 150;
    let currentId = '';

    for (const section of sections) {
      if (section.offsetTop <= marker) currentId = section.id;
    }

    navLinks.forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${currentId}`);
    });

    scrollTicking = false;
  });
}

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

/* Revelado al hacer scroll */

const revealElements = $$('.reveal');

if (prefersReducedMotion) {
  revealElements.forEach((element) => element.classList.add('is-visible'));
} else if ('IntersectionObserver' in window) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
  );

  revealElements.forEach((element) => revealObserver.observe(element));
} else {
  revealElements.forEach((element) => element.classList.add('is-visible'));
}

/* Contadores del hero */

function animateCounter(element) {
  const target = Number(element.dataset.count);
  if (!Number.isFinite(target)) return;

  if (prefersReducedMotion) {
    element.textContent = target.toLocaleString('es-AR');
    return;
  }

  const duration = 1500;
  const started = performance.now();

  function tick(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.round(target * eased).toLocaleString('es-AR');
    if (progress < 1) window.requestAnimationFrame(tick);
  }

  window.requestAnimationFrame(tick);
}

const counters = $$('[data-count]');

if (counters.length) {
  if ('IntersectionObserver' in window) {
    const counterObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          animateCounter(entry.target);
          counterObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.5 }
    );
    counters.forEach((counter) => counterObserver.observe(counter));
  } else {
    counters.forEach(animateCounter);
  }
}
