import * as THREE from 'three';
import { VEHICLES } from './data/vehicles';
import { createScene } from './render/scene';
import { buildTank } from './render/tank';
import { cameraSectionPlane, setSectionPlane, setXray, type SectionMode } from './render/xray';

const ctx = createScene(document.getElementById('viewport')!);
const tank = buildTank(VEHICLES[0]);
ctx.scene.add(tank.root);
let xray = true;
let section: SectionMode = 'off';
setXray(tank, xray);

window.addEventListener('keydown', (e) => {
  if (e.key === 'x' || e.key === 'X') setXray(tank, (xray = !xray));
  if (e.key === 'c' || e.key === 'C') section = section === 'off' ? 'camera' : 'off';
});

function frame() {
  ctx.controls.update();
  setSectionPlane(tank, section === 'camera' ? cameraSectionPlane(new THREE.Vector3(0, 1, 0), ctx.camera.position) : null);
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(frame);
}
frame();
