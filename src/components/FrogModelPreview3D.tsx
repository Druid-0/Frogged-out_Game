import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { FROG_PALETTE } from "../game/rules";
import { createFrogMeshBundle, loadFrogTemplates } from "../game/frogModels";
import { soundEngine } from "../game/sound";

interface FrogModelPreview3DProps {
  colorIndex: number;
  modelVariant: number;
  equipBarkPreview?: boolean;
  hopTrigger?: number;
}

export const FrogModelPreview3D: React.FC<FrogModelPreview3DProps> = ({
  colorIndex,
  modelVariant,
  equipBarkPreview = false,
  hopTrigger = 0,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ colorIndex, modelVariant, equipBarkPreview, hopTrigger });
  propsRef.current = { colorIndex, modelVariant, equipBarkPreview, hopTrigger };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = (() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      if (!gl) return true;
      const ext = gl.getExtension("WEBGL_debug_renderer_info");
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: "high-performance",
      });
    } catch {
      return;
    }

    const w = container.clientWidth || 260;
    const h = container.clientHeight || 220;
    renderer.setSize(w, h);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 30);
    camera.position.set(0, 1.35, 2.95);
    camera.lookAt(0, 0.42, 0);

    const hemi = new THREE.HemisphereLight(0xbef264, 0x1a2e19, 1.15);
    scene.add(hemi);

    const dirLight = new THREE.DirectionalLight(0xfef08a, 1.45);
    dirLight.position.set(2.5, 4.5, 3.2);
    scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x4ade80, 0.65);
    rimLight.position.set(-2.5, 2.0, -2.5);
    scene.add(rimLight);

    // Деревянный пень-подиум со мхом и кувшинкой
    const podiumGroup = new THREE.Group();
    podiumGroup.rotation.y = Math.PI * 0.82;
    scene.add(podiumGroup);

    const stumpGeo = new THREE.CylinderGeometry(0.92, 1.08, 0.36, 14);
    const stumpMat = new THREE.MeshStandardMaterial({
      color: 0x4a2c16,
      roughness: 0.9,
      metalness: 0.05,
    });
    const stumpMesh = new THREE.Mesh(stumpGeo, stumpMat);
    stumpMesh.position.y = -0.18;
    podiumGroup.add(stumpMesh);

    const mossPadGeo = new THREE.CylinderGeometry(0.84, 0.88, 0.08, 16);
    const mossPadMat = new THREE.MeshStandardMaterial({
      color: 0x3f7d28,
      roughness: 0.78,
    });
    const mossPad = new THREE.Mesh(mossPadGeo, mossPadMat);
    mossPad.position.y = 0.02;
    podiumGroup.add(mossPad);

    const frogStage = new THREE.Group();
    podiumGroup.add(frogStage);

    let currentVariant = -1;
    let currentColorIdx = -1;
    let currentRig: ReturnType<typeof createFrogMeshBundle> | null = null;
    let loadedTemplates: Awaited<ReturnType<typeof loadFrogTemplates>> = null;
    let lastHopTrigger = propsRef.current.hopTrigger;
    let hopTime = 0;

    const rebuildModel = () => {
      const { colorIndex: cIdx, modelVariant: mVar, equipBarkPreview: bark } =
        propsRef.current;
      const palette = FROG_PALETTE[((cIdx % FROG_PALETTE.length) + FROG_PALETTE.length) % FROG_PALETTE.length];
      if (currentRig) {
        frogStage.remove(currentRig.root);
      }
      const rig = createFrogMeshBundle(palette.hex, loadedTemplates, mVar);
      rig.labelSprite.visible = false; // В 3D-превью табличку над головой скрываем
      rig.barkArmorGroup.visible = Boolean(bark);
      frogStage.add(rig.root);
      currentRig = rig;
      currentVariant = mVar;
      currentColorIdx = cIdx;
    };

    rebuildModel();

    let disposed = false;
    loadFrogTemplates().then((tpl) => {
      if (disposed) return;
      loadedTemplates = tpl;
      rebuildModel();
    });

    const onPointerDown = () => {
      hopTime = 0.48;
      soundEngine.unlock();
      soundEngine.playFrogPreviewClick();
    };
    renderer.domElement.addEventListener("pointerdown", onPointerDown);

    let frameId = 0;
    let lastClock = performance.now();

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === "function") {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      } else {
        frameId = window.setTimeout(cb, 80);
      }
    };

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const dt = Math.min((now - lastClock) / 1000, 0.05);
      lastClock = now;

      const p = propsRef.current;
      if (p.modelVariant !== currentVariant || p.colorIndex !== currentColorIdx) {
        rebuildModel();
      }
      if (currentRig) {
        currentRig.barkArmorGroup.visible = Boolean(p.equipBarkPreview);
      }
      if (p.hopTrigger !== lastHopTrigger) {
        lastHopTrigger = p.hopTrigger;
        hopTime = 0.48;
      }

      podiumGroup.rotation.y += dt * 0.65;

      if (currentRig) {
        if (hopTime > 0) {
          hopTime = Math.max(0, hopTime - dt);
          const prog = 1 - hopTime / 0.48;
          const arc = Math.sin(prog * Math.PI);
          currentRig.root.position.y = arc * 0.55;
          currentRig.visualRoot.scale.set(
            1 - arc * 0.16,
            1 + arc * 0.28,
            1 - arc * 0.16
          );
        } else {
          const breathe = Math.sin(now * 0.004) * 0.03;
          currentRig.root.position.y = 0.04;
          currentRig.visualRoot.scale.set(1 + breathe, 1 - breathe * 0.8, 1 + breathe);
        }
      }

      renderer.render(scene, camera);
      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      frameId = requestAnimationFrame(tick);
    }

    return () => {
      disposed = true;
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      data-testid="frog-model-preview-canvas"
      className="h-full w-full cursor-pointer select-none overflow-hidden"
    />
  );
};
