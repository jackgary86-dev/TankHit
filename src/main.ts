import { createScene } from './render/scene';

const ctx = createScene(document.getElementById('viewport')!);

function frame() {
  ctx.controls.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(frame);
}
frame();
