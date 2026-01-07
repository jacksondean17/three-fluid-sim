import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  RawShaderMaterial,
  Scene,
  Texture,
  Uniform,
  Vector2
} from "three";

export class MeasurementPass {
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
        pressureTexture: new Uniform(Texture.DEFAULT_IMAGE),
        velocityTexture: new Uniform(Texture.DEFAULT_IMAGE),
        samplePosition: new Uniform(new Vector2(0.5, 0.5)),
        valueScale: new Uniform(10.0) // Scale factor for encoding
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
        uniform sampler2D pressureTexture;
        uniform sampler2D velocityTexture;
        uniform vec2 samplePosition;
        uniform float valueScale;

        void main() {
          // Sample the textures at the measurement position
          float pressure = texture2D(pressureTexture, samplePosition).r;
          vec2 velocity = texture2D(velocityTexture, samplePosition).rg;

          // Encode values into 0-1 range for UnsignedByteType output
          // We use a scale factor and offset to handle negative values
          // encoded = (value / scale + 0.5) clamped to 0-1
          float encodedPressure = clamp(pressure / valueScale + 0.5, 0.0, 1.0);
          float encodedVelX = clamp(velocity.x / valueScale + 0.5, 0.0, 1.0);
          float encodedVelY = clamp(velocity.y / valueScale + 0.5, 0.0, 1.0);

          // Output encoded values
          gl_FragColor = vec4(encodedPressure, encodedVelX, encodedVelY, 1.0);
        }`,
      depthTest: false,
      depthWrite: false
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  public update(uniforms: any): void {
    if (uniforms.pressureTexture !== undefined) {
      this.material.uniforms.pressureTexture.value = uniforms.pressureTexture;
    }
    if (uniforms.velocityTexture !== undefined) {
      this.material.uniforms.velocityTexture.value = uniforms.velocityTexture;
    }
    if (uniforms.samplePosition !== undefined) {
      this.material.uniforms.samplePosition.value = uniforms.samplePosition;
    }
    if (uniforms.valueScale !== undefined) {
      this.material.uniforms.valueScale.value = uniforms.valueScale;
    }
  }
}
