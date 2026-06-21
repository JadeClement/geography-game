"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const GLOBE_TEXTURE_PATH = "/globe-map.svg";
const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1024;

function loadGlobeTexture() {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TEXTURE_WIDTH;
      canvas.height = TEXTURE_HEIGHT;
      const context = canvas.getContext("2d");
      if (!context) {
        reject(new Error("Could not create globe texture canvas."));
        return;
      }

      context.drawImage(image, 0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      resolve(texture);
    };
    image.onerror = () => reject(new Error("Failed to load globe map texture."));
    image.src = GLOBE_TEXTURE_PATH;
  });
}

export default function SpinningGlobe() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let animationFrame = 0;
    let disposed = false;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    // Far enough back that the full sphere fits inside the square viewport,
    // so the globe reads as a circle rather than a cropped square.
    camera.position.set(0, 0, 3.2);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(4, 2.5, 5);
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 0.35);
    fillLight.position.set(-3, -1, 2);
    scene.add(ambientLight, keyLight, fillLight);

    const geometry = new THREE.SphereGeometry(1, 72, 72);
    const material = new THREE.MeshPhongMaterial({
      specular: new THREE.Color(0x444444),
      shininess: 18,
    });
    const globe = new THREE.Mesh(geometry, material);
    globe.rotation.x = 0.28;
    globe.rotation.y = -0.75;
    scene.add(globe);

    const atmosphereGeometry = new THREE.SphereGeometry(1.035, 72, 72);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      side: THREE.BackSide,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);

    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      if (!clientWidth || !clientHeight) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight, false);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    const animate = () => {
      if (disposed) return;
      if (!prefersReducedMotion) {
        globe.rotation.y += 0.0028;
      }
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(animate);
    };

    loadGlobeTexture()
      .then((texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        material.map = texture;
        material.needsUpdate = true;
        animate();
      })
      .catch(() => {
        material.color = new THREE.Color(0x0284c7);
        animate();
      });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      geometry.dispose();
      atmosphereGeometry.dispose();
      material.dispose();
      atmosphereMaterial.dispose();
      if (material.map) material.map.dispose();
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="spinning-globe" aria-hidden="true">
      <div className="spinning-globe__glow" />
      <div ref={containerRef} className="spinning-globe__viewport" />
    </div>
  );
}
