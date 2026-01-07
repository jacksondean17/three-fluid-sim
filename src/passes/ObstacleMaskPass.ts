import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  RawShaderMaterial,
  Scene,
  Uniform,
  Vector2
} from "three";

export class ObstacleMaskPass {
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
        chevronEnabled: new Uniform(false),
        chevronColumns: new Uniform(3),
        chevronRows: new Uniform(4),
        chevronLength: new Uniform(0.15),
        chevronWidth: new Uniform(0.025),
        chevronAngle: new Uniform(45.0),
        chevronGap: new Uniform(0.0),
        chevronSpacingX: new Uniform(0.25),
        chevronSpacingY: new Uniform(0.15),
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
        uniform bool chevronEnabled;
        uniform int chevronColumns;
        uniform int chevronRows;
        uniform float chevronLength;
        uniform float chevronWidth;
        uniform float chevronAngle;
        uniform float chevronGap;
        uniform float chevronSpacingX;
        uniform float chevronSpacingY;
        uniform vec2 aspect;

        // Check if point is inside a rotated rectangle
        float insideRotatedRect(vec2 p, vec2 center, float length, float width, float angleDeg) {
          float angleRad = angleDeg * 3.14159265 / 180.0;
          float cosA = cos(-angleRad);
          float sinA = sin(-angleRad);

          vec2 d = p - center;
          vec2 rotated = vec2(
            d.x * cosA - d.y * sinA,
            d.x * sinA + d.y * cosA
          );

          // Check if inside rectangle (length along x, width along y)
          float halfLength = length * 0.5;
          float halfWidth = width * 0.5;

          if (abs(rotated.x) <= halfLength && abs(rotated.y) <= halfWidth) {
            return 1.0;
          }
          return 0.0;
        }

        void main() {
          float mask = 0.0;

          if (chevronEnabled) {
            vec2 scaledUV = vec2(vUV.x * aspect.x, vUV.y);

            // Calculate pattern dimensions
            float totalWidth = float(chevronColumns) * chevronSpacingX;
            float totalHeight = float(chevronRows) * chevronSpacingY;

            // Center the pattern
            float startX = (aspect.x - totalWidth) * 0.5 + chevronSpacingX * 0.5;
            float startY = (1.0 - totalHeight) * 0.5 + chevronSpacingY * 0.5;

            // Check each chevron rectangle
            for (int row = 0; row < 20; row++) {
              if (row >= chevronRows) break;
              for (int col = 0; col < 20; col++) {
                if (col >= chevronColumns) break;

                float cx = startX + float(col) * chevronSpacingX;
                float cy = startY + float(row) * chevronSpacingY;

                float angle = (mod(float(col), 2.0) < 0.5) ? chevronAngle : -chevronAngle;

                float gapOffset = chevronGap * 0.5 * ((mod(float(col), 2.0) < 0.5) ? -1.0 : 1.0);
                cx += gapOffset;

                mask += insideRotatedRect(scaledUV, vec2(cx, cy), chevronLength, chevronWidth, angle);
              }
            }
            mask = clamp(mask, 0.0, 1.0);
          }

          // Output: r = obstacle mask (1 = obstacle, 0 = fluid)
          gl_FragColor = vec4(mask, 0.0, 0.0, 1.0);
        }`,
      depthTest: false,
      depthWrite: false
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  public update(uniforms: any): void {
    if (uniforms.chevronEnabled !== undefined) {
      this.material.uniforms.chevronEnabled.value = uniforms.chevronEnabled;
    }
    if (uniforms.chevronColumns !== undefined) {
      this.material.uniforms.chevronColumns.value = uniforms.chevronColumns;
    }
    if (uniforms.chevronRows !== undefined) {
      this.material.uniforms.chevronRows.value = uniforms.chevronRows;
    }
    if (uniforms.chevronLength !== undefined) {
      this.material.uniforms.chevronLength.value = uniforms.chevronLength;
    }
    if (uniforms.chevronWidth !== undefined) {
      this.material.uniforms.chevronWidth.value = uniforms.chevronWidth;
    }
    if (uniforms.chevronAngle !== undefined) {
      this.material.uniforms.chevronAngle.value = uniforms.chevronAngle;
    }
    if (uniforms.chevronGap !== undefined) {
      this.material.uniforms.chevronGap.value = uniforms.chevronGap;
    }
    if (uniforms.chevronSpacingX !== undefined) {
      this.material.uniforms.chevronSpacingX.value = uniforms.chevronSpacingX;
    }
    if (uniforms.chevronSpacingY !== undefined) {
      this.material.uniforms.chevronSpacingY.value = uniforms.chevronSpacingY;
    }
    if (uniforms.aspect !== undefined) {
      this.material.uniforms.aspect.value = uniforms.aspect;
    }
  }
}
