import * as THREE from './js/three.module.js';
import { add_shaders } from './js/shaders.js';
import { uniforms, guiparams } from './js/parameters.js';

export default class simulation {
  // Set up the three.js scene.
  shaders = {};
  mice = [...new Array(10)].map(m => ({ 
    position: new THREE.Vector2(),
    velocity: new THREE.Vector2(),
    down: false
  }));
  first_frame = true;

  constructor(canvas, stats) { this.stats = stats; }

  update_mouse(x, y, mouse_index) {
    // Get mouse coordinates.
    const dim = uniforms.simulation.dim.value;
    const position = new THREE.Vector2(x / dim.x, 1 - y / dim.y);
    const mouse = this.mice[mouse_index];
    if (!mouse) return;

    // Calculate velocity of this mouse.
    mouse.velocity.copy(position);
    mouse.velocity.sub(mouse.position);
    mouse.velocity.multiplyScalar(uniforms.external.mouse_velocity.value);
    mouse.position.copy(position);
  };

  start() {
    renderer.autoClearColor = false;
    add_shaders(shaders, uniforms, renderer, camera);
    this.first_frame = true;
    requestAnimationFrame(this.render.bind(this));
  }

  // Initial density and velocity, "constants".
  render_constants() {
    if (this.first_frame) shaders.black.render(); // Obstacles.
    this.first_frame = false;

    shaders.noise.render(); // Randomize noise every frame.
    shaders.env_pressure.render(); // Environment updates with parameters.
  }  

  render_mice() {
    // For each mouse, render the additional density and velocity and then
    // copy the texture to set_velocity and set_density for the next.
    mice.filter(m => m.down).forEach((m, i) => {
      const shader_mouse = 
        shaders.add_mouse_to_density.uniforms.mouse.value;
      
      const shader_velocity_multiplier = 
        shaders.add_mouse_to_velocity.uniforms.multiplier.value;
      
      const shader_density_multiplier = 
        shaders.add_mouse_to_density.uniforms.multiplier.value;

      const velocity_scale = uniforms.external.mouse_velocity.value;
      const density_multiplier = new THREE.Vector4(
        ...['liquid', 'vapor', 'temperature'].map(
          quantity => uniforms.external.mouse_density[quantity].value
        ),
        1
      );
      const shader_radius = shaders.add_mouse_to_density.uniforms.radius;

      shader_mouse.copy(m.position);
      shader_mouse.z = 1;
      shader_radius.value = 
        Math.pow(Math.max(0.1 - m.velocity.length(), 0.1), 2) * 
        uniforms.external.mouse_radius.value;

      shader_velocity_multiplier.set(m.velocity.x, m.velocity.y, 0, 0);
      shader_velocity_multiplier.multiplyScalar(velocity_scale);

      shader_density_multiplier.copy(density_multiplier);
      shader_density_multiplier
        .multiplyScalar(velocity_scale * m.velocity.length());

      shaders.add_mouse_to_density.render();
      shaders.add_mouse_to_velocity.render();

      if (i == 0) {
        shaders.set_velocity.bind('source', shaders.add_mouse_to_velocity);
        shaders.set_density.bind('source', shaders.add_mouse_to_density);
      }

      shaders.set_density.render();
      shaders.set_velocity.render();
    });
  }

  render_external_density_and_velocity() {
    this.render_mice();
    shaders.add_wind.render();
  }

  render_advection() {
    shaders.advect_density.render();
    shaders.advect_velocity.render();
  }

  render_viscous_diffusion() {
    shaders.jacobi_diffusion
      .bind('velocity_texture', shaders.advect_velocity);

    if (
      guiparams.simulation.viscosity_iterations > 0 && (
        guiparams.external.viscosity_gain > 0 ||
        guiparams.dynamics.viscosity > 0
      )
    ) {
      for (let i = 0; i < guiparams.simulation.viscosity_iterations; i++) {
        shaders.jacobi_diffusion.render();

        if (i == 0) {
          shaders.jacobi_diffusion
            .bind('velocity_texture', shaders.set_viscosity_velocity);
        }

        shaders.set_viscosity_velocity.render();
      }
    }
  }

  render_additional_forces() {
    // Additional forces.
    shaders.buoyancy.render();
          
    if (guiparams.dynamics.vorticity_confinement > 0) {
      shaders.vorticity_magnitude.render();
      shaders.vorticity_confinement.render();
      shaders.add_buoyancy_and_vorticity.render();
    }

    shaders.add_forces_to_velocity.render();
  }

  render_water_continuity_and_thermodynamics() {
    // Water continuity and thermodynamics.
    shaders.water_continuity.render();
    shaders.thermodynamics.render();
    shaders.set_density.bind('source', shaders.thermodynamics);
    shaders.set_density.render();
  }

  render_incompressibility() {
    // Incompressibility: calculate pressure and fix velocity.
    // If pressure_iterations = 0, skip and set final velocity directly
    // from buoyancy.
    shaders.set_velocity.bind('source', shaders.subtract_gradient);

    if (guiparams.simulation.pressure_iterations > 0) {
      shaders.divergence.render();
      shaders.jacobi_pressure.bind('pressure', shaders.black);

      for (var i = 0; i < guiparams.simulation.pressure_iterations; i++) {
        shaders.jacobi_pressure.render();

        if (i == 0) {
          shaders.jacobi_pressure.bind('pressure', shaders.set_pressure);
        }

        shaders.set_pressure.render();
      }

      shaders.subtract_gradient.render();
    }

    shaders.set_velocity.render();
  }

  // Render density or velocity to canvas.
  render_visualization() {
    const s = guiparams.display == 'density' ? 'vis_density' : 'vis_velocity';
    this.shaders[s].render(null);
  }

  render(time) {
    time *= 0.001;  // convert to seconds
    if (this.on_render) this.on_render();

    uniforms.simulation.time.value = time;

    if (guiparams.render) {
      this.render_constants();
      this.render_external_density_and_velocity();
      this.render_advection();
      this.render_viscous_diffusion();
      this.render_additional_forces();
      this.render_water_continuity_and_thermodynamics();
      this.render_incompressibility();
      this.render_visualization();
    }

    requestAnimationFrame(render);
    if (this.stats) this.stats.update();
  }
};
