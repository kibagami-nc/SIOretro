import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPixelatedPass } from 'three/examples/jsm/postprocessing/RenderPixelatedPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Character } from '../characters';
import { buildCharacter } from './character-model';

/** Petit aperçu 3D pixelisé d'un personnage qui tourne sur lui-même. */
export class PreviewRenderer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private turntable = new THREE.Group();
  private model?: THREE.Group;
  private platform: THREE.Mesh;
  private rim: THREE.PointLight;
  private rafId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  private readonly onResize = () => this.resize();

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    this.renderer.setPixelRatio(1);
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    this.camera.position.set(0, 1.5, 4.2);
    this.camera.lookAt(0, 1.0, 0);

    this.scene.add(new THREE.AmbientLight(0xbfc4d4, 1.1));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(2, 4, 3);
    this.scene.add(key);
    this.rim = new THREE.PointLight(0xffffff, 8, 12, 2);
    this.rim.position.set(-2, 1.5, -1.5);
    this.scene.add(this.rim);

    this.platform = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.25, 0.18, 16),
      new THREE.MeshStandardMaterial({ color: 0x2a2e3c, roughness: 0.8 }),
    );
    this.platform.position.y = -0.09;
    this.scene.add(this.platform);
    this.scene.add(this.turntable);

    this.composer = new EffectComposer(this.renderer);
    const pass = new RenderPixelatedPass(3, this.scene, this.camera);
    pass.normalEdgeStrength = 0.3;
    pass.depthEdgeStrength = 0.4;
    this.composer.addPass(pass);
    this.composer.addPass(new OutputPass());

    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  setCharacter(char: Character): void {
    if (this.model) {
      this.turntable.remove(this.model);
      this.model.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        (m.material as THREE.Material | undefined)?.dispose?.();
      });
    }
    this.model = buildCharacter(char);
    this.turntable.add(this.model);
    this.rim.color.setHex(char.accent);
    (this.platform.material as THREE.MeshStandardMaterial).emissive.setHex(char.color);
    (this.platform.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.25;
  }

  start(): void {
    this.clock.start();
    this.loop();
  }

  private loop = (): void => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.loop);
    const dt = this.clock.getDelta();
    this.turntable.rotation.y += dt * 0.8;
    this.composer.render();
  };

  private resize(): void {
    const w = this.canvas.clientWidth || 320;
    const h = this.canvas.clientHeight || 360;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    window.removeEventListener('resize', this.onResize);
    this.composer.dispose();
    this.renderer.dispose();
  }
}
