import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  RawShaderMaterial,
  Scene,
  Texture,
  Uniform
} from "three";

export class JacobiIterationsPass {
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
        alpha: new Uniform(-1.0),
        beta: new Uniform(0.25),
        previousIteration: new Uniform(Texture.DEFAULT_IMAGE),
        divergence: new Uniform(Texture.DEFAULT_IMAGE),
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
            uniform float alpha;
            uniform float beta;
            uniform sampler2D previousIteration;
            uniform sampler2D divergence;
            uniform sampler2D obstacleMask;
            uniform bool useObstacleMask;

            void main() {
              vec2 texelSize = vec2(dFdx(vUV.x), dFdy(vUV.y));

              // Check if current cell is an obstacle
              float centerMask = texture2D(obstacleMask, vUV).r;

              if (useObstacleMask && centerMask > 0.5) {
                // Inside obstacle: keep pressure at 0
                gl_FragColor = vec4(0.0);
                return;
              }

              // Outflow boundary condition: set pressure to 0 at right edge
              // This provides a reference pressure and allows pressure to dissipate
              if (useObstacleMask && vUV.x > 1.0 - texelSize.x * 1.5) {
                gl_FragColor = vec4(0.0);
                return;
              }

              vec4 center = texture2D(previousIteration, vUV);

              // Sample neighbors
              vec2 uvLeft = vUV - vec2(texelSize.x, 0.0);
              vec2 uvRight = vUV + vec2(texelSize.x, 0.0);
              vec2 uvDown = vUV - vec2(0.0, texelSize.y);
              vec2 uvUp = vUV + vec2(0.0, texelSize.y);

              vec4 x0 = texture2D(previousIteration, uvLeft);
              vec4 x1 = texture2D(previousIteration, uvRight);
              vec4 y0 = texture2D(previousIteration, uvDown);
              vec4 y1 = texture2D(previousIteration, uvUp);

              if (useObstacleMask) {
                // Apply Neumann BC: if neighbor is obstacle, use center pressure
                // This enforces dp/dn = 0 at obstacle boundaries
                float maskLeft = texture2D(obstacleMask, uvLeft).r;
                float maskRight = texture2D(obstacleMask, uvRight).r;
                float maskDown = texture2D(obstacleMask, uvDown).r;
                float maskUp = texture2D(obstacleMask, uvUp).r;

                if (maskLeft > 0.5) x0 = center;
                if (maskRight > 0.5) x1 = center;
                if (maskDown > 0.5) y0 = center;
                if (maskUp > 0.5) y1 = center;

                // Domain boundary conditions (prevent wrap-around)
                // Left edge (inflow): Neumann BC (use center value)
                if (vUV.x < texelSize.x * 1.5) x0 = center;
                // Right edge (outflow): pressure = 0
                if (vUV.x > 1.0 - texelSize.x * 1.5) x1 = vec4(0.0);
                // Top/bottom: Neumann BC
                if (vUV.y < texelSize.y * 1.5) y0 = center;
                if (vUV.y > 1.0 - texelSize.y * 1.5) y1 = center;
              }

              vec4 d = texture2D(divergence, vUV);

              gl_FragColor = (x0 + x1 + y0 + y1 + alpha * d) * beta;
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
    if (uniforms.previousIteration !== undefined) {
      this.material.uniforms.previousIteration.value =
        uniforms.previousIteration;
    }
    if (uniforms.divergence !== undefined) {
      this.material.uniforms.divergence.value = uniforms.divergence;
    }
    if (uniforms.obstacleMask !== undefined) {
      this.material.uniforms.obstacleMask.value = uniforms.obstacleMask;
    }
    if (uniforms.useObstacleMask !== undefined) {
      this.material.uniforms.useObstacleMask.value = uniforms.useObstacleMask;
    }
  }
}
