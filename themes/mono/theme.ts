// {{name}}: mono. Black and white only: a soft white light seen through a panel of fluted glass. Each vertical flute is
// a little cylindrical lens that bends the light behind it, catches a bright edge and falls into shadow at its seam,
// so the glow breaks into glassy ribs. Drawn by a shader from each pixel's place on the strip, so every seam continues.
// The light comes from theme.css (--background, --light) and the flutes from --flute (their width, in px).
import type {Theme} from 'screenshot-studio';

const GLASS = /* glsl */ `
// The light behind the glass: a broad glow behind each card's device and a slow drift of brightness along the strip.
float light(vec2 p) {
  float y = p.y / u_size.y, landscape = step(u_size.y, u_size.x), v = 0.;
  for (int k = 0; k < 64; k++) {
    if (float(k) >= u_cards) break;
    vec2 c = vec2((float(k) + mix(.5, .64, landscape)) * u_size.x, mix(.44, .4, landscape) * u_size.y);
    vec2 d = (p - c) / u_size.x;
    v += exp(-dot(d, d * vec2(1.2, 2.4)) * 3.);
    vec2 side = (p - vec2((float(k) + .06) * u_size.x, .86 * u_size.y)) / u_size.x;
    v += .8 * exp(-dot(side, side) * 9.);
  }
  v += .25 * smoothstep(.3, .85, fbm(vec2(p.x / u_size.x * .8, y * 1.4) + 3.)) * smoothstep(.2, .7, y);
  // Dark toward the floor (where a hanging device's words sit) and calmer on wide cards.
  v *= 1. - .85 * smoothstep(.58, .92, y);
  return clamp(v * mix(1., .4, landscape), 0., .9);
}

vec4 shade(vec2 p) {
  // The flute this pixel is in, and where across it (-1 at one seam, 1 at the other).
  float f = floor(p.x / u_flute), across = fract(p.x / u_flute) * 2. - 1.;
  float centre = (f + .5) * u_flute;
  // A cylindrical lens: the light behind is seen squeezed and mirrored, so each flute shows a little window of it.
  float bend = asin(clamp(across, -.999, .999)) / 1.5708;
  // The light stays off the words, whatever the layout.
  float seen = light(vec2(centre - bend * u_flute * 2.4, p.y)) * (1. - .95 * copyShade(p, 240.));
  // Lit along one side, dark in the seam between flutes.
  float curve = sqrt(max(0., 1. - across * across));
  float edge = pow(max(0., 1. - abs(across + .55) * 4.), 2.) * .22;
  float shadow = smoothstep(.75, 1., abs(across)) * .45;
  float v = seen * (.72 + .28 * curve) + edge * seen - shadow * seen * .8;
  vec3 color = mixOklab(u_background, u_light, clamp(v, 0., 1.));
  color += (hash(p * 1.7) - .5) * .02;
  return vec4(color, 1.);
}`;

export default {
  continuous: true,
  shader: ({W}) => ({source: GLASS, uniforms: {u_light: 'var(--light)', u_flute: Math.round(W / 18)}}),
} satisfies Theme;
