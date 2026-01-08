import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  RawShaderMaterial,
  Scene,
  Texture,
  Uniform
} from "three";

export class VelocityFieldPass {
  public readonly scene: Scene;

  private material: RawShaderMaterial;
  private mesh: Mesh;

  constructor() {
    this.scene = new Scene();

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(
        new Float32Array([-1, -1, 1, -1, 1, 1, 1, 1, -1, 1, -1, -1]),
        2
      )
    );
    this.material = new RawShaderMaterial({
      uniforms: {
        velocity: new Uniform(Texture.DEFAULT_IMAGE),
        valueScale: new Uniform(10.0)
      },
      vertexShader: `
        attribute vec2 position;
        varying vec2 vUV;

        void main() {
          vUV = position * 0.5 + 0.5;
          gl_Position = vec4(position, 0.0, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        precision highp int;

        varying vec2 vUV;
        uniform sampler2D velocity;
        uniform float valueScale;

        void main() {
          vec2 vel = texture2D(velocity, vUV).xy;

          // Encode velocity to 0-255 range
          // value = (encoded - 0.5) * scale => encoded = value / scale + 0.5
          float encodedX = clamp(vel.x / valueScale + 0.5, 0.0, 1.0);
          float encodedY = clamp(vel.y / valueScale + 0.5, 0.0, 1.0);

          gl_FragColor = vec4(encodedX, encodedY, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  public update(uniforms: any): void {
    if (uniforms.velocity !== undefined) {
      this.material.uniforms.velocity.value = uniforms.velocity;
    }
    if (uniforms.valueScale !== undefined) {
      this.material.uniforms.valueScale.value = uniforms.valueScale;
    }
  }
}
