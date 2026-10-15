import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface SceneCtx {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export function createScene(container: HTMLElement): SceneCtx {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1b1f24);
  scene.fog = new THREE.Fog(0x1b1f24, 30, 90);

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.05, 300);
  camera.position.set(8, 5, 8);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, 0);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 2;
  controls.maxDistance = 30;

  scene.add(new THREE.HemisphereLight(0xcfd8e6, 0x3a3631, 1.1));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
  sun.position.set(10, 16, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -10; sc.right = 10; sc.top = 10; sc.bottom = -10;
  scene.add(sun);

  scene.add(createGround());

  const onResize = () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', onResize);

  return { renderer, scene, camera, controls };
}

/** Concrete pad: a procedurally drawn slab texture with panel seams. */
function createGround(): THREE.Object3D {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#6d6b67';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9000; i++) {
    const s = Math.random() * 2;
    const c = 90 + Math.random() * 40;
    g.fillStyle = `rgba(${c},${c - 2},${c - 6},0.35)`;
    g.fillRect(Math.random() * size, Math.random() * size, s, s);
  }
  g.strokeStyle = 'rgba(30,30,30,0.6)';
  g.lineWidth = 3;
  g.strokeRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.receiveShadow = true;
  return mesh;
}
