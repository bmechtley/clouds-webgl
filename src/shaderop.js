import * as THREE from 'three';

export default class shaderop {
  constructor(shader, uniforms, renderer, camera, name) {
    this.uniforms = uniforms;

    this.scene = new THREE.Scene();
    this.plane = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      fragmentShader: shader, uniforms: uniforms
    });
    this.scene.add(new THREE.Mesh(this.plane, this.material));

    this.texture = new THREE.WebGLRenderTarget(
      window.innerWidth, window.innerHeight, {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.NearestFilter,
        wrapS: THREE.RepeatWrapping,
        wrapT: THREE.RepeatWrapping,
        type: THREE.FloatType
      }
    );

    this.renderer = renderer;
    this.camera = camera;
    this.texture.texture.name = name;

    this.textures = Object.keys(this.uniforms).filter(
        key =>
          this.uniforms[key].hasOwnProperty('value') &&
          this.uniforms[key].value &&
          this.uniforms[key].value.hasOwnProperty('name')
    );
  }

  render(target) {
    if (this.prerender !== undefined) this.prerender(this);
    
    if (target !== undefined) this.renderer.setRenderTarget(target);
    else this.renderer.setRenderTarget(this.texture);

    this.renderer.render(this.scene, this.camera);
  }

  bind(key, target) { this.uniforms[key].value = target.texture.texture; }

  resize(w, h) { this.texture.setSize(w, h); }
}
