import * as THREE from 'three';
import shaderop from './shaderop.js';

export const func_rand = `
float rand(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}
`;

export const checkers = `
#include <common>
uniform vec2 dim;
uniform float time;

void main() {
    vec2 uv = gl_FragCoord.xy / dim.xy;
    vec3 col = 0.5 + 0.5*cos(time+uv.xyx*40.0+vec3(0,2,4));
    gl_FragColor = vec4(col,1.0);
}
`;

export const copy = `
#include <common>
uniform sampler2D source;
uniform vec2 dim;
void main() {
  gl_FragColor = texture2D(source, gl_FragCoord.xy / dim);
}
`

export const color = `
#include <common>
uniform vec4 color;
void main() {
  gl_FragColor = color;
}
`

export const noise = `
#include <common>
uniform vec2 dim;
uniform float time;
void main() {
  gl_FragColor = vec4(
    rand(gl_FragCoord.xy / dim + vec2(1.0 * time)),
    rand(gl_FragCoord.xy / dim + vec2(2.0 * time)),
    rand(gl_FragCoord.xy / dim + vec2(3.0 * time)),
    rand(gl_FragCoord.xy / dim + vec2(4.0 * time))
  );
}
`;

export const env_pressure = `
#include <common>
uniform vec2 dim;
uniform float dx;
uniform vec2 gravity;
uniform vec2 origin;
uniform float dry_cp;
uniform float dry_cv;
uniform float p0;
uniform float T0;
uniform float z0;
uniform float lapse;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;

  float gmag = length(gravity);			  // m / s^2
  vec2 normgrav = normalize(gravity);

  float z = dot((uv - origin) * dim - vec2(.5, .5), -normgrav) * dx + z0; // m

  // Tropopause temp is ~constant at -56.5C from 11km to 20km
  float T = T0 - min(z, 11000.) * (lapse / 500.);	// K
  float p = p0 * pow(T / T0, gmag / ((lapse / 500.) * (dry_cp - dry_cv))); // kPa

  gl_FragColor = vec4(p, T, z, 1.);
}
`;

export const add_velocity = `
#include <common>
uniform vec2 dim;
uniform float radius;
uniform sampler2D velocity;
uniform vec2 add;
uniform vec2 position;

void main() {
  vec2 uv = gl_FragCoord.xy / dim.xy;
  vec2 vel = texture2D(velocity, uv).xy;
  float d = length(position - uv);
  vec2 newvel = vel + vec2(float(d < radius)) * dir;
  gl_FragColor = vec4(newvel, 0., 1.);
}
`;

export const advect = `
uniform vec2 dim;
uniform vec3 dissipation;
uniform float dt;
uniform float dx;
uniform vec2 periodic;

uniform sampler2D density;
uniform sampler2D velocity;
uniform sampler2D obstacles;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  vec2 vel = texture2D(velocity, uv).xy;
  vec4 obs = texture2D(obstacles, uv);

  float dtdx = dt / dx;
  vec2 adjust = vec2(dtdx,dtdx) * (vel.xy / dim);
  vec2 src_coord = uv - adjust;
  src_coord = vec2(
    periodic.x * src_coord.x + (1. - periodic.x) * clamp(src_coord.x, 0., 1.),
    periodic.y * src_coord.y + (1. - periodic.y) * clamp(src_coord.y, 0., 1.)
  );

  vec4 src_dns = texture2D(density, src_coord);
  vec4 src_mask = texture2D(obstacles, src_coord);
  vec3 src_val = src_mask.www * src_mask.xyz + (1. - src_mask.www) * src_dns.xyz;

  gl_FragColor = vec4(
      obs.www * obs.xyz +
      (1. - obs.www) * (
          src_val.xyz * dissipation +
          (1. - dissipation) * obs.xyz
      ),
      1
  );
}
`;

export const struct_neighbors = `
struct neighbors {
    vec4 left;
    vec4 right;
    vec4 up;
    vec4 down;
};
`;

export const func_nearest_neighbors = `
neighbors nearest_neighbors(sampler2D tex, vec2 coord) {
	vec2 px = 1. / dim;
	return neighbors(
	    texture2D(tex, coord - vec2(px.x, 0)),
	    texture2D(tex, coord + vec2(px.x, 0)),
	    texture2D(tex, coord - vec2(0, px.y)),
	    texture2D(tex, coord + vec2(0, px.y))
	);
}
`;

export const func_mask_neighbors = `
neighbors mask_neighbors(sampler2D tex, sampler2D mask, vec2 coord) {
    neighbors m = nearest_neighbors(mask, coord);
	neighbors n = nearest_neighbors(tex, coord);
    return neighbors(
	    (1. - m.left.w) * n.left + m.left.w * m.left,
   	(1. - m.right.w) * n.right + m.right.w * m.right,
	    (1. - m.up.w) * n.up + m.up.w * m.up,
	    (1. - m.down.w) * n.down + m.down.w * m.down
	);
}
`;

export const func_mask_neighbors_replace = `
neighbors mask_neighbors_replace(sampler2D tex, sampler2D mask, vec2 coord, vec4 replace) {
	// Replace masked pixels by the center pixel.
	// Replace is a vector of binary values for left, right, up, down.
	// If the flag is 1, replace by the center pixel. Otherwise, use 0.

	neighbors m = nearest_neighbors(mask, coord);
	neighbors n = nearest_neighbors(tex, coord);
	vec4 c = texture2D(tex, coord);
	vec2 px = 1. / dim;

	vec4 zero = vec4(
		(replace.x > 0.) || ((coord.x - px.x) > 1.),
		(replace.y > 0.) || ((coord.x + px.x) < (dim.x - px.x)),
		(replace.z > 0.) || ((coord.y - px.y) > 1.),
		(replace.w > 0.) || ((coord.y + px.y) < (dim.y - px.y))
	);

    return neighbors(
	    m.left.w * (zero.x * c) + (1. - m.left.w) * n.left,
	    m.right.w * (zero.y * c) + (1. - m.right.w) * n.right,
	    m.up.w * (zero.z * c) + (1. - m.up.w) * n.up,
	    m.down.w * (zero.w * c) + (1. - m.down.w) * n.down
	);
}
`;

export const divergence = `
#include <common>
uniform vec2 dim;
uniform float dx;

uniform sampler2D velocity;
uniform sampler2D obstacles;
` + struct_neighbors + func_nearest_neighbors + func_mask_neighbors + `
float div3x3_mask(sampler2D tex, sampler2D mask, vec2 coord) {
	neighbors vel = mask_neighbors(tex, mask, coord);
	return (vel.right.x - vel.left.x + vel.down.y - vel.up.y) * 0.5;
}

void main() {
    vec2 uv = gl_FragCoord.xy / dim;

    // Divergence: (m / s) / (m / px) = px / s
    float div = div3x3_mask(velocity, obstacles, uv) / dx;
    gl_FragColor = div * vec4(1., 1., 1., 1.);
}
`;

export const jacobi_pressure = `
#include <common>
uniform sampler2D pressure;
uniform sampler2D divergence;
uniform sampler2D obstacles;
uniform vec4 closed;
uniform float dx;
uniform vec2 dim;
` + struct_neighbors + func_nearest_neighbors + func_mask_neighbors_replace + `
void main() {
    vec2 uv = gl_FragCoord.xy / dim;
    vec4 obs = texture2D(obstacles, uv);
    vec4 div = texture2D(divergence, uv);

    // Total pressure from neighboring pixels.
    neighbors p = mask_neighbors_replace(pressure, obstacles, uv, closed);
    float ptot = p.left.x + p.right.x + p.up.x + p.down.x;

    // (m^2 / px^2) * (px / s) = m^2 / px s.
    // Gradient subtraction later is (m^2 / px s) / (m / px) = m / s.
    float pupdate = (1. - obs.w) * ((ptot - ((dx * dx) * div.x)) * 0.25);
    gl_FragColor = pupdate * vec4(1.,1.,1.,1.);
}
`;

export const subtract_gradient = `
uniform sampler2D velocity;
uniform sampler2D pressure;
uniform sampler2D obstacles;

uniform vec2 dim;
uniform float dx;
uniform vec4 closed;
` + struct_neighbors + func_nearest_neighbors + func_mask_neighbors_replace + `
vec2 grad3x3_mask_replace(sampler2D tex, sampler2D mask, vec2 coord, vec4 replace) {
	neighbors s = mask_neighbors_replace(tex, mask, coord, replace);
	return vec2(s.right.x - s.left.x, s.down.x - s.up.x) * 0.5;
}

void main() {
    vec2 uv = gl_FragCoord.xy / dim;
    vec4 vel = texture2D(velocity, uv);

    // m/s / m/px -> px/s, m/s - m^2/(px s) / m/px -> m/s - m/s
    vec2 newvel = vel.xy - grad3x3_mask_replace(pressure, obstacles, uv, closed) / dx;
    gl_FragColor = vec4(newvel, 0, 0);
}
`;

export const buoyancy = `
#include <common>
uniform vec2 gravity;
uniform float T0;
uniform float dt;
uniform float dry_cp;
uniform float dry_cv;
uniform float vapor_cp;
uniform float vapor_cv;

uniform vec2 dim;

uniform sampler2D water_and_temp;
uniform sampler2D env_pressure;
uniform sampler2D obstacles;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;

  vec3 ql_qv_ptemp = texture2D(water_and_temp, uv).xyz;
  vec2 p_ptempref = texture2D(env_pressure, uv).xz;
  float obs = texture2D(obstacles, uv).w;

  float Rd = dry_cp - dry_cv;		// J / kg K
  float Rv = vapor_cp - vapor_cv;	// J / kg K
  float eps = Rd / Rv;				// 1 / 1

  float ql = ql_qv_ptemp.x;
  float qv = ql_qv_ptemp.y;
  float ptemp_hat = ql_qv_ptemp.z;
  float p = p_ptempref.x;
  float ptempref = p_ptempref.y;

  float exner = pow(p * 0.01, Rd / dry_cp);

  // TODO: Doublecheck use of T0 here for reference temp . . .
  // W. R. Cotton et al, Storm and Cloud Dynamics, p. 40, eq. 2.67
  float ratio = ptemp_hat / (273.15 / exner) + (1. / eps - 1.) * qv - ql;	// K/K + g/g

  // Harris 2003 Graphics Hardware
  float ratio_h = ptemp_hat / T0 + 0.61 * qv - ql;

  vec2 accel = -gravity.xy * ratio;				// m / s^2
  gl_FragColor = vec4(vec2((1. - obs) * dt) * accel * vec2(10000000), 0., 1.);	// m / (s frame)
}
`

export const vorticity_magnitude = `
#include <common>
uniform vec2 dim;
uniform vec4 closed;
uniform sampler2D velocity;
uniform sampler2D obstacles;
` + struct_neighbors + func_nearest_neighbors + func_mask_neighbors_replace + `
float curl3x3_mask_replace(sampler2D tex, sampler2D mask, vec2 coord, vec4 replace) {
	neighbors v = mask_neighbors_replace(tex, mask, coord, replace);
	return ((v.right.y - v.left.y) - (v.down.x - v.up.x)) * 0.5;
}

void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  vec4 obs = texture2D(obstacles, uv);

  gl_FragColor = vec4((1. - obs.w) * curl3x3_mask_replace(velocity, obstacles, uv, closed), 0., 0., 1.); // m / s
}
`;


export const vorticity_confinement = `
#include <common>
uniform float vorticity_confinement;
uniform float dt;
uniform float dx;
uniform vec2 dim;

uniform sampler2D vorticity;
uniform sampler2D obstacles;

` + struct_neighbors + func_nearest_neighbors + `
void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  float vtc = texture2D(vorticity, uv).x;
  float obs = texture2D(obstacles, uv).w;

  // Normalized vorticity magnitude gradient, transposed.
  neighbors vt = nearest_neighbors(vorticity, uv);
  vec2 eta_t = vec2(abs(vt.down.x) - abs(vt.up.x), abs(vt.right.x) - abs(vt.left.x));	// m / s
  vec2 N_t = eta_t / vec2(max(length(eta_t), 2.4414e-4));

  // m / s * px / m = px / s, so don't * by dx
  // Output additional velocity. m / s
  gl_FragColor = vec4(vec2(1. - obs) * vec2(1., -1.) * N_t * vec2(vorticity_confinement * vtc * dt * 0.5 / dx), 0., 1.);
}
`

export const add = `
#include <common>
uniform sampler2D one;
uniform sampler2D two;
uniform vec2 dim;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  gl_FragColor = texture2D(one, uv) + texture2D(two, uv);
}
`;

export const add_vec2 = `
#include <common>
uniform sampler2D source;
uniform vec2 add;
uniform vec2 dim;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  gl_FragColor = texture2D(source, uv) + vec4(add, 0, 0);
}
`

export const add_scaled = `
#include <common>
uniform sampler2D one;
uniform sampler2D two;
uniform vec4 scale_one;
uniform vec4 scale_two;
uniform vec2 dim;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  gl_FragColor = scale_one * texture2D(one, uv) + scale_two * texture2D(two, uv);
}
`;

export const add_mouse_vec2 = `
#include <common>
uniform vec2 dim;
uniform vec3 mouse;
uniform vec4 multiplier;
uniform float radius;
uniform float sharpness;
uniform sampler2D source;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  vec2 scale = dim / vec2(max(dim.x, dim.y));
  float d = length(scale  * (uv - mouse.xy));
  float s = mouse.z * (1. - clamp(d / radius, 0., 1.));//smoothstep(0., radius, d));
  vec4 src = texture2D(source, uv);
  gl_FragColor = src + vec4(s) * multiplier;
}
`;

export const water_continuity = `
#include <common>
uniform float T0;
uniform float p0;
uniform float vapor_cp;
uniform float vapor_cv;
uniform float dry_cp;
uniform float dry_cv;
uniform float dx;
uniform float Lv;
uniform sampler2D water_and_temp;
uniform sampler2D env_pressure;
uniform vec2 dim;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  vec4 ql_qv_ptemp = texture2D(water_and_temp, uv);
  vec4 env = texture2D(env_pressure, uv);

  float Rv = vapor_cp - vapor_cv;	// J / (kg K)
  float Rd = dry_cp - dry_cv;		// J / (kg K)
  float eps = Rd / Rv;

  // Variables.
  float liq = ql_qv_ptemp.x;				// g liq / g dry
  float vap = ql_qv_ptemp.y;				// g vap / g dry
  float ptemp_hat = ql_qv_ptemp.z;	// K
  float p = env.x;	        				// kPa

  float exner = pow(p / p0, Rd / dry_cp);

  // Clausius-Clapeyron, Stull (2015) Meteo. for Sci. & Eng., 3rd ed.
  float T = ptemp_hat * exner + env.y;				// K,		p. 61
  /*
    svp = .611 * exp((Lv / Rv) * (1 / 273.15 - 1 / T));	// kPa, 	p. 88

    // Saturation mixing ratio: "maximum" mixing ratio of vapor in parcel.
    float mix = eps * svp / (p - eps * svp);			// g vap / g dry, 	p. 91

    // I feel like maybe I should find actual mixing ratio . . . ?

    // Don't evaporate more liquid than is in the parcel. Harris 2003
    float evap = min(mix - vap, liq);							// g vap / g dry
  */
  // Harris method. -- simpler, doesn't need Lv
  float TC = T - 273.15;
  float mix_h = 380.16 / (p * 1000.) * exp((17.67 * TC) / (TC + 243.5));
  float evap_h = min(mix_h - vap, liq);	// 0-1

  // Lifted condensation level (LCL)
  /*
    Td = 1 / (					// dew point temperature, K
	    1 / 273.15 - Rv / Lv * log(
		    ((vap + evap) * p) / (101.3 * ((vap + evap) + eps))
	    )
    );
    lcl = 0.125 * (T - Td);
  */

  // Output.
  gl_FragColor = vec4(
    liq - evap_h, // New liquid
    vap + evap_h, // New vapor
    ptemp_hat,    // New potential temperature
    -evap_h       // Condensation rate
  );
}
`

export const thermodynamics = `
uniform float vapor_cp;		// J / kg K
uniform float vapor_cv;		// J / kg K
uniform float dry_cp;			// J / kg K
uniform float dry_cv;			// J / kg K
uniform float p0;	    			// kPa
uniform float Lv;   			// J / kg
uniform float dt;
uniform vec2 dim;

uniform sampler2D water_temp_and_condensation;
uniform sampler2D env_pressure;

void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  vec4 ql_qv_ptemp_C = texture2D(water_temp_and_condensation, uv);
  vec4 env = texture2D(env_pressure, uv);

  float Rv = vapor_cp - vapor_cv;	// J / kg K
  float Rd = dry_cp - dry_cv;		  // J / kg K

  // Variables.
  float C = ql_qv_ptemp_C.w;    		// 0-1
  float p = env.x;	            		// kPa

  // Compute.
  float exner = pow(p / p0, Rd / dry_cp);
  float dptemp = -(Lv * C) / (dry_cp * exner);

  // Output: qc, qv, potential temperature
  gl_FragColor = ql_qv_ptemp_C + vec4(0, 0, dptemp, 0);
}
`

export const jacobi_diffusion = `
#include <common>
uniform vec2 dim;
uniform float dt;
uniform float viscosity;
uniform float gain;
uniform sampler2D velocity_texture;
uniform sampler2D viscosity_texture;
uniform sampler2D obstacles_texture;
` + struct_neighbors + func_nearest_neighbors + func_mask_neighbors + `
void main() {
  vec2 uv = gl_FragCoord.xy / dim;

  float viscdt = (texture2D(viscosity_texture, uv).x * gain + viscosity) * dt;

  // Total velocity from neighboring pixels.
  neighbors v = mask_neighbors(velocity_texture, obstacles_texture, uv);

  gl_FragColor = (                      // New velocity.
    texture2D(velocity_texture, uv) +
    vec4(viscdt) * (
	    v.left + v.right + v.up + v.down
    ) / vec4(1. + 4. * viscdt)
  ) * vec4(1. - texture2D(obstacles_texture, uv).w);
}
`;

const colormap_common_preamble = `
#include <common>
uniform vec4 contrast;
uniform vec4 high;
uniform vec4 low;
uniform vec4 source_vars;
uniform vec2 dim;
uniform sampler2D source;
`;

const colormap_common_body = `
void main() {
  vec2 uv = gl_FragCoord.xy / dim;
  vec4 src = texture2D(source, uv);
  vec4 mapped =
    vec4(equal(source_vars, vec4(0.))) * vec4(src.x) +
    vec4(equal(source_vars, vec4(1.))) * vec4(src.y) +
    vec4(equal(source_vars, vec4(2.))) * vec4(src.z) +
    vec4(equal(source_vars, vec4(3.))) * vec4(src.w);

  vec4 scaled = clamp(pow((mapped - low) / (high - low), contrast), vec4(0),vec4(1.));
`;

export const colormap_2d_signed =
colormap_common_preamble + `
uniform sampler2D colormap;
` + colormap_common_body + `
  gl_FragColor = vec4(texture2D(colormap, vec2(scaled.x, 1.-scaled.y)).rgb, 1);
}
`
export const colormap_watertemp =
colormap_common_preamble + `
uniform sampler2D background;
` + colormap_common_body + `
  vec4 bgtex = texture2D(background, uv);

	float temp = ((mapped.z + bgtex.y) - low.z) / (high.z - low.z);
	temp = contrast.z == 1. ? temp : pow(temp, contrast.z);

	vec3 bg = vec3(temp, 0., 0.3);
	vec3 vap = vec3(0., scaled.y / 1.25, scaled.y);
	vec3 liq = scaled.xxx;

	vec3 sky = bg + vap + liq;

  gl_FragColor = vec4(clamp(sky, vec3(0.), vec3(1.)), 1);
}
`;

export const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const add_shaders = function(shaders, uniforms, renderer, camera) {
  let add_shader = function(fragment, shader_uniforms, name, prerender) {
    Object.entries(shader_uniforms).map(([key, uniform]) => {
      if (uniform.value === undefined) {
        shader_uniforms[key] = { value: uniform };
      }
    });

    shaders[name] = new shaderop(
      fragment, shader_uniforms, renderer, camera, name
    );

    if (prerender !== undefined) shaders[name].prerender = prerender;
  }

  // Constants.
  add_shader(color, { color: new THREE.Vector4(0, 0, 0, 0) }, 'black');
  add_shader(color, { color: new THREE.Vector4(1, 1, 1, 1) }, 'white');
  add_shader(noise, { 
    dim: uniforms.simulation.dim,
    time: uniforms.simulation.time
  }, 'noise');

  add_shader(env_pressure, {
    dim: uniforms.simulation.dim,
    origin: uniforms.simulation.origin,
    dx: uniforms.dynamics.dx,
    gravity: uniforms.environment.gravity,
    T0: uniforms.environment.T0,
    dry_cp: uniforms.environment.dry_cp,
    dry_cv: uniforms.environment.dry_cv,
    p0: uniforms.environment.p0,
    T0: uniforms.environment.T0,
    z0: uniforms.environment.z0,
    lapse: uniforms.environment.lapse
  }, 'env_pressure');

  // External water.
  add_shader(add_scaled, {
    dim: uniforms.simulation.dim,
    one: shaders.black.texture.texture,
    two: shaders.black.texture.texture,
    scale_one: new THREE.Vector4(1,1,1,1),
    scale_two: new THREE.Vector4(0.000001, 0,0,0)
  }, 'add_watertemp');

  add_shader(add_vec2, {
    dim: uniforms.simulation.dim,
    source: shaders.black.texture.texture,
    add: uniforms.additional.wind
  }, 'add_wind');

  add_shader(add_mouse_vec2, {
    dim: uniforms.simulation.dim,
    source: shaders.black.texture.texture,
    mouse:  new THREE.Vector3(0, 0, 0),
    multiplier: new THREE.Vector4(),
    radius: 0.1,
    sharpness: uniforms.external.mouse_sharpness
  }, 'add_mouse_to_density');

  add_shader(add_mouse_vec2, {
    dim: uniforms.simulation.dim,
    source: shaders.black.texture.texture,
    mouse:  shaders.add_mouse_to_density.uniforms.mouse,
    multiplier: new THREE.Vector4(),
    radius: shaders.add_mouse_to_density.uniforms.radius,
    sharpness: shaders.add_mouse_to_density.uniforms.sharpness
  }, 'add_mouse_to_velocity');

  // Advection.
  add_shader(advect, {
    dim: uniforms.simulation.dim,
    dx: uniforms.dynamics.dx,
    dt: uniforms.dynamics.dt,
    periodic: uniforms.simulation.periodic,
    dissipation: uniforms.dynamics.dissipation_density,
    velocity: shaders.add_mouse_to_velocity.texture.texture,
    density: shaders.add_mouse_to_density.texture.texture,
    obstacles: shaders.black.texture.texture
  }, 'advect_density');

  add_shader(advect, {
    dim: uniforms.simulation.dim,
    dx: uniforms.dynamics.dx,
    dt: uniforms.dynamics.dt,
    periodic: uniforms.simulation.periodic,
    dissipation: uniforms.dynamics.dissipation_velocity,
    velocity: shaders.add_mouse_to_velocity.texture.texture,
    density: shaders.add_mouse_to_velocity.texture.texture,
    obstacles: shaders.black.texture.texture
  }, 'advect_velocity');

  // Viscosity.
  add_shader(jacobi_diffusion, {
    dim: uniforms.simulation.dim,
    dt: uniforms.dynamics.dt,
    viscosity: uniforms.dynamics.viscosity,
    gain: uniforms.external.viscosity_gain,
    velocity_texture: shaders.advect_velocity.texture.texture,
    viscosity_texture: shaders.white.texture.texture,
    obstacles_texture: shaders.black.texture.texture
  }, 'jacobi_diffusion');

  add_shader(copy, {
    dim: uniforms.simulation.dim,
    source: shaders.jacobi_diffusion.texture.texture
  }, 'set_viscosity_velocity');

  // Additional forces.
  add_shader(buoyancy, {
    gravity: uniforms.environment.gravity,
    T0: uniforms.environment.T0,
    dry_cp: uniforms.environment.dry_cp,
    dry_cv: uniforms.environment.dry_cv,
    vapor_cp: uniforms.environment.vapor_cp,
    vapor_cv: uniforms.environment.vapor_cv,
    dim: uniforms.simulation.dim,
    dt: uniforms.dynamics.dt,
    water_and_temp: shaders.advect_density.texture.texture,
    env_pressure: shaders.env_pressure.texture.texture,
    obstacles: shaders.black.texture.texture
  }, 'buoyancy');

  add_shader(vorticity_magnitude, {
    dim: uniforms.simulation.dim,
    closed: uniforms.simulation.closed,
    velocity: shaders.buoyancy.texture.texture,
    obstacles: shaders.black.texture.texture
  }, 'vorticity_magnitude');

  add_shader(vorticity_confinement, {
    dim: uniforms.simulation.dim,
    dx: uniforms.dynamics.dx,
    dt: uniforms.dynamics.dt,
    vorticity_confinement: uniforms.dynamics.vorticity_confinement,
    vorticity: shaders.vorticity_magnitude.texture.texture,
    obstacles: shaders.black.texture.texture
  }, 'vorticity_confinement');

  add_shader(add, {
    dim: uniforms.simulation.dim,
    one: shaders.buoyancy.texture.texture,
    two: shaders.vorticity_confinement.texture.texture
  }, 'add_buoyancy_and_vorticity');

  add_shader(add, {
    dim: uniforms.simulation.dim,
    one: shaders.add_buoyancy_and_vorticity.texture.texture,
    two: shaders.advect_velocity.texture.texture
  }, 'add_forces_to_velocity');

  // Water continuity and thermodynamics.
  add_shader(water_continuity, {
    dim: uniforms.simulation.dim,
    dx: uniforms.dynamics.dx,
    T0: uniforms.environment.T0,
    p0: uniforms.environment.p0,
    dry_cp: uniforms.environment.dry_cp,
    dry_cv: uniforms.environment.dry_cv,
    vapor_cp: uniforms.environment.vapor_cp,
    vapor_cv: uniforms.environment.vapor_cv,
    Lv: uniforms.environment.Lv,
    water_and_temp: shaders.advect_density.texture.texture,
    env_pressure: shaders.env_pressure.texture.texture
  }, 'water_continuity');

  add_shader(thermodynamics, {
    dim: uniforms.simulation.dim,
    dt: uniforms.dynamics.dt,
    p0: uniforms.environment.p0,
    dry_cp: uniforms.environment.dry_cp,
    dry_cv: uniforms.environment.dry_cv,
    vapor_cp: uniforms.environment.vapor_cp,
    vapor_cv: uniforms.environment.vapor_cv,
    Lv: uniforms.environment.Lv,
    water_temp_and_condensation: shaders.water_continuity.texture.texture,
    env_pressure: shaders.env_pressure.texture.texture
  }, 'thermodynamics');

  // Incompressibility.
  add_shader(divergence, {
    dim: uniforms.simulation.dim,
    dx: uniforms.dynamics.dx,
    velocity: shaders.add_forces_to_velocity.texture.texture,
    obstacles: shaders.black.texture.texture
  }, 'divergence');

  add_shader(jacobi_pressure, {
    dim: uniforms.simulation.dim,
    dx: uniforms.dynamics.dx,
    closed: uniforms.simulation.closed,
    divergence: shaders.divergence.texture.texture,
    pressure: shaders.black.texture.texture,
    obstacles: shaders.black.texture.texture
  }, 'jacobi_pressure');

  add_shader(copy, {
    dim: uniforms.simulation.dim,
    source: shaders.jacobi_pressure.texture.texture
  }, 'set_pressure');

  add_shader(subtract_gradient, {
    dim: uniforms.simulation.dim,
    dx: uniforms.dynamics.dx,
    closed: uniforms.simulation.closed,
    pressure: shaders.set_pressure.texture.texture,
    obstacles: shaders.black.texture.texture,
    velocity: shaders.add_forces_to_velocity.texture.texture
  }, 'subtract_gradient');

  add_shader(copy, {
    dim: uniforms.simulation.dim,
    source: shaders.thermodynamics.texture.texture
  }, 'set_density');

  add_shader(copy, {
    dim: uniforms.simulation.dim,
    source: shaders.subtract_gradient.texture.texture
  }, 'set_velocity');

  shaders.add_wind.bind('source', shaders.set_velocity);
  shaders.add_mouse_to_density.bind('source', shaders.set_density);
  shaders.add_mouse_to_velocity.bind('source', shaders.set_velocity);

  add_shader(colormap_2d_signed, {
    dim: uniforms.simulation.dim,
    low: new THREE.Vector4(-0.1, -0.1, -0.1, -0.1),
    high: new THREE.Vector4(0.1, 0.1, 0.1, 0.1),
    contrast: new THREE.Vector4(1, 1, 1, 1),
    source_vars: new THREE.Vector4(0, 1, 2, 3),
    source: shaders.set_velocity.texture.texture,
    colormap: shaders.black.texture.texture
  }, 'vis_velocity');

  // Keep vis_velocity uniforms synced with GUI params each frame.
  shaders.vis_velocity.prerender = function(s) {
    const vv = uniforms.visualization.velocity;
    const lo = vv.low.value, hi = vv.high.value, co = vv.contrast.value;
    s.uniforms.low.value.set(lo, lo, lo, lo);
    s.uniforms.high.value.set(hi, hi, hi, hi);
    s.uniforms.contrast.value.set(co, co, co, co);
  };

  add_shader(colormap_watertemp, {
    dim: uniforms.simulation.dim,
    contrast: new THREE.Vector4(0.231, 0.0889, 1, 0),
    high: new THREE.Vector4(0.0048, 0.002, 785, 0),
    low: new THREE.Vector4(0, 0, 230, 0),
    source_vars: new THREE.Vector4(0, 1, 2, 3),
    source: shaders.set_density.texture.texture,
    background: shaders.env_pressure.texture.texture
  }, 'vis_density');

  // Keep vis_density uniforms synced with GUI params each frame.
  shaders.vis_density.prerender = function(s) {
    const vd = uniforms.visualization.density;
    s.uniforms.contrast.value.set(
      vd.contrast.liquid.value, vd.contrast.vapor.value, vd.contrast.temperature.value, 0);
    s.uniforms.low.value.set(
      vd.low.liquid.value, vd.low.vapor.value, vd.low.temperature.value, 0);
    s.uniforms.high.value.set(
      vd.high.liquid.value, vd.high.vapor.value, vd.high.temperature.value, 0);
  };

  var textureLoader = new THREE.TextureLoader();
  textureLoader.load(
    '/images/2d_signed_hue_metal.png',
    t => shaders.vis_velocity.uniforms.colormap.value = t
  );
}
