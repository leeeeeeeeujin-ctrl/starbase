// WebGL Renderer Adapter (Three.js placeholder)

/**
 * Attach a Three.js-like renderer to a container.
 * Note: Actual three.js import is deferred and optional.
 * @param {HTMLElement} mount
 * @param {{ width?:number, height?:number }} [options]
 */
export async function attachWebGL(mount, options = {}) {
  let THREE;
  try {
    THREE = await import('three');
  } catch {
    throw new Error('three module not available');
  }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const w = options.width || 400; const h = options.height || 300;
  renderer.setSize(w, h);
  mount.appendChild(renderer.domElement);
  camera.position.z = 5;
  let disposed = false;
  function draw(state){ if (disposed) return; renderer.render(scene, camera); }
  function resize(width, height){ renderer.setSize(width, height); camera.aspect = width/height; camera.updateProjectionMatrix(); }
  function dispose(){ disposed = true; try { mount.removeChild(renderer.domElement); } catch {} renderer.dispose(); }
  return { draw, resize, dispose, scene, camera, renderer };
}

