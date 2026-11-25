// Real 3D devices, for themes with `depth`: each phone or tablet frame is drawn by three.js (MIT) as a device with
// true thickness (a Galaxy S25 is 7.2 mm deep on 70.5 mm wide; a tablet about 6 mm on 165 mm), softly rounded edges,
// a glass face and the capture on its screen, posed exactly where the frame's CSS puts it: flat, or tilted by its
// `transform` (perspective(…) rotateY(…)…). The DOM frame stays in place, hidden, so layout, bounds checks and
// callouts still see it; a canvas over the card draws the device. The body takes `--device-body` (or the frame's
// solid background), white by default.
import * as THREE from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';

const roundedRect = (w: number, h: number, r: number) => {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

/** Depth as a share of the short side. */
const DEPTH = {phone: 7.2 / 70.5, tablet: 6.1 / 165};

/**
 * The frame's CSS transform, split into its perspective distance and its rotation. Read from the computed transform, so
 * it works however the theme wrote it (a layer, a variable, inline): perspective(d) followed by rotations leaves the
 * rotation in the top three rows and -1/d × m33 in m34.
 */
function pose(front: HTMLElement): {perspective: number; rotation: DOMMatrix} {
  const value = getComputedStyle(front).transform;
  const m = new DOMMatrix(value === 'none' ? undefined : value);
  const perspective = m.m34 ? -m.m33 / m.m34 : 1600;
  return {perspective, rotation: new DOMMatrix([m.m11, m.m12, m.m13, 0, m.m21, m.m22, m.m23, 0, m.m31, m.m32, m.m33, 0, 0, 0, 0, 1])};
}

/** The body color: --device-body, else the frame's background when it is a solid color, else white. */
function bodyColor(front: HTMLElement): THREE.Color {
  const style = getComputedStyle(front);
  const own = style.getPropertyValue('--device-body').trim();
  const solid = style.backgroundImage === 'none' && !/rgba\(.*,\s*0\)$|transparent/.test(style.backgroundColor) ? style.backgroundColor : '';
  const color = new THREE.Color();
  try { color.setStyle(own || solid || '#ffffff', THREE.SRGBColorSpace); } catch { color.set(0xffffff); }
  return color;
}

/** Draws `front` (a .device) as a 3D device on a 2D canvas over `main`, disposing its WebGL context immediately. */
export async function renderDevice(main: HTMLElement, front: HTMLElement): Promise<HTMLCanvasElement> {
  const style = getComputedStyle(front);
  const cardW = main.clientWidth, cardH = main.clientHeight;
  const W = front.offsetWidth, H = front.offsetHeight;
  const bezel = parseFloat(style.paddingLeft) || 0, radius = parseFloat(style.borderTopLeftRadius) || 0;
  const cx = front.offsetLeft + W / 2, cy = front.offsetTop + H / 2;
  const short = Math.min(W, H), thickness = front.classList.contains('device-frame-tablet') ? DEPTH.tablet : DEPTH.phone;
  const {perspective, rotation} = pose(front);

  const glCanvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({canvas: glCanvas, alpha: true, antialias: true, preserveDrawingBuffer: true});
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  let envRT: THREE.WebGLRenderTarget | null = null;
  let body: THREE.ExtrudeGeometry | null = null;
  let face: THREE.MeshPhysicalMaterial | null = null;
  let edge: THREE.MeshPhysicalMaterial | null = null;
  let screenGeo: THREE.ShapeGeometry | null = null;
  let screenMat: THREE.MeshBasicMaterial | null = null;
  let glassGeo: THREE.ShapeGeometry | null = null;
  let glassMat: THREE.MeshBasicMaterial | null = null;
  let texture: THREE.Texture | null = null;
  let sheenTexture: THREE.CanvasTexture | null = null;

  try {
    renderer.setPixelRatio(window.devicePixelRatio * 1.5);
    renderer.setSize(cardW, cardH, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.12;

    const scene = new THREE.Scene();
    // Soft studio light from the room, a key light from the upper left in front, so the face is bright and the edge
    // turning away a soft gray, with a fill from the right.
    envRT = pmrem.fromScene(room, .04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = .95;
    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-1.4, 1.1, 1.3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, .7);
    fill.position.set(1.5, .3, .6);
    scene.add(fill);

    // CSS perspective sits at the frame's centre, so the camera looks straight at it from `perspective` px away, and a
    // view offset moves that centre to where the frame is on the card. One unit is one CSS pixel.
    const camera = new THREE.PerspectiveCamera(2 * Math.atan(cardH / 2 / perspective) * 180 / Math.PI, cardW / cardH, 10, perspective * 4);
    camera.position.set(0, 0, perspective);
    camera.setViewOffset(cardW, cardH, cardW / 2 - cx, cardH / 2 - cy, cardW, cardH);

    const device = new THREE.Group();
    // CSS's y axis points down, three's up: conjugate the rotation by a y flip.
    const m = rotation;
    device.matrixAutoUpdate = false;
    device.matrix.set(m.m11, -m.m21, m.m31, 0, -m.m12, m.m22, -m.m32, 0, m.m13, -m.m23, m.m33, 0, 0, 0, 0, 1);
    scene.add(device);

    // The body: the frame's outline extruded backwards, its edge rounded by a bevel. Its front face is the CSS frame's
    // plane (z = 0), so the outline lands exactly where the frame's does.
    const depth = short * thickness, round = short * .016;
    body = new THREE.ExtrudeGeometry(roundedRect(W - 2 * round, H - 2 * round, Math.max(1, radius - round)), {
      depth: Math.max(1, depth - 2 * round), bevelEnabled: true, bevelThickness: round, bevelSize: round, bevelSegments: 16, curveSegments: 48,
    });
    body.translate(0, 0, -depth + round);
    const color = bodyColor(front);
    face = new THREE.MeshPhysicalMaterial({color, roughness: .25, metalness: 0, clearcoat: 1, clearcoatRoughness: .15});
    edge = new THREE.MeshPhysicalMaterial({color, roughness: .5, metalness: 0, clearcoat: .3, clearcoatRoughness: .4});
    device.add(new THREE.Mesh(body, [face, edge]));

    // The screen: the capture on a rounded rectangle just in front of the face, unlit so it keeps its colors.
    const img = front.querySelector<HTMLImageElement>('.screen img')!;
    texture = await new THREE.TextureLoader().loadAsync(img.currentSrc || img.src);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const sw = W - 2 * bezel, sh = H - 2 * bezel;
    const plane = (z: number) => {
      const shape = new THREE.ShapeGeometry(roundedRect(sw, sh, Math.max(1, radius - bezel)), 48);
      const uv = shape.attributes.uv, pos = shape.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / sw + .5, pos.getY(i) / sh + .5);
      shape.translate(0, 0, z);
      return shape;
    };
    screenGeo = plane(.6);
    screenMat = new THREE.MeshBasicMaterial({map: texture, toneMapped: false});
    device.add(new THREE.Mesh(screenGeo, screenMat));

    // The glass: a soft reflection falling across the face from the upper left, as on a product shot.
    const sheen = document.createElement('canvas');
    sheen.width = 64; sheen.height = 256;
    const g = sheen.getContext('2d')!, grad = g.createLinearGradient(0, 0, 64, 256);
    grad.addColorStop(0, 'rgba(255,255,255,.1)'); grad.addColorStop(.38, 'rgba(255,255,255,.025)');
    grad.addColorStop(.39, 'rgba(255,255,255,0)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 64, 256);
    sheenTexture = new THREE.CanvasTexture(sheen);
    sheenTexture.colorSpace = THREE.SRGBColorSpace;
    glassGeo = plane(1.2);
    glassMat = new THREE.MeshBasicMaterial({map: sheenTexture, transparent: true, depthWrite: false, toneMapped: false});
    device.add(new THREE.Mesh(glassGeo, glassMat));

    renderer.render(scene, camera);

    // Copy to a plain 2D canvas and free the WebGL context so strips of cards never hit the browser's context cap.
    const output = document.createElement('canvas');
    output.className = 'device-3d';
    output.width = glCanvas.width;
    output.height = glCanvas.height;
    Object.assign(output.style, {position: 'absolute', left: '0', top: '0', width: `${cardW}px`, height: `${cardH}px`,
      zIndex: style.zIndex === 'auto' ? '2' : style.zIndex, pointerEvents: 'none'});
    output.getContext('2d')!.drawImage(glCanvas, 0, 0);
    main.append(output);
    front.style.visibility = 'hidden';
    return output;
  } finally {
    body?.dispose();
    face?.dispose();
    edge?.dispose();
    screenGeo?.dispose();
    screenMat?.dispose();
    glassGeo?.dispose();
    glassMat?.dispose();
    texture?.dispose();
    sheenTexture?.dispose();
    envRT?.dispose();
    pmrem.dispose();
    room.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
}

/** Every phone and tablet frame on the card as a 3D device, except on `flat` cards. */
export async function renderDevices(main: HTMLElement): Promise<void> {
  if (main.classList.contains('flat')) return;
  for (const front of main.querySelectorAll<HTMLElement>('.device:is(.device-frame-phone, .device-frame-iphone, .device-frame-tablet)'))
    await renderDevice(main, front);
}
