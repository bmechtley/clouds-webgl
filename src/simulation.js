import * as THREE from 'three';
import { add_shaders } from './shaders.js';
import { uniforms, guiparams } from './gui.js';

export default class simulation {
  // Set up the three.js scene.
  shaders = {};
  mice = [...new Array(10)].map(m => ({
    position: new THREE.Vector2(),
    velocity: new THREE.Vector2(),
    pending: [],   // mousemove positions collected between renders
    lastStamp: null,
    down: false
  }));
  first_frame = true;
  cpuTimings = {};
  gpuTimings = {};
  _pendingQueries = [];

  constructor(renderer, camera, stats) {
    this.renderer = renderer;
    this.camera = camera;
    this.stats = stats;
  }

  update_mouse(x, y, mice, mouse_index) {
    const dim = uniforms.simulation.dim.value;
    const position = new THREE.Vector2(x / dim.x, 1 - y / dim.y);
    const mouse = this.mice[mouse_index];
    if (!mouse) return;

    mouse.velocity.copy(position).sub(mouse.position)
      .multiplyScalar(uniforms.external.mouse_velocity.value);
    mouse.position.copy(position);
    if (mouse.down) mouse.pending.push(position.clone());
  };

  // Catmull-Rom interpolation between p1 and p2, with p0/p3 as tangent guides.
  _cr(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return new THREE.Vector2(
      0.5 * (2*p1.x + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
      0.5 * (2*p1.y + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
    );
  }

  start() {
    this.renderer.autoClearColor = false;
    add_shaders(this.shaders, uniforms, this.renderer, this.camera);
    this.first_frame = true;
    this.gl = this.renderer.getContext();
    this.timerExt = this.gl.getExtension('EXT_disjoint_timer_query_webgl2');
    requestAnimationFrame(this.render.bind(this));
  }

  _time(key, fn) {
    // CPU timing — always available, cheap.
    const cpuT = performance.now();
    fn();
    this.cpuTimings[key] = performance.now() - cpuT;

    // GPU timing — only when enabled (may stall on Metal).
    if (guiparams.gpu_profile && this.timerExt) {
      const q = this.gl.createQuery();
      this.gl.beginQuery(this.timerExt.TIME_ELAPSED_EXT, q);
      // Note: GPU query captures the GPU work queued by fn(), not fn() itself.
      this._pendingQueries.push({ key, query: q });
      this.gl.endQuery(this.timerExt.TIME_ELAPSED_EXT);
    }
  }

  _collectTimers() {
    if (!guiparams.gpu_profile || !this.timerExt) return;
    const gl = this.gl, ext = this.timerExt;
    if (this._pendingQueries.length > 80)
      this._pendingQueries.splice(0, this._pendingQueries.length - 80)
        .forEach(({ query }) => gl.deleteQuery(query));
    this._pendingQueries = this._pendingQueries.filter(({ key, query }) => {
      if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return true;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT))
        this.gpuTimings[key] = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6;
      gl.deleteQuery(query);
      return false;
    });
  }

  // Initial density and velocity, "constants".
  render_constants() {
    if (this.first_frame) this.shaders.black.render(); // Obstacles.
    this.first_frame = false;

    this.shaders.noise.render(); // Randomize noise every frame.
    this.shaders.env_pressure.render(); // Environment updates with parameters.
  }  

  render_mice() {
    const m = this.mice[0];
    const uDensity = this.shaders.add_mouse_to_density.uniforms;
    const uVelocity = this.shaders.add_mouse_to_velocity.uniforms;

    if (!m.down) {
      // Passthrough: propagate current sim state so advection reads fresh data.
      uDensity.n_stamps.value = 0;
      this.shaders.add_mouse_to_density.render();
      this.shaders.add_mouse_to_velocity.render();
      return;
    }

    uDensity.radius.value =
      Math.pow(Math.max(0.1 - m.velocity.length(), 0.1), 2) *
      uniforms.external.mouse_radius.value;

    const vScale = uniforms.external.mouse_velocity.value;
    uVelocity.multiplier.value.set(m.velocity.x, m.velocity.y, 0, 0)
      .multiplyScalar(vScale);

    uDensity.multiplier.value.set(
      uniforms.external.mouse_density.liquid.value,
      uniforms.external.mouse_density.vapor.value,
      uniforms.external.mouse_density.temperature.value,
      1
    ).multiplyScalar(vScale * m.velocity.length());

    // Build spline through pending positions + lastStamp for continuity.
    let pts = m.pending.length ? [...m.pending] : [];
    if (m.lastStamp) pts.unshift(m.lastStamp);
    if (!pts.length) pts = [m.position];

    let stamps;
    if (pts.length === 1) {
      stamps = [pts[0].clone()];
    } else {
      // Arc length of pending points to determine stamp count.
      let len = 0;
      for (let j = 1; j < pts.length; j++)
        len += pts[j].distanceTo(pts[j - 1]);

      // Space stamps at smoothness fraction of radius (lower = smoother).
      const step = uDensity.radius.value * uniforms.external.mouse_smoothness.value;
      const n = Math.min(128, Math.max(2, Math.ceil(len / Math.max(1e-6, step))));

      stamps = [];
      const total = pts.length - 1;
      for (let s = 0; s < n; s++) {
        const ft = (s / (n - 1)) * total;
        const idx = Math.min(Math.floor(ft), total - 1);
        const t = ft - idx;
        stamps.push(this._cr(
          pts[Math.max(0, idx - 1)], pts[idx],
          pts[Math.min(pts.length - 1, idx + 1)],
          pts[Math.min(pts.length - 1, idx + 2)], t));
      }
    }
    m.lastStamp = stamps[stamps.length - 1].clone();

    uDensity.n_stamps.value = stamps.length;
    const pos = uDensity.stamp_pos.value;
    stamps.forEach((p, j) => pos[j].copy(p));

    this.shaders.add_mouse_to_density.render();
    this.shaders.add_mouse_to_velocity.render();

    this.shaders.set_velocity.bind('source', this.shaders.add_mouse_to_velocity);
    this.shaders.set_density.bind('source', this.shaders.add_mouse_to_density);
    this.shaders.set_density.render();
    this.shaders.set_velocity.render();

    m.pending = [];
  }

  render_external_density_and_velocity() {
    this.render_mice();
    this.shaders.add_wind.render();
  }

  render_advection() {
    this.shaders.advect_density.render();
    this.shaders.advect_velocity.render();
  }

  render_viscous_diffusion() {
    this.shaders.jacobi_diffusion
      .bind('velocity_texture', this.shaders.advect_velocity);

    if (
      guiparams.simulation.viscosity_iterations > 0 && (
        guiparams.external.viscosity_gain > 0 ||
        guiparams.dynamics.viscosity > 0
      )
    ) {
      for (let i = 0; i < guiparams.simulation.viscosity_iterations; i++) {
        this.shaders.jacobi_diffusion.render();

        if (i == 0) {
          this.shaders.jacobi_diffusion
            .bind('velocity_texture', this.shaders.set_viscosity_velocity);
        }

        this.shaders.set_viscosity_velocity.render();
      }
    }
  }

  render_additional_forces() {
    // Additional forces.
    this.shaders.buoyancy.render();
          
    if (guiparams.dynamics.vorticity_confinement > 0) {
      this.shaders.vorticity_magnitude.render();
      this.shaders.vorticity_confinement.render();
      this.shaders.add_buoyancy_and_vorticity.render();
    }

    this.shaders.add_forces_to_velocity.render();
  }

  render_water_continuity_and_thermodynamics() {
    // Water continuity and thermodynamics.
    this.shaders.water_continuity.render();
    this.shaders.thermodynamics.render();
    this.shaders.set_density.bind('source', this.shaders.thermodynamics);
    this.shaders.set_density.render();
  }

  render_incompressibility() {
    // Incompressibility: calculate pressure and fix velocity.
    // If pressure_iterations = 0, skip and set final velocity directly
    // from buoyancy.
    this.shaders.set_velocity.bind('source', this.shaders.subtract_gradient);

    if (guiparams.simulation.pressure_iterations > 0) {
      this.shaders.divergence.render();
      this.shaders.jacobi_pressure.bind('pressure', this.shaders.black);

      for (let i = 0; i < guiparams.simulation.pressure_iterations; i++) {
        this.shaders.jacobi_pressure.render();

        if (i == 0) {
          this.shaders.jacobi_pressure.bind('pressure', this.shaders.set_pressure);
        }

        this.shaders.set_pressure.render();
      }

      this.shaders.subtract_gradient.render();
    }

    this.shaders.set_velocity.render();
  }

  // Render density or velocity to canvas.
  render_visualization() {
    const s = guiparams.display == 'density' ? 'vis_density' : 'vis_velocity';
    this.shaders[s].render(null);
  }

  render(time) {
    time *= 0.001;  // convert to seconds
    if (this.timerExt) this._collectTimers();
    if (this.on_render) this.on_render();

    uniforms.simulation.time.value = time;

    if (guiparams.render && (!guiparams.mouse_only || this.mice.some(m => m.down))) {
      this._time('constants',         () => this.render_constants());
      this._time('mice',              () => this.render_external_density_and_velocity());
      this._time('advection',         () => this.render_advection());
      this._time('diffusion',         () => this.render_viscous_diffusion());
      this._time('forces',            () => this.render_additional_forces());
      this._time('thermodynamics',    () => this.render_water_continuity_and_thermodynamics());
      this._time('incompressibility', () => this.render_incompressibility());
      this._time('visualization',     () => this.render_visualization());
    }

    requestAnimationFrame(this.render.bind(this));
    if (this.stats) this.stats.update();
  }
}
