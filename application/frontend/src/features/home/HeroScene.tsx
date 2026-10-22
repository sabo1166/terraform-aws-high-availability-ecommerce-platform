import { ContactShadows, Environment, Float, Lightformer, OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";

/** A lathe-turned ceramic vase: the profile is revolved around the vertical axis. */
function Vase({ color }: { color: string }) {
  const points = useMemo(() => {
    const profile: [number, number][] = [
      [0.0, 0.0],
      [0.55, 0.0],
      [0.78, 0.18],
      [0.95, 0.6],
      [0.92, 1.0],
      [0.7, 1.45],
      [0.38, 1.78],
      [0.3, 2.05],
      [0.36, 2.2],
      [0.3, 2.24],
    ];
    // Smooth the control points into a curve so the revolved surface has no visible facets.
    const curve = new THREE.SplineCurve(profile.map(([x, y]) => new THREE.Vector2(x, y)));
    return curve.getPoints(120).map((p) => new THREE.Vector2(Math.max(p.x, 0), p.y));
  }, []);
  return (
    <mesh castShadow position={[0, -1.1, 0]}>
      <latheGeometry args={[points, 96]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.02} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Bowl({ color }: { color: string }) {
  return (
    <mesh castShadow position={[1.55, -1.1, 0.5]} scale={0.55}>
      <sphereGeometry args={[1, 64, 32, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
      <meshStandardMaterial color={color} roughness={0.6} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Sphere({ color }: { color: string }) {
  return (
    <mesh castShadow position={[-1.55, -0.78, 0.55]}>
      <sphereGeometry args={[0.46, 64, 48]} />
      <meshStandardMaterial color={color} roughness={0.5} />
    </mesh>
  );
}

export interface HeroSceneProps {
  /** Disables continuous rotation and floating for users who prefer reduced motion. */
  reducedMotion: boolean;
}

export default function HeroScene({ reducedMotion }: HeroSceneProps) {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.4, 6.4], fov: 32 }}
      frameloop={reducedMotion ? "demand" : "always"}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      aria-label="Interactive 3D ceramic vase. Drag to rotate."
    >
      <color attach="background" args={["#f0e4d2"]} />
      <hemisphereLight args={["#fff4e0", "#c9a47a", 0.7]} />
      <directionalLight position={[3, 5, 4]} intensity={1.8} castShadow shadow-mapSize={[1024, 1024]} />
      {/* A procedural studio environment: no external HDR files are downloaded. */}
      <Environment resolution={256}>
        <Lightformer form="rect" intensity={2.2} position={[0, 4, -3]} scale={[8, 3, 1]} color="#fff2dc" />
        <Lightformer form="rect" intensity={1.2} position={[-5, 1, 2]} scale={[2, 6, 1]} color="#ffe2c4" />
        <Lightformer form="rect" intensity={0.8} position={[5, 0, 1]} scale={[2, 6, 1]} color="#dde6ee" />
      </Environment>
      <Float speed={reducedMotion ? 0 : 1.2} rotationIntensity={reducedMotion ? 0 : 0.15} floatIntensity={reducedMotion ? 0 : 0.35}>
        <Vase color="#c9a47a" />
        <Bowl color="#efe6d8" />
        <Sphere color="#a8451f" />
      </Float>
      <ContactShadows position={[0, -1.12, 0]} opacity={0.45} scale={9} blur={2.6} far={3} />
      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={!reducedMotion}
        autoRotateSpeed={0.8}
        minPolarAngle={Math.PI / 3}
        maxPolarAngle={Math.PI / 1.9}
      />
    </Canvas>
  );
}

