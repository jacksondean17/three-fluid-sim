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
        uniform sampler2D velocity;
        uniform bool flowEnabled;
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

          // Translate to rectangle's local space
          vec2 local = p - center;

          // Rotate to align with rectangle axes
          vec2 rotated = vec2(
            local.x * cosA - local.y * sinA,
            local.x * sinA + local.y * cosA
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

          // Chevron pattern check
          float chevronMask = 0.0;
          if (chevronEnabled) {
            // Scale UV to aspect ratio
            vec2 scaledUV = vec2(vUV.x * aspect.x, vUV.y);

            // Calculate pattern dimensions
            float totalWidth = float(chevronColumns) * chevronSpacingX;
            float totalHeight = float(chevronRows) * chevronSpacingY;

            // Center the pattern
            float startX = (aspect.x - totalWidth) * 0.5 + chevronSpacingX * 0.5;
            float startY = (1.0 - totalHeight) * 0.5 + chevronSpacingY * 0.5;

            // Check each chevron rectangle (each column is a single rectangle)
            for (int row = 0; row < 20; row++) {
              if (row >= chevronRows) break;
              for (int col = 0; col < 20; col++) {
                if (col >= chevronColumns) break;

                // Center of this rectangle
                float cx = startX + float(col) * chevronSpacingX;
                float cy = startY + float(row) * chevronSpacingY;

                // Alternate angle direction based on column (even = positive, odd = negative)
                float angle = (mod(float(col), 2.0) < 0.5) ? chevronAngle : -chevronAngle;

                // Apply gap offset (moves pairs apart horizontally)
                float gapOffset = chevronGap * 0.5 * ((mod(float(col), 2.0) < 0.5) ? -1.0 : 1.0);
                cx += gapOffset;

                chevronMask += insideRotatedRect(scaledUV, vec2(cx, cy), chevronLength, chevronWidth, angle);
              }
            }
            chevronMask = clamp(chevronMask, 0.0, 1.0);
          }

          float mask = clamp(edgeMask + chevronMask, 0.0, 1.0);
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
