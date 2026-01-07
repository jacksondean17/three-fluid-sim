import {
  HalfFloatType,
  OrthographicCamera,
  RGBAFormat,
  RGBFormat,
  Texture,
  TextureLoader,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer
} from "three";
import { AdvectionPass } from "./passes/AdvectionPass";
import { BoundaryPass } from "./passes/BoundaryPass";
import { ColorInitPass } from "./passes/ColorInitPass";
import { CompositionPass } from "./passes/CompositionPass";
import { DivergencePass } from "./passes/DivergencePass";
import { FlowSourcePass } from "./passes/FlowSourcePass";
import { GradientSubstractionPass } from "./passes/GradientSubstractionPass";
import { JacobiIterationsPass } from "./passes/JacobiIterationsPass";
import { TouchColorPass } from "./passes/TouchColorPass";
import { TouchForcePass } from "./passes/TouchForcePass";
import { VelocityInitPass } from "./passes/VelocityInitPass";
import { MeasurementPass } from "./passes/MeasurementPass";
import { SmokeEmitterPass } from "./passes/SmokeEmitterPass";
import { RenderTarget } from "./RenderTarget";

// tslint:disable:no-var-requires
const Stats = require("stats.js");
const dat = require("dat.gui");
// tslint:enable:no-var-requires

const gradients: string[] = ["gradient.jpg"];
const gradientTextures: Texture[] = [];
loadGradients();

// Fluid presets with different viscosity characteristics
// Note: "viscosity" here is a velocity decay factor, not physical viscosity.
// Values are tuned for visual approximation of relative fluid behaviors,
// not physically accurate simulation. Real kinematic viscosities span
// many orders of magnitude (air ~1.5e-5, water ~1e-6, honey ~1e-2 m²/s).
interface IFluidPreset {
  viscosity: number;
  colorDecay: number;
}

const fluidPresets: { [key: string]: IFluidPreset } = {
  Air: { viscosity: 0.0001, colorDecay: 0.015 },
  Alcohol: { viscosity: 0.0008, colorDecay: 0.004 },
  Water: { viscosity: 0.001, colorDecay: 0.005 },
  "Light Oil": { viscosity: 0.005, colorDecay: 0.003 },
  "Heavy Oil": { viscosity: 0.012, colorDecay: 0.002 },
  Honey: { viscosity: 0.025, colorDecay: 0.001 },
  Molasses: { viscosity: 0.04, colorDecay: 0.0005 },
  Custom: { viscosity: 0.001, colorDecay: 0.005 }
};

// App configuration options.
const configuration = {
  Simulate: true,
  Iterations: 32,
  Radius: 0.25,
  Scale: 0.5,
  FluidPreset: "Water",
  Viscosity: 0.001,
  ColorDecay: 0.005,
  Boundaries: true,
  AddColor: true,
  FlowEnabled: true,
  FlowVelocity: 1.0,
  ChevronEnabled: true,
  ChevronColumns: 3,
  ChevronRows: 8,
  ChevronLength: 0.15,
  ChevronWidth: 0.025,
  ChevronAngle: 45,
  ChevronGap: 0.0,
  ChevronSpacingX: 0.13,
  ChevronSpacingY: 0.12,
  Visualize: "Pressure",
  Mode: "Spectral",
  SpectralMin: 400,
  SpectralMax: 650,
  SmokeEnabled: true,
  SmokeEmitters: 3,
  SmokeRadius: 0.015,
  SmokeIntensity: 0.4,
  Timestep: "1/60",
  Reset: () => {
    velocityAdvectionPass.update({
      inputTexture: velocityInitTexture,
      velocity: velocityInitTexture
    });
    colorAdvectionPass.update({
      inputTexture: colorInitTexture,
      velocity: velocityInitTexture
    });
    v = undefined;
    c = undefined;
  },
  Github: () => {
    window.open("https://github.com/amsXYZ/three-fluid-sim");
  },
  Twitter: () => {
    window.open("https://twitter.com/_amsXYZ");
  }
};

// Measurement system
interface IMeasurement {
  type: "line" | "point";
  x: number;  // x position (0-1 in aspect-corrected space)
  y: number;  // y position (0-1), only used for point measurements
  enabled: boolean;
  pressure: number;
  velocityX: number;
  velocityY: number;
  velocityMag: number;
  // Formatted strings for GUI display
  pressureDisplay: string;
  velocityDisplay: string;
}

const measurements: IMeasurement[] = [];
const MAX_MEASUREMENTS = 8;

const measurementConfig = {
  showOverlay: true
};

// Initialize with a couple of default measurements
measurements.push({ type: "line", x: 0.75, y: 0.5, enabled: true, pressure: 0, velocityX: 0, velocityY: 0, velocityMag: 0, pressureDisplay: "0.000", velocityDisplay: "0.000" });
measurements.push({ type: "line", x: 1.3, y: 0.5, enabled: true, pressure: 0, velocityX: 0, velocityY: 0, velocityMag: 0, pressureDisplay: "0.000", velocityDisplay: "0.000" });

// Html/Three.js initialization.
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const stats = new Stats();
canvas.parentElement.appendChild(stats.dom);
const gui = new dat.GUI();

// Make GUI scrollable for smaller screens
gui.domElement.style.maxHeight = "calc(100vh - 20px)";
gui.domElement.style.overflowY = "auto";

// Declare GUI controllers before initGUI() to avoid TDZ errors
let viscosityController: any;
let colorDecayController: any;

initGUI();

const renderer = new WebGLRenderer({ canvas });
renderer.autoClear = false;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
const camera = new OrthographicCamera(0, 0, 0, 0, 0, 0);
let dt = 1 / 60;

// Check floating point texture support.
if (
  !(
    renderer.context.getExtension("OES_texture_half_float") &&
    renderer.context.getExtension("OES_texture_half_float_linear")
  )
) {
  alert("This demo is not supported on your device.");
}

const resolution = new Vector2(
  configuration.Scale * window.innerWidth,
  configuration.Scale * window.innerHeight
);
const aspect = new Vector2(resolution.x / resolution.y, 1.0);

// RenderTargets initialization.
// Use RGBAFormat for velocity and pressure to enable readRenderTargetPixels for measurements
const velocityRT = new RenderTarget(resolution, 2, RGBAFormat, HalfFloatType);
const divergenceRT = new RenderTarget(resolution, 1, RGBFormat, HalfFloatType);
const pressureRT = new RenderTarget(resolution, 2, RGBAFormat, HalfFloatType);
const colorRT = new RenderTarget(resolution, 2, RGBFormat, UnsignedByteType);

// These variables are used to store the result the result of the different
// render passes. Not needed but nice for convenience.
let c: Texture;
let v: Texture;
let d: Texture;
let p: Texture;

// Render passes initialization.
const velocityInitPass = new VelocityInitPass(renderer, resolution);
const velocityInitTexture = velocityInitPass.render();
const colorInitPass = new ColorInitPass(renderer, resolution);
const colorInitTexture = colorInitPass.render();
const velocityAdvectionPass = new AdvectionPass(
  velocityInitTexture,
  velocityInitTexture,
  0
);
const colorAdvectionPass = new AdvectionPass(
  velocityInitTexture,
  colorInitTexture,
  configuration.ColorDecay
);
const touchForceAdditionPass = new TouchForcePass(
  resolution,
  configuration.Radius
);
const touchColorAdditionPass = new TouchColorPass(
  resolution,
  configuration.Radius
);
const flowSourcePass = new FlowSourcePass(resolution);
const velocityBoundary = new BoundaryPass();
const velocityDivergencePass = new DivergencePass();
const pressurePass = new JacobiIterationsPass();
const pressureSubstractionPass = new GradientSubstractionPass();
const compositionPass = new CompositionPass();

// Smoke emitter system
const smokeEmitterPass = new SmokeEmitterPass(resolution);
const emitterPositions = [
  new Vector3(0.05, 0.25, 1.0),  // x, y, enabled
  new Vector3(0.05, 0.5, 1.0),
  new Vector3(0.05, 0.75, 1.0),
  new Vector3(0.05, 0.5, 0.0)   // 4th disabled by default
];
let smokeTime = 0;

// Measurement system - uses UnsignedByteType for reliable readback
const measurementRT = new RenderTarget(new Vector2(1, 1), 1, RGBAFormat, UnsignedByteType);
const measurementPass = new MeasurementPass();
const measurementBuffer = new Uint8Array(4);
const VALUE_SCALE = 10.0; // Must match shader valueScale uniform

// Event listeners (resizing and mouse/touch input).
window.addEventListener("resize", (event: UIEvent) => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  resolution.set(
    configuration.Scale * window.innerWidth,
    configuration.Scale * window.innerHeight
  );
  velocityRT.resize(resolution);
  divergenceRT.resize(resolution);
  pressureRT.resize(resolution);
  colorRT.resize(resolution);

  aspect.set(resolution.x / resolution.y, 1.0);
  touchForceAdditionPass.update({ aspect });
  touchColorAdditionPass.update({ aspect });
});

window.addEventListener("keyup", (event: KeyboardEvent) => {
  if (event.keyCode === 72) {
    stats.dom.hidden = !stats.dom.hidden;
  }
});

interface ITouchInput {
  id: string | number;
  input: Vector4;
}

let inputTouches: ITouchInput[] = [];

canvas.addEventListener("mousedown", (event: MouseEvent) => {
  if (event.button === 0) {
    const x = (event.clientX / canvas.clientWidth) * aspect.x;
    const y = 1.0 - (event.clientY + window.scrollY) / canvas.clientHeight;
    inputTouches.push({
      id: "mouse",
      input: new Vector4(x, y, 0, 0)
    });
  }
});
canvas.addEventListener("mousemove", (event: MouseEvent) => {
  if (inputTouches.length > 0) {
    const x = (event.clientX / canvas.clientWidth) * aspect.x;
    const y = 1.0 - (event.clientY + window.scrollY) / canvas.clientHeight;
    inputTouches[0].input
      .setZ(x - inputTouches[0].input.x)
      .setW(y - inputTouches[0].input.y);
    inputTouches[0].input.setX(x).setY(y);
  }
});
canvas.addEventListener("mouseup", (event: MouseEvent) => {
  if (event.button === 0) {
    inputTouches.pop();
  }
});

canvas.addEventListener("touchstart", (event: TouchEvent) => {
  for (const touch of event.changedTouches) {
    const x = (touch.clientX / canvas.clientWidth) * aspect.x;
    const y = 1.0 - (touch.clientY + window.scrollY) / canvas.clientHeight;
    inputTouches.push({
      id: touch.identifier,
      input: new Vector4(x, y, 0, 0)
    });
  }
});

canvas.addEventListener("touchmove", (event: TouchEvent) => {
  event.preventDefault();
  for (const touch of event.changedTouches) {
    const registeredTouch = inputTouches.find(value => {
      return value.id === touch.identifier;
    });
    if (registeredTouch !== undefined) {
      const x = (touch.clientX / canvas.clientWidth) * aspect.x;
      const y = 1.0 - (touch.clientY + window.scrollY) / canvas.clientHeight;
      registeredTouch.input
        .setZ(x - registeredTouch.input.x)
        .setW(y - registeredTouch.input.y);
      registeredTouch.input.setX(x).setY(y);
    }
  }
});

canvas.addEventListener("touchend", (event: TouchEvent) => {
  for (const touch of event.changedTouches) {
    const registeredTouch = inputTouches.find(value => {
      return value.id === touch.identifier;
    });
    if (registeredTouch !== undefined) {
      inputTouches = inputTouches.filter(value => {
        return value.id !== registeredTouch.id;
      });
    }
  }
});

canvas.addEventListener("touchcancel", (event: TouchEvent) => {
  for (let i = 0; i < inputTouches.length; ++i) {
    for (let j = 0; j < event.touches.length; ++j) {
      if (inputTouches[i].id === event.touches.item(j).identifier) {
        break;
      } else if (j === event.touches.length - 1) {
        inputTouches.splice(i--, 1);
      }
    }
  }
});

// Dat.GUI configuration.
function loadGradients() {
  const textureLoader = new TextureLoader().setPath("./resources/");
  for (let i = 0; i < gradients.length; ++i) {
    textureLoader.load(gradients[i], (texture: Texture) => {
      gradientTextures[i] = texture;
    });
  }
}

function initGUI() {
  // Fluid properties folder
  const fluid = gui.addFolder("Fluid");
  fluid
    .add(configuration, "FluidPreset", Object.keys(fluidPresets))
    .onChange((value: string) => {
      if (value !== "Custom") {
        const preset = fluidPresets[value];
        configuration.Viscosity = preset.viscosity;
        configuration.ColorDecay = preset.colorDecay;
        // Controllers may not exist during initial GUI setup
        if (viscosityController) viscosityController.updateDisplay();
        if (colorDecayController) colorDecayController.updateDisplay();
      }
    });
  viscosityController = fluid.add(configuration, "Viscosity", 0.0, 0.1, 0.001)
    .onChange(() => {
      configuration.FluidPreset = "Custom";
    });
  colorDecayController = fluid.add(configuration, "ColorDecay", 0.0, 0.1, 0.001)
    .onChange(() => {
      configuration.FluidPreset = "Custom";
    });

  const sim = gui.addFolder("Simulation");
  sim
    .add(configuration, "Scale", 0.1, 2.0, 0.1)
    .onFinishChange((value: number) => {
      resolution.set(
        configuration.Scale * window.innerWidth,
        configuration.Scale * window.innerHeight
      );
      velocityRT.resize(resolution);
      divergenceRT.resize(resolution);
      pressureRT.resize(resolution);
      colorRT.resize(resolution);
    });
  sim.add(configuration, "Iterations", 16, 128, 1);
  sim
    .add(configuration, "Timestep", ["1/15", "1/30", "1/60", "1/90", "1/120"])
    .onChange((value: string) => {
      switch (value) {
        case "1/15":
          dt = 1 / 15;
          break;
        case "1/30":
          dt = 1 / 30;
          break;
        case "1/60":
          dt = 1 / 60;
          break;
        case "1/90":
          dt = 1 / 90;
          break;
        case "1/120":
          dt = 1 / 120;
          break;
      }
    });
  sim.add(configuration, "Simulate");
  sim.add(configuration, "Boundaries");
  sim.add(configuration, "Reset");

  const input = gui.addFolder("Input");
  input.add(configuration, "Radius", 0.1, 1, 0.1);
  input.add(configuration, "AddColor");

  const flow = gui.addFolder("Flow");
  flow.add(configuration, "FlowEnabled");
  flow.add(configuration, "FlowVelocity", 0.0, 2.0, 0.1);

  const chevron = gui.addFolder("Chevron");
  chevron.add(configuration, "ChevronEnabled");
  chevron.add(configuration, "ChevronColumns", 1, 10, 1);
  chevron.add(configuration, "ChevronRows", 1, 10, 1);
  chevron.add(configuration, "ChevronLength", 0.05, 0.4, 0.01);
  chevron.add(configuration, "ChevronWidth", 0.01, 0.1, 0.005);
  chevron.add(configuration, "ChevronAngle", 15, 75, 1);
  chevron.add(configuration, "ChevronGap", 0.0, 0.15, 0.005);
  chevron.add(configuration, "ChevronSpacingX", 0.1, 0.5, 0.01);
  chevron.add(configuration, "ChevronSpacingY", 0.05, 0.3, 0.01);

  gui.add(configuration, "Visualize", [
    "Color",
    "Velocity",
    "Divergence",
    "Pressure"
  ]);
  gui.add(configuration, "Mode", [
    "Normal",
    "Luminance",
    "Spectral",
    "Gradient"
  ]);
  gui.add(configuration, "SpectralMin", 340, 600, 10);
  gui.add(configuration, "SpectralMax", 450, 700, 10);

  // Smoke emitter controls
  const smokeFolder = gui.addFolder("Smoke");
  smokeFolder.add(configuration, "SmokeEnabled").name("Enabled");
  smokeFolder.add(configuration, "SmokeEmitters", 1, 4, 1).name("Emitters");
  smokeFolder.add(configuration, "SmokeRadius", 0.005, 0.05, 0.005).name("Radius");
  smokeFolder.add(configuration, "SmokeIntensity", 0.1, 1.0, 0.1).name("Intensity");

  // Measurement controls
  const measureFolder = gui.addFolder("Measurements");
  const measurementFolders: any[] = [];

  const measurementActions = {
    addLine: () => {
      if (measurements.length < MAX_MEASUREMENTS) {
        measurements.push({ type: "line", x: 0.5, y: 0.5, enabled: true, pressure: 0, velocityX: 0, velocityY: 0, velocityMag: 0, pressureDisplay: "0.000", velocityDisplay: "0.000" });
        rebuildMeasurementGUI();
      }
    },
    addPoint: () => {
      if (measurements.length < MAX_MEASUREMENTS) {
        measurements.push({ type: "point", x: 0.5, y: 0.5, enabled: true, pressure: 0, velocityX: 0, velocityY: 0, velocityMag: 0, pressureDisplay: "0.000", velocityDisplay: "0.000" });
        rebuildMeasurementGUI();
      }
    }
  };

  measureFolder.add(measurementConfig, "showOverlay").name("Show Overlay");
  measureFolder.add(measurementActions, "addLine").name("Add Line");
  measureFolder.add(measurementActions, "addPoint").name("Add Point");

  function rebuildMeasurementGUI() {
    // Remove old measurement folders
    for (const folder of measurementFolders) {
      measureFolder.removeFolder(folder);
    }
    measurementFolders.length = 0;

    // Create new folders for each measurement
    for (let i = 0; i < measurements.length; i++) {
      const m = measurements[i];
      const name = m.type === "line" ? `Line ${i + 1}` : `Point ${i + 1}`;
      const folder = measureFolder.addFolder(name);
      measurementFolders.push(folder);

      folder.add(m, "enabled").name("Enabled");
      folder.add(m, "x", 0, 2.0, 0.01).name("X Position");
      if (m.type === "point") {
        folder.add(m, "y", 0, 1, 0.01).name("Y Position");
      }
      folder.add(m, "pressureDisplay").name("Pressure").listen();
      folder.add(m, "velocityDisplay").name("Velocity").listen();

      const removeConfig = {
        remove: () => {
          measurements.splice(i, 1);
          rebuildMeasurementGUI();
        }
      };
      folder.add(removeConfig, "remove").name("Remove");
    }
  }

  rebuildMeasurementGUI();

  const github = gui.add(configuration, "Github");
  github.__li.className = "guiIconText";
  github.__li.style.borderLeft = "3px solid #8C8C8C";
  const githubIcon = document.createElement("span");
  githubIcon.className = "guiIcon github";
  github.domElement.parentElement.appendChild(githubIcon);

  const twitter = gui.add(configuration, "Twitter");
  twitter.__li.className = "guiIconText";
  twitter.__li.style.borderLeft = "3px solid #8C8C8C";
  const twitterIcon = document.createElement("span");
  twitterIcon.className = "guiIcon twitter";
  twitter.domElement.parentElement.appendChild(twitterIcon);
}

// Render loop.
function render() {
  if (configuration.Simulate) {
    // Advect the velocity vector field (with viscosity/decay).
    velocityAdvectionPass.update({ timeDelta: dt, decay: configuration.Viscosity });
    v = velocityRT.set(renderer);
    renderer.render(velocityAdvectionPass.scene, camera);

    // Add external forces/colors according to input.
    if (inputTouches.length > 0) {
      touchForceAdditionPass.update({
        touches: inputTouches,
        radius: configuration.Radius,
        velocity: v
      });
      v = velocityRT.set(renderer);
      renderer.render(touchForceAdditionPass.scene, camera);

      if (configuration.AddColor) {
        touchColorAdditionPass.update({
          touches: inputTouches,
          radius: configuration.Radius,
          color: c
        });
        c = colorRT.set(renderer);
        renderer.render(touchColorAdditionPass.scene, camera);
      }
    }

    // Add flow source velocity (continuous left-to-right flow).
    if (configuration.FlowEnabled) {
      flowSourcePass.update({
        velocity: v,
        flowVelocity: configuration.FlowVelocity
      });
      v = velocityRT.set(renderer);
      renderer.render(flowSourcePass.scene, camera);
    }

    // Add velocity boundaries (simulation walls and chevron obstacles).
    if (configuration.Boundaries || configuration.ChevronEnabled) {
      velocityBoundary.update({
        velocity: v,
        flowEnabled: configuration.FlowEnabled,
        chevronEnabled: configuration.ChevronEnabled,
        chevronColumns: configuration.ChevronColumns,
        chevronRows: configuration.ChevronRows,
        chevronLength: configuration.ChevronLength,
        chevronWidth: configuration.ChevronWidth,
        chevronAngle: configuration.ChevronAngle,
        chevronGap: configuration.ChevronGap,
        chevronSpacingX: configuration.ChevronSpacingX,
        chevronSpacingY: configuration.ChevronSpacingY,
        aspect
      });
      v = velocityRT.set(renderer);
      renderer.render(velocityBoundary.scene, camera);
    }

    // Compute the divergence of the advected velocity vector field.
    velocityDivergencePass.update({
      timeDelta: dt,
      velocity: v
    });
    d = divergenceRT.set(renderer);
    renderer.render(velocityDivergencePass.scene, camera);

    // Compute the pressure gradient of the advected velocity vector field (using
    // jacobi iterations).
    pressurePass.update({ divergence: d });
    for (let i = 0; i < configuration.Iterations; ++i) {
      p = pressureRT.set(renderer);
      renderer.render(pressurePass.scene, camera);
      pressurePass.update({ previousIteration: p });
    }

    // Substract the pressure gradient from to obtain a velocity vector field with
    // zero divergence.
    pressureSubstractionPass.update({
      timeDelta: dt,
      velocity: v,
      pressure: p
    });
    v = velocityRT.set(renderer);
    renderer.render(pressureSubstractionPass.scene, camera);

    // Advect the color buffer with the divergence-free velocity vector field.
    colorAdvectionPass.update({
      timeDelta: dt,
      inputTexture: c,
      velocity: v,
      decay: configuration.ColorDecay
    });
    c = colorRT.set(renderer);
    renderer.render(colorAdvectionPass.scene, camera);

    // Add smoke/dye from emitters
    if (configuration.SmokeEnabled) {
      smokeTime += dt;

      // Update emitter enabled states based on SmokeEmitters count
      for (let i = 0; i < 4; i++) {
        emitterPositions[i].z = i < configuration.SmokeEmitters ? 1.0 : 0.0;
      }

      smokeEmitterPass.update({
        colorBuffer: c,
        aspect,
        emitter0: emitterPositions[0],
        emitter1: emitterPositions[1],
        emitter2: emitterPositions[2],
        emitter3: emitterPositions[3],
        emitterRadius: configuration.SmokeRadius,
        emitterIntensity: configuration.SmokeIntensity,
        emitterColor: new Vector3(1.0, 1.0, 1.0),
        time: smokeTime
      });
      c = colorRT.set(renderer);
      renderer.render(smokeEmitterPass.scene, camera);
    }

    // Feed the input of the advection passes with the last advected results.
    velocityAdvectionPass.update({
      inputTexture: v,
      velocity: v
    });
    colorAdvectionPass.update({
      inputTexture: c
    });
  }

  // Render to the main framebuffer the desired visualization.
  renderer.setRenderTarget(null);
  let visualization;
  switch (configuration.Visualize) {
    case "Color":
      visualization = c;
      break;
    case "Velocity":
      visualization = v;
      break;
    case "Divergence":
      visualization = d;
      break;
    case "Pressure":
      visualization = p;
      break;
  }
  compositionPass.update({
    colorBuffer: visualization,
    mode: configuration.Mode,
    gradient: gradientTextures[0],
    spectralMin: configuration.SpectralMin,
    spectralMax: configuration.SpectralMax,
    chevronEnabled: configuration.ChevronEnabled,
    chevronColumns: configuration.ChevronColumns,
    chevronRows: configuration.ChevronRows,
    chevronLength: configuration.ChevronLength,
    chevronWidth: configuration.ChevronWidth,
    chevronAngle: configuration.ChevronAngle,
    chevronGap: configuration.ChevronGap,
    chevronSpacingX: configuration.ChevronSpacingX,
    chevronSpacingY: configuration.ChevronSpacingY,
    aspect
  });
  renderer.render(compositionPass.scene, camera);

  // Update measurements
  updateMeasurements();

  // Draw measurement overlay
  if (measurementConfig.showOverlay) {
    drawMeasurementOverlay();
  }
}

// Create overlay canvas for measurements
const overlayCanvas = document.createElement("canvas");
overlayCanvas.style.position = "absolute";
overlayCanvas.style.top = "0";
overlayCanvas.style.left = "0";
overlayCanvas.style.pointerEvents = "none";
overlayCanvas.width = window.innerWidth;
overlayCanvas.height = window.innerHeight;
canvas.parentElement.appendChild(overlayCanvas);
const overlayCtx = overlayCanvas.getContext("2d");

// Resize overlay canvas with window
window.addEventListener("resize", () => {
  overlayCanvas.width = window.innerWidth;
  overlayCanvas.height = window.innerHeight;
});

// Sample position vector for measurement pass
const samplePosition = new Vector2();

// Sample a single point from pressure and velocity textures using shader-based readback
function sampleAtPosition(x: number, y: number): { pressure: number; velX: number; velY: number } {
  // Clamp normalized coordinates to valid range
  const clampedX = Math.max(0, Math.min(1, x));
  const clampedY = Math.max(0, Math.min(1, y));

  samplePosition.set(clampedX, clampedY);

  // Update measurement pass with current textures and position
  measurementPass.update({
    pressureTexture: p,
    velocityTexture: v,
    samplePosition,
    valueScale: VALUE_SCALE
  });

  // Render to 1x1 measurement texture
  measurementRT.set(renderer);
  renderer.render(measurementPass.scene, camera);

  // Read the single pixel (this works reliably with UnsignedByteType)
  renderer.readRenderTargetPixels(measurementRT.previous, 0, 0, 1, 1, measurementBuffer);

  // Decode values: encoded = (value / scale + 0.5) => value = (encoded - 0.5) * scale
  // Buffer values are 0-255, normalize to 0-1 first
  const pressure = ((measurementBuffer[0] / 255) - 0.5) * VALUE_SCALE;
  const velX = ((measurementBuffer[1] / 255) - 0.5) * VALUE_SCALE;
  const velY = ((measurementBuffer[2] / 255) - 0.5) * VALUE_SCALE;

  return { pressure, velX, velY };
}

function updateMeasurements() {
  if (!p || !v) return;

  for (const m of measurements) {
    if (!m.enabled) continue;

    // Convert x from aspect-corrected space to normalized 0-1
    const normalizedX = m.x / aspect.x;

    if (m.type === "line") {
      // Sample multiple points along the vertical line and average
      const numSamples = 8; // Reduced from 32 since each sample requires a render pass
      let pressureSum = 0;
      let velXSum = 0;
      let velYSum = 0;

      for (let i = 0; i < numSamples; i++) {
        const y = (i + 0.5) / numSamples;
        const sample = sampleAtPosition(normalizedX, y);

        pressureSum += sample.pressure;
        velXSum += sample.velX;
        velYSum += sample.velY;
      }

      m.pressure = Math.round((pressureSum / numSamples) * 1000) / 1000;
      m.velocityX = Math.round((velXSum / numSamples) * 1000) / 1000;
      m.velocityY = Math.round((velYSum / numSamples) * 1000) / 1000;
      m.velocityMag = Math.round(Math.sqrt(m.velocityX * m.velocityX + m.velocityY * m.velocityY) * 1000) / 1000;
    } else {
      // Point measurement - single sample
      const sample = sampleAtPosition(normalizedX, m.y);

      m.pressure = Math.round(sample.pressure * 1000) / 1000;
      m.velocityX = Math.round(sample.velX * 1000) / 1000;
      m.velocityY = Math.round(sample.velY * 1000) / 1000;
      m.velocityMag = Math.round(Math.sqrt(m.velocityX * m.velocityX + m.velocityY * m.velocityY) * 1000) / 1000;
    }

    // Update formatted display strings for GUI
    m.pressureDisplay = m.pressure.toFixed(3);
    m.velocityDisplay = m.velocityMag.toFixed(3);
  }
}

function drawMeasurementOverlay() {
  if (!overlayCtx) return;

  // Clear the overlay
  overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

  overlayCtx.font = "12px monospace";
  overlayCtx.textBaseline = "top";

  for (let i = 0; i < measurements.length; i++) {
    const m = measurements[i];
    if (!m.enabled) continue;

    // Convert position to screen coordinates
    const screenX = (m.x / aspect.x) * overlayCanvas.width;

    if (m.type === "line") {
      // Draw vertical line
      overlayCtx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      overlayCtx.lineWidth = 2;
      overlayCtx.setLineDash([5, 5]);
      overlayCtx.beginPath();
      overlayCtx.moveTo(screenX, 0);
      overlayCtx.lineTo(screenX, overlayCanvas.height);
      overlayCtx.stroke();
      overlayCtx.setLineDash([]);

      // Draw label with background
      const label = `L${i + 1}: P=${m.pressure.toFixed(3)} V=${m.velocityMag.toFixed(3)}`;
      const labelX = screenX + 5;
      const labelY = 10 + i * 40;

      overlayCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
      const textWidth = overlayCtx.measureText(label).width;
      overlayCtx.fillRect(labelX - 2, labelY - 2, textWidth + 4, 16);

      overlayCtx.fillStyle = "#00ff00";
      overlayCtx.fillText(label, labelX, labelY);
    } else {
      // Draw point marker
      const screenY = (1 - m.y) * overlayCanvas.height;

      overlayCtx.strokeStyle = "rgba(255, 255, 0, 0.9)";
      overlayCtx.lineWidth = 2;
      overlayCtx.beginPath();
      overlayCtx.arc(screenX, screenY, 8, 0, Math.PI * 2);
      overlayCtx.stroke();

      // Crosshair
      overlayCtx.beginPath();
      overlayCtx.moveTo(screenX - 12, screenY);
      overlayCtx.lineTo(screenX + 12, screenY);
      overlayCtx.moveTo(screenX, screenY - 12);
      overlayCtx.lineTo(screenX, screenY + 12);
      overlayCtx.stroke();

      // Draw label with background
      const label = `P${i + 1}: P=${m.pressure.toFixed(3)} V=${m.velocityMag.toFixed(3)}`;
      const labelX = screenX + 15;
      const labelY = screenY - 8;

      overlayCtx.fillStyle = "rgba(0, 0, 0, 0.7)";
      const textWidth = overlayCtx.measureText(label).width;
      overlayCtx.fillRect(labelX - 2, labelY - 2, textWidth + 4, 16);

      overlayCtx.fillStyle = "#ffff00";
      overlayCtx.fillText(label, labelX, labelY);
    }
  }
}

function animate() {
  requestAnimationFrame(animate);
  stats.begin();
  render();
  stats.end();
}
animate();
