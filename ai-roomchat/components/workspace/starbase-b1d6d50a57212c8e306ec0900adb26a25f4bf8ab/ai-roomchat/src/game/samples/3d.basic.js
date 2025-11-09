// 3D Basic Starter (Three.js + GLTF 로더 스케치)
// 참고: three, @react-three/*를 쓰지 않고 순수 three 예시. 패키지 설치 필요 시 가이드만 참조하세요.

export default function createThreeBasic(opts = {}) {
  let el, renderer, scene, camera, anim = null, running = false;
  async function initThree(container) {
    const THREE = await import('three');
    const { WebGLRenderer, Scene, PerspectiveCamera, Color, BoxGeometry, MeshBasicMaterial, Mesh } = THREE;
    renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);
    scene = new Scene(); scene.background = new Color(0x0c0c10);
    camera = new PerspectiveCamera(60, container.clientWidth/container.clientHeight, 0.1, 1000); camera.position.z = 3;
    const box = new Mesh(new BoxGeometry(1,1,1), new MeshBasicMaterial({ color: 0x44aa88 })); scene.add(box);
    const clock = new THREE.Clock();
    function animate(){ if (!running) return; const t=clock.getElapsedTime(); box.rotation.y = t*0.6; renderer.render(scene, camera); anim = requestAnimationFrame(animate); }
    animate();
    return { THREE };
  }
  function onResize(){ if (!renderer || !camera) return; const w=el.clientWidth, h=el.clientHeight; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); }
  return {
    async init(container){ el = container; await initThree(container); window.addEventListener('resize', onResize); },
    start(){ running = true; },
    stop(){ running = false; if (anim) cancelAnimationFrame(anim); anim = null; },
    dispose(){ this.stop(); window.removeEventListener('resize', onResize); if (renderer?.domElement?.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); renderer=null; },
    resize: onResize,
  };
}

