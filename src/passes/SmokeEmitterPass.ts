import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  RawShaderMaterial,
  Scene,
  Texture,
  Uniform,
  Vector2,
  Vector3
} from "three";

export class SmokeEmitterPass {
  public readonly scene: Scene;

  private material: RawShaderMaterial;
  private mesh: Mesh;

  constructor(resolution: Vector2) {
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
        colorBuffer: new Uniform(Texture.DEFAULT_IMAGE),
        resolution: new Uniform(resolution),
        aspect: new Uniform(new Vector2(1.0, 1.0)),
        // Up to 4 emitters
        emitter0: new Uniform(new Vector3(0.05, 0.5, 0.0)), // x, y, enabled
        emitter1: new Uniform(new Vector3(0.05, 0.3, 0.0)),
        emitter2: new Uniform(new Vector3(0.05, 0.7, 0.0)),
        emitter3: new Uniform(new Vector3(0.05, 0.5, 0.0)),
        emitterRadius: new Uniform(0.02),
        emitterIntensity: new Uniform(0.5),
        emitterColor: new Uniform(new Vector3(1.0, 1.0, 1.0)),
        time: new Uniform(0.0)
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
        uniform sampler2D colorBuffer;
        uniform vec2 resolution;
        uniform vec2 aspect;
        uniform vec3 emitter0;
        uniform vec3 emitter1;
        uniform vec3 emitter2;
        uniform vec3 emitter3;
        uniform float emitterRadius;
        uniform float emitterIntensity;
        uniform vec3 emitterColor;
        uniform float time;

        float random(vec2 st) {
          return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
        }

        float emitterContribution(vec2 uv, vec3 emitter) {
          if (emitter.z < 0.5) return 0.0;

          // Scale UV to match aspect ratio
          vec2 scaledUV = vec2(uv.x * aspect.x, uv.y);
          vec2 emitterPos = vec2(emitter.x, emitter.y);

          float dist = length(scaledUV - emitterPos);

          // Smooth falloff
          float contribution = smoothstep(emitterRadius, 0.0, dist);

          // Add some noise for more natural look
          float noise = random(uv + time * 0.1) * 0.3 + 0.7;

          return contribution * noise;
        }

        void main() {
          vec4 color = texture2D(colorBuffer, vUV);

          // Calculate total emitter contribution
          float totalContribution = 0.0;
          totalContribution += emitterContribution(vUV, emitter0);
          totalContribution += emitterContribution(vUV, emitter1);
          totalContribution += emitterContribution(vUV, emitter2);
          totalContribution += emitterContribution(vUV, emitter3);

          // Add emitter color
          vec3 smokeColor = emitterColor * totalContribution * emitterIntensity;
          color.rgb = color.rgb + smokeColor;

          gl_FragColor = color;
        }`,
      depthTest: false,
      depthWrite: false
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  public update(uniforms: any): void {
    if (uniforms.colorBuffer !== undefined) {
      this.material.uniforms.colorBuffer.value = uniforms.colorBuffer;
    }
    if (uniforms.resolution !== undefined) {
      this.material.uniforms.resolution.value = uniforms.resolution;
    }
    if (uniforms.aspect !== undefined) {
      this.material.uniforms.aspect.value = uniforms.aspect;
    }
    if (uniforms.emitter0 !== undefined) {
      this.material.uniforms.emitter0.value = uniforms.emitter0;
    }
    if (uniforms.emitter1 !== undefined) {
      this.material.uniforms.emitter1.value = uniforms.emitter1;
    }
    if (uniforms.emitter2 !== undefined) {
      this.material.uniforms.emitter2.value = uniforms.emitter2;
    }
    if (uniforms.emitter3 !== undefined) {
      this.material.uniforms.emitter3.value = uniforms.emitter3;
    }
    if (uniforms.emitterRadius !== undefined) {
      this.material.uniforms.emitterRadius.value = uniforms.emitterRadius;
    }
    if (uniforms.emitterIntensity !== undefined) {
      this.material.uniforms.emitterIntensity.value = uniforms.emitterIntensity;
    }
    if (uniforms.emitterColor !== undefined) {
      this.material.uniforms.emitterColor.value = uniforms.emitterColor;
    }
    if (uniforms.time !== undefined) {
      this.material.uniforms.time.value = uniforms.time;
    }
  }
}
