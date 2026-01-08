import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  RawShaderMaterial,
  Scene,
  Texture,
  Uniform
} from "three";

export class DivergencePass {
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
          uniform sampler2D obstacleMask;
          uniform bool useObstacleMask;

          void main() {
            vec2 texelSize = vec2(dFdx(vUV.x), dFdy(vUV.y));

            // Check if current cell is an obstacle
            if (useObstacleMask) {
              float centerMask = texture2D(obstacleMask, vUV).r;
              if (centerMask > 0.5) {
                // Inside obstacle: zero divergence
                gl_FragColor = vec4(0.0);
                return;
              }
            }

            vec2 uvLeft = vUV - vec2(texelSize.x, 0.0);
            vec2 uvRight = vUV + vec2(texelSize.x, 0.0);
            vec2 uvDown = vUV - vec2(0.0, texelSize.y);
            vec2 uvUp = vUV + vec2(0.0, texelSize.y);

            vec2 vCenter = texture2D(velocity, vUV).xy;
            float x0 = texture2D(velocity, uvLeft).x;
            float x1 = texture2D(velocity, uvRight).x;
            float y0 = texture2D(velocity, uvDown).y;
            float y1 = texture2D(velocity, uvUp).y;

            if (useObstacleMask) {
              // Handle obstacle boundaries: use center velocity for blocked neighbors
              float maskLeft = texture2D(obstacleMask, uvLeft).r;
              float maskRight = texture2D(obstacleMask, uvRight).r;
              float maskDown = texture2D(obstacleMask, uvDown).r;
              float maskUp = texture2D(obstacleMask, uvUp).r;

              if (maskLeft > 0.5) x0 = vCenter.x;
              if (maskRight > 0.5) x1 = vCenter.x;
              if (maskDown > 0.5) y0 = vCenter.y;
              if (maskUp > 0.5) y1 = vCenter.y;

              // Domain boundary conditions (prevent wrap-around)
              // Left edge (inflow): use center velocity
              if (vUV.x < texelSize.x * 1.5) x0 = vCenter.x;
              // Right edge (outflow): use center velocity (free outflow)
              if (vUV.x > 1.0 - texelSize.x * 1.5) x1 = vCenter.x;
              // Top/bottom: use center velocity
              if (vUV.y < texelSize.y * 1.5) y0 = vCenter.y;
              if (vUV.y > 1.0 - texelSize.y * 1.5) y1 = vCenter.y;
            }

            float divergence = (x1 - x0 + y1 - y0) * 0.5;

            gl_FragColor = vec4(divergence);
          }`,
      depthTest: false,
      depthWrite: false,
      extensions: { derivatives: true }
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false; // Just here to silence a console error.
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
    if (uniforms.obstacleMask !== undefined) {
      this.material.uniforms.obstacleMask.value = uniforms.obstacleMask;
    }
    if (uniforms.useObstacleMask !== undefined) {
      this.material.uniforms.useObstacleMask.value = uniforms.useObstacleMask;
    }
  }
}
