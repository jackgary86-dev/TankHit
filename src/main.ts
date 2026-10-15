import { VEHICLES } from './data/vehicles';
import { createScene } from './render/scene';
import { buildTank } from './render/tank';

const ctx = createScene(document.getElementById('viewport')!);
const tank = buildTank(VEHICLES[0]);
tank.interior.forEach((o) => (o.visible = false));
ctx.scene.add(tank.root);

function frame() {
  ctx.controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(frame);
}
frame();
