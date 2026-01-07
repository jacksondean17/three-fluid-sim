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

export class BoundaryPass {
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
        flowEnabled: new Uniform(false),
        obstacleEnabled: new Uniform(false),
        obstaclePos: new Uniform(new Vector2(0.5, 0.5)),
        obstacleSize: new Uniform(0.1),
        aspect: new Uniform(new Vector2(1.0, 1.0))
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
        uniform bool flowEnabled;
        uniform bool obstacleEnabled;
        uniform vec2 obstaclePos;
        uniform float obstacleSize;
        uniform vec2 aspect;

        void main() {
          vec2 texelSize = vec2(dFdx(vUV.x), dFdy(vUV.y));

          float leftEdgeMask = ceil(texelSize.x - vUV.x);
          float bottomEdgeMask = ceil(texelSize.y - vUV.y);
          float rightEdgeMask = ceil(vUV.x - (1.0 - texelSize.x));
          float topEdgeMask = ceil(vUV.y - (1.0 - texelSize.y));

          // When flow is enabled, only enforce top/bottom boundaries
          float edgeMask;
          if (flowEnabled) {
            edgeMask = clamp(bottomEdgeMask + topEdgeMask, 0.0, 1.0);
          } else {
            edgeMask = clamp(leftEdgeMask + bottomEdgeMask + rightEdgeMask + topEdgeMask, 0.0, 1.0);
          }

          // Obstacle boundary check
          float obstacleMask = 0.0;
          if (obstacleEnabled) {
            // Scale UV to aspect ratio for proper square shape
            vec2 scaledUV = vec2(vUV.x * aspect.x, vUV.y);
            vec2 scaledObsPos = vec2(obstaclePos.x * aspect.x, obstaclePos.y);
            float halfSize = obstacleSize * 0.5;

            // Check if inside obstacle (using box distance)
            vec2 d = abs(scaledUV - scaledObsPos) - vec2(halfSize);
            float inside = step(max(d.x, d.y), 0.0);

            // Check if at obstacle edge (within one texel of boundary)
            vec2 edgeDist = abs(scaledUV - scaledObsPos) - vec2(halfSize);
            float atEdge = step(max(edgeDist.x, edgeDist.y), texelSize.x * 2.0) * inside;

            obstacleMask = inside;
          }

          float mask = clamp(edgeMask + obstacleMask, 0.0, 1.0);
          float direction = mix(1.0, -1.0, mask);

          gl_FragColor = texture2D(velocity, vUV) * direction;
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
    if (uniforms.velocity !== undefined) {
      this.material.uniforms.velocity.value = uniforms.velocity;
    }
    if (uniforms.flowEnabled !== undefined) {
      this.material.uniforms.flowEnabled.value = uniforms.flowEnabled;
    }
    if (uniforms.obstacleEnabled !== undefined) {
      this.material.uniforms.obstacleEnabled.value = uniforms.obstacleEnabled;
    }
    if (uniforms.obstaclePos !== undefined) {
      this.material.uniforms.obstaclePos.value = uniforms.obstaclePos;
    }
    if (uniforms.obstacleSize !== undefined) {
      this.material.uniforms.obstacleSize.value = uniforms.obstacleSize;
    }
    if (uniforms.aspect !== undefined) {
      this.material.uniforms.aspect.value = uniforms.aspect;
    }
  }
}
