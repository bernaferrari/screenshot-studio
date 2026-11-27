// Shader backgrounds: a theme's `shader` is GLSL drawn under its art, once per card. The theme writes one function,
// `vec4 shade(vec2 p)`, where p is the pixel's place on the whole strip in CSS pixels (x along the strip, y down), so
// a background continues across every seam on its own. The studio supplies the uniforms, the theme's colors and the
// usual helpers (noise, fbm, oklab mixing), and dithers the result so gradients don't band in a JPEG.
import type {ShaderSpec, ThemeContext} from '../core/types';

const HEADER = `#version 300 es
precision highp float;
uniform vec2 u_size;      // this card, in CSS pixels
uniform vec2 u_offset;    // where this card starts on the strip
uniform vec2 u_strip;     // the whole strip: cards x width, height
uniform float u_index;    // this card's position, from 0
uniform float u_cards;    // how many cards the strip has
uniform float u_scale;    // device pixels per CSS pixel
uniform vec3 u_background, u_foreground, u_primary; // the theme's --background, --foreground and --primary, sRGB 0-1
uniform vec4 u_copy;      // the headline and its line below on this card: x, y, width, height in CSS pixels (0 when none)
out vec4 o_color;

float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 toSrgb(vec3 c) { c = max(c, 0.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toOklab(vec3 c) {
  c = toLinear(c);
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, 0.0), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
vec3 fromOklab(vec3 lab) {
  vec3 lms = mat3(1.0, 1.0, 1.0, 0.3963377774, -0.1055613458, -0.0894841775, 0.2158037573, -0.0638541728, -1.2914855480) * lab;
  return toSrgb(mat3(4.0767416621, -1.2684380046, -0.0041960863, -3.3077115913, 2.6097574011, -0.7034186147, 0.2309699292, -0.3413193965, 1.7076147010) * (lms * lms * lms));
}
/**
 * How near p (a strip position) is to this card's words: 1 behind them, falling off softly in an oval reach px past
 * them, and to 0 at the card's left and right edges, so a shader that dims the light here still meets its neighbours.
 */
float copyShade(vec2 p, float reach) {
  if (u_copy.z <= 0.) return 0.;
  vec2 local = p - u_offset, centre = u_copy.xy + u_copy.zw * .5, radius = u_copy.zw * .5 + reach;
  vec2 q = (local - centre) / radius;
  float edges = smoothstep(0., reach, min(local.x, u_size.x - local.x));
  return exp(-dot(q, q) * 2.2) * edges;
}
/** An 8 x 8 ordered (Bayer) threshold in [0, 1) for a pixel: step(bayer(p), value) dithers a value into dots. */
float bayer(vec2 p) {
  // Each bit of x and y picks from the 2 x 2 pattern [0 2; 3 1]; the lowest bits weigh the most.
  vec2 q = mod(floor(p), 8.);
  float v = 0.;
  for (int i = 0; i < 3; i++) { vec2 b = mod(floor(q / exp2(float(i))), 2.); v += exp2(float(2 * (2 - i))) * mod(2. * b.x + 3. * b.y, 4.); }
  return (v + .5) / 64.;
}
/** Mix two sRGB colors through oklab, so the way between them stays bright and clean. */
vec3 mixOklab(vec3 a, vec3 b, float t) { return fromOklab(mix(toOklab(a), toOklab(b), t)); }
`;

const FOOTER = `
void main() {
  vec2 local = vec2(gl_FragCoord.x, u_size.y * u_scale - gl_FragCoord.y) / u_scale;
  vec4 color = shade(u_offset + local);
  // Dither by half a step of 8-bit color: no bands in the gradients, nothing visible.
  color.rgb += (hash(gl_FragCoord.xy + 0.37) - 0.5) / 255.0;
  o_color = vec4(color.rgb * color.a, color.a);
}`;

/** A CSS color (any syntax, var() too) as sRGB 0-1, resolved against `node`. */
function rgbOf(node: HTMLElement, color: string): [number, number, number] {
  const probe = document.createElement('span');
  probe.style.color = color;
  node.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const paint = document.createElement('canvas').getContext('2d', {willReadFrequently: true})!;
  paint.fillStyle = resolved;
  paint.fillRect(0, 0, 1, 1);
  const [r, g, b] = paint.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // `#line 1` before the theme's code makes the log's line numbers its own.
    const log = (gl.getShaderInfoLog(shader) || '').replace(/\0/g, '').replace(/ERROR: 0:(\d+):/g, 'line $1:');
    throw new Error(`The theme's shader doesn't compile:\n${log.trim()}`);
  }
  return shader;
}

/**
 * Draw a theme's shader for this card into a canvas the size of the card, and return the canvas (a 2D copy, so the
 * GL context is released at once). README cards (`alone`) are a strip of one.
 */
export function drawShader(ctx: ThemeContext, spec: string | ShaderSpec, alone: boolean): HTMLCanvasElement {
  const {W, H, index, slides, main} = ctx;
  const {source, uniforms = {}} = typeof spec === 'string' ? {source: spec} : spec;
  const scale = window.devicePixelRatio || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * scale);
  canvas.height = Math.round(H * scale);
  const gl = canvas.getContext('webgl2', {premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false});
  if (!gl) throw new Error('This browser has no WebGL2, which the theme\'s shader needs.');
  try {
    const custom = Object.entries(uniforms).map(([name, value]) =>
      `uniform ${typeof value === 'string' ? 'vec3' : Array.isArray(value) ? `vec${value.length}` : 'float'} ${name};`).join('\n');
    const program = gl.createProgram()!;
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, '#version 300 es\nin vec2 a;void main(){gl_Position=vec4(a,0,1);}'));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, `${HEADER}${custom}\n#line 1\n${source}\n${FOOTER}`));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`The theme's shader doesn't link: ${gl.getProgramInfoLog(program)}`);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(program, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const set = (name: string, value: number | number[]) => {
      const at = gl.getUniformLocation(program, name);
      if (!at) return;
      const v = typeof value === 'number' ? [value] : value;
      [gl.uniform1fv, gl.uniform2fv, gl.uniform3fv, gl.uniform4fv][v.length - 1].call(gl, at, v);
    };
    const cards = alone ? 1 : slides.length, at = alone ? 0 : index;
    set('u_size', [W, H]);
    set('u_offset', [at * W, 0]);
    set('u_strip', [cards * W, H]);
    set('u_index', at);
    set('u_cards', cards);
    set('u_scale', scale);
    // The words' box, so a shader can keep its light off them in any layout.
    const header = main.querySelector('header'), frame = main.getBoundingClientRect(), zoom = frame.width / W || 1;
    const box = header?.getBoundingClientRect();
    set('u_copy', box && box.width ? [(box.left - frame.left) / zoom, (box.top - frame.top) / zoom, box.width / zoom, box.height / zoom] : [0, 0, 0, 0]);
    for (const token of ['background', 'foreground', 'primary']) set(`u_${token}`, rgbOf(main, `var(--${token}, ${token === 'foreground' ? '#fff' : '#000'})`));
    for (const [name, value] of Object.entries(uniforms)) set(name, typeof value === 'string' ? rgbOf(main, value) : value);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    // Keep the pixels, let the GL context go: a gallery renders many cards.
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d')!.drawImage(canvas, 0, 0);
    return copy;
  } finally {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
