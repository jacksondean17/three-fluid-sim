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

export class CompositionPass {
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
        colorBuffer: new Uniform(Texture.DEFAULT_IMAGE),
        gradient: new Uniform(Texture.DEFAULT_IMAGE),
        spectralMin: new Uniform(400.0),
        spectralMax: new Uniform(650.0),
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
      defines: {
        MODE: 0
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
          uniform sampler2D gradient;
          uniform float spectralMin;
          uniform float spectralMax;
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

          const vec3 W = vec3(0.2125, 0.7154, 0.0721);
          float luminance(in vec3 color) {
            return dot(color, W);
          }

          // Based on code by Spektre posted at http://stackoverflow.com/questions/3407942/rgb-values-of-visible-spectrum
          vec4 spectral(float l) // RGB <0,1> <- lambda l <400,700> [nm]
          {
            float r=0.0,g=0.0,b=0.0;
                  if ((l>=400.0)&&(l<410.0)) { float t=(l-400.0)/(410.0-400.0); r=    +(0.33*t)-(0.20*t*t); }
              else if ((l>=410.0)&&(l<475.0)) { float t=(l-410.0)/(475.0-410.0); r=0.14         -(0.13*t*t); }
              else if ((l>=545.0)&&(l<595.0)) { float t=(l-545.0)/(595.0-545.0); r=    +(1.98*t)-(     t*t); }
              else if ((l>=595.0)&&(l<650.0)) { float t=(l-595.0)/(650.0-595.0); r=0.98+(0.06*t)-(0.40*t*t); }
              else if ((l>=650.0)&&(l<700.0)) { float t=(l-650.0)/(700.0-650.0); r=0.65-(0.84*t)+(0.20*t*t); }
                  if ((l>=415.0)&&(l<475.0)) { float t=(l-415.0)/(475.0-415.0); g=             +(0.80*t*t); }
              else if ((l>=475.0)&&(l<590.0)) { float t=(l-475.0)/(590.0-475.0); g=0.8 +(0.76*t)-(0.80*t*t); }
              else if ((l>=585.0)&&(l<639.0)) { float t=(l-585.0)/(639.0-585.0); g=0.82-(0.80*t)           ; }
                  if ((l>=400.0)&&(l<475.0)) { float t=(l-400.0)/(475.0-400.0); b=    +(2.20*t)-(1.50*t*t); }
              else if ((l>=475.0)&&(l<560.0)) { float t=(l-475.0)/(560.0-475.0); b=0.7 -(     t)+(0.30*t*t); }

            return vec4(r, g, b, 1.0);
          }

          // Signed distance to a rotated rectangle (negative inside, positive outside)
          float sdRotatedRect(vec2 p, vec2 center, float rectLen, float rectWidth, float angleDeg) {
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

            // Signed distance to box
            vec2 d = abs(rotated) - vec2(rectLen * 0.5, rectWidth * 0.5);
            return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
          }

          void main() {
            vec4 color = texture2D(colorBuffer, vUV);
            float lum = luminance(abs(color.rgb));

            vec4 finalColor;
            #if MODE == 0
            finalColor = color;
            #elif MODE == 1
            finalColor = vec4(lum);
            #elif MODE == 2
            finalColor = spectral(mix(spectralMin, spectralMax, lum));
            #elif MODE == 3
            finalColor = texture2D(gradient, vec2(lum, 0.0));
            #endif

            // Draw chevron pattern overlay
            if (chevronEnabled) {
              vec2 scaledUV = vec2(vUV.x * aspect.x, vUV.y);

              // Calculate pattern dimensions
              float totalWidth = float(chevronColumns) * chevronSpacingX;
              float totalHeight = float(chevronRows) * chevronSpacingY;

              // Center the pattern
              float startX = (aspect.x - totalWidth) * 0.5 + chevronSpacingX * 0.5;
              float startY = (1.0 - totalHeight) * 0.5 + chevronSpacingY * 0.5;

              float minDist = 1000.0;

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

                  float d = sdRotatedRect(scaledUV, vec2(cx, cy), chevronLength, chevronWidth, angle);
                  minDist = min(minDist, d);
                }
              }

              // Draw fill and border based on distance
              float borderWidth = chevronWidth * 0.15;
              float inside = 1.0 - smoothstep(-0.001, 0.001, minDist);
              float onBorder = (1.0 - smoothstep(-borderWidth, -borderWidth + 0.002, minDist)) * inside;

              // Obstacle fill color (dark gray) and border color (white)
              vec3 fillColor = vec3(0.2);
              vec3 borderColor = vec3(0.85);

              // Apply chevron colors
              float fillMask = inside * (1.0 - onBorder);
              finalColor.rgb = mix(finalColor.rgb, fillColor, fillMask * 0.92);
              finalColor.rgb = mix(finalColor.rgb, borderColor, onBorder);
            }

            // Draw color key legend for Spectral and Gradient modes
            #if MODE == 2 || MODE == 3
            {
              // Color key dimensions (in UV space)
              float keyWidth = 0.025;
              float keyHeight = 0.3;
              float keyMargin = 0.02;
              float keyBorder = 0.003;

              // Position in bottom-left corner
              float keyLeft = keyMargin;
              float keyRight = keyLeft + keyWidth;
              float keyBottom = keyMargin;
              float keyTop = keyBottom + keyHeight;

              // Check if we're in the color key area
              if (vUV.x >= keyLeft - keyBorder && vUV.x <= keyRight + keyBorder &&
                  vUV.y >= keyBottom - keyBorder && vUV.y <= keyTop + keyBorder) {

                // Check if we're on the border
                bool onKeyBorder = vUV.x < keyLeft || vUV.x > keyRight ||
                                   vUV.y < keyBottom || vUV.y > keyTop;

                if (onKeyBorder) {
                  // Draw white border
                  finalColor = vec4(1.0, 1.0, 1.0, 1.0);
                } else {
                  // Draw the gradient inside the key
                  float t = (vUV.y - keyBottom) / keyHeight;
                  #if MODE == 2
                  finalColor = spectral(mix(spectralMin, spectralMax, t));
                  #elif MODE == 3
                  finalColor = texture2D(gradient, vec2(t, 0.0));
                  #endif
                }
              }

              // Draw "LOW" marker (small triangle pointing left at bottom)
              float markerSize = 0.012;
              float lowMarkerY = keyBottom;
              float lowMarkerX = keyRight + keyBorder + 0.008;
              vec2 lowPos = vUV - vec2(lowMarkerX, lowMarkerY);
              if (lowPos.x <= 0.0 && lowPos.x >= -markerSize &&
                  abs(lowPos.y) <= markerSize * (1.0 + lowPos.x / markerSize)) {
                finalColor = vec4(1.0, 1.0, 1.0, 1.0);
              }

              // Draw "HIGH" marker (small triangle pointing left at top)
              float highMarkerY = keyTop;
              float highMarkerX = keyRight + keyBorder + 0.008;
              vec2 highPos = vUV - vec2(highMarkerX, highMarkerY);
              if (highPos.x <= 0.0 && highPos.x >= -markerSize &&
                  abs(highPos.y) <= markerSize * (1.0 + highPos.x / markerSize)) {
                finalColor = vec4(1.0, 1.0, 1.0, 1.0);
              }
            }
            #endif

            gl_FragColor = finalColor;
          }`,
      depthTest: false,
      depthWrite: false,
      transparent: true
    });
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false; // Just here to silence a console error.
    this.scene.add(this.mesh);
  }

  public update(uniforms: any): void {
    if (uniforms.colorBuffer !== undefined) {
      this.material.uniforms.colorBuffer.value = uniforms.colorBuffer;
    }
    if (uniforms.mode !== undefined) {
      let mode = 0;
      switch (uniforms.mode) {
        case "Luminance":
          mode = 1;
          break;
        case "Spectral":
          mode = 2;
          break;
        case "Gradient":
          mode = 3;
          break;
        case "Normal":
        default:
      }
      if (mode !== this.material.defines.MODE) {
        this.material.defines.MODE = mode;
        this.material.needsUpdate = true;
      }
    }
    if (uniforms.gradient !== undefined) {
      this.material.uniforms.gradient.value = uniforms.gradient;
    }
    if (uniforms.spectralMin !== undefined) {
      this.material.uniforms.spectralMin.value = uniforms.spectralMin;
    }
    if (uniforms.spectralMax !== undefined) {
      this.material.uniforms.spectralMax.value = uniforms.spectralMax;
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
