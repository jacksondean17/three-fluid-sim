import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  RawShaderMaterial,
  Scene,
  Texture,
  Uniform
} from "three";

export class GradientSubstractionPass {
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
        timeDelta: new Uniform(0.0),
        velocity: new Uniform(Texture.DEFAULT_IMAGE),
        pressure: new Uniform(Texture.DEFAULT_IMAGE),
        obstacleMask: new Uniform(Texture.DEFAULT_IMAGE),
        useObstacleMask: new Uniform(false)
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
            uniform float timeDelta;
            uniform sampler2D velocity;
            uniform sampler2D pressure;
            uniform sampler2D obstacleMask;
            uniform bool useObstacleMask;

            void main() {
              vec2 texelSize = vec2(dFdx(vUV.x), dFdy(vUV.y));

              // Check if current cell is an obstacle
              float centerMask = texture2D(obstacleMask, vUV).r;

              if (useObstacleMask && centerMask > 0.5) {
                // Inside obstacle: zero velocity
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
              }

              vec2 uvLeft = vUV - vec2(texelSize.x, 0.0);
              vec2 uvRight = vUV + vec2(texelSize.x, 0.0);
              vec2 uvDown = vUV - vec2(0.0, texelSize.y);
              vec2 uvUp = vUV + vec2(0.0, texelSize.y);

              float x0 = texture2D(pressure, uvLeft).r;
              float x1 = texture2D(pressure, uvRight).r;
              float y0 = texture2D(pressure, uvDown).r;
              float y1 = texture2D(pressure, uvUp).r;

              if (useObstacleMask) {
                // For pressure gradient at obstacle boundaries, use center pressure
                // This prevents gradient from "reaching into" obstacles
                float pCenter = texture2D(pressure, vUV).r;
                float maskLeft = texture2D(obstacleMask, uvLeft).r;
                float maskRight = texture2D(obstacleMask, uvRight).r;
                float maskDown = texture2D(obstacleMask, uvDown).r;
                float maskUp = texture2D(obstacleMask, uvUp).r;

                if (maskLeft > 0.5) x0 = pCenter;
                if (maskRight > 0.5) x1 = pCenter;
                if (maskDown > 0.5) y0 = pCenter;
                if (maskUp > 0.5) y1 = pCenter;

                // Domain boundary conditions (prevent wrap-around)
                // Left edge (inflow): use center pressure for gradient calc
                if (vUV.x < texelSize.x * 1.5) x0 = pCenter;
                // Right edge (outflow): pressure = 0
                if (vUV.x > 1.0 - texelSize.x * 1.5) x1 = 0.0;
                // Top/bottom: use center pressure
                if (vUV.y < texelSize.y * 1.5) y0 = pCenter;
                if (vUV.y > 1.0 - texelSize.y * 1.5) y1 = pCenter;
              }

              vec2 v = texture2D(velocity, vUV).xy;
              v -= 0.5 * vec2(x1 - x0, y1 - y0);

              gl_FragColor = vec4(v, 0.0, 1.0);
            }`,
      depthTest: false,
      depthWrite: false,
      extensions: { derivatives: true }
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  public update(uniforms: any): void {
    if (uniforms.timeDelta !== undefined) {
      this.material.uniforms.timeDelta.value = uniforms.timeDelta;
    }
    if (uniforms.density !== undefined) {
      this.material.uniforms.density.value = uniforms.density;
    }
    if (uniforms.velocity !== undefined) {
      this.material.uniforms.velocity.value = uniforms.velocity;
    }
    if (uniforms.pressure !== undefined) {
      this.material.uniforms.pressure.value = uniforms.pressure;
    }
    if (uniforms.obstacleMask !== undefined) {
      this.material.uniforms.obstacleMask.value = uniforms.obstacleMask;
    }
    if (uniforms.useObstacleMask !== undefined) {
      this.material.uniforms.useObstacleMask.value = uniforms.useObstacleMask;
    }
  }
}
