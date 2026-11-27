// {{name}}: aurora. A real aurora over the whole strip, drawn by a shader: curtains of fine rays, each with a sharp
// bright hem that folds and breaks along the sky, green where it is brightest rising into a violet fringe, over a
// field of stars. It is computed from each pixel's place on the strip, so every seam continues. Colors come from
// theme.css (--background, --primary and --fringe), so re-branding is three shadcn/ui tokens.
import type {Theme} from 'screenshot-studio';

const SKY = /* glsl */ `
// One curtain: its hem (a fraction of the height, before folding), how far its rays rise, and how bright it is.
vec3 curtain(vec2 p, float y, float hem, float rise, float strength, float seed) {
  float x = p.x / u_size.y;                       // along the strip, in card heights
  // The hem folds slowly along the sky, with a quicker ripple on top.
  float fold = (fbm(vec2(x * .55 + seed, seed)) - .5) * .2 + sin(x * 2.3 + seed * 4.) * .025;
  float h = hem + fold;
  float d = h - y;                                // above the hem: positive
  // Fine vertical rays, bent a little with the fold so they follow the curtain.
  float bend = fold * 1400. + (fbm(vec2(x * 4., y * 1.5 + seed)) - .5) * 60.;
  float fine = noise(vec2((p.x + bend) / 11., y * 1.8 + seed)), broad = noise(vec2((p.x + bend) / 46., seed * 3.));
  float rays = .3 + .7 * smoothstep(.2, .95, fine * .55 + broad * .45);
  // Bright and sharp at the hem, fading upward; gone just below it. Some stretches of the curtain are dark.
  float body = d > 0. ? exp(-d / rise) : exp(d / .006);
  float gaps = smoothstep(.3, .62, fbm(vec2(x * 1.2 + seed * 9., 3.1)));
  float glow = body * rays * gaps * strength;
  // Green at the hem, violet where the rays fade, and a faint red-violet crown above them.
  vec3 color = mixOklab(u_primary, u_fringe, smoothstep(rise * .2, rise * 1.6, d));
  float crown = d > 0. ? exp(-pow((d - rise * 2.) / (rise * 1.2), 2.)) * .35 : 0.;
  return color * glow + u_fringe * crown * gaps * strength * (.5 + .5 * broad);
}

vec4 shade(vec2 p) {
  float y = p.y / u_size.y;
  // The sky: deepest overhead, a breath of the aurora's green toward the horizon.
  vec3 sky = mixOklab(u_background * .55, u_background, smoothstep(0., .7, y));
  sky = mixOklab(sky, mixOklab(u_background, u_primary, .22), smoothstep(.55, 1., y) * .8);
  // Stars: one in a few cells, bright ones rare, fading toward the horizon.
  vec2 cell = floor(p / 22.), inner = fract(p / 22.) - .5;
  float star = hash(cell);
  vec2 spot = vec2(hash(cell + 3.1), hash(cell + 7.7)) - .5;
  float size = mix(.035, .09, pow(hash(cell + 1.3), 6.));
  float stars = step(.93, star) * smoothstep(size, 0., length(inner - spot * .7)) * (1. - smoothstep(.25, .6, y));
  vec3 color = sky + u_foreground * stars * (.4 + .6 * hash(cell + 5.));
  // Three curtains, the brightest in front.
  // The curtains part around the words, whatever the layout.
  float clear = 1. - .85 * copyShade(p, 160.);
  color += (curtain(p, y, .37, .08, .4, 11.) + curtain(p, y, .46, .11, 1.15, 2.) + curtain(p, y, .55, .08, .55, 5.)) * clear;
  return vec4(color, 1.);
}`;

export default {
  continuous: true,
  shader: {source: SKY, uniforms: {u_fringe: 'var(--fringe)'}},
} satisfies Theme;
