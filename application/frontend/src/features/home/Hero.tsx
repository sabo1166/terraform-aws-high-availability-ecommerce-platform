import { motion, useReducedMotion } from "motion/react";
import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "../../components/ErrorBoundary";
import { ProductArt } from "../../components/ProductArt";

const HeroScene = lazy(() => import("./HeroScene"));

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

const fallbackArt = { shape: "vase", palette: ["#c9a47a", "#8a5a3a", "#f4ece1"] } as const;

function StaticStage() {
  return (
    <div style={{ display: "grid", placeItems: "center" }}>
      <div style={{ width: "min(100%, 440px)", borderRadius: 24, overflow: "hidden" }}>
        <ProductArt art={{ shape: fallbackArt.shape, palette: [...fallbackArt.palette] }} label="Ceramic vase illustration" />
      </div>
    </div>
  );
}

/** Shows the interactive 3D scene when WebGL works; otherwise (or on any error) a static illustration. */
function Stage({ reducedMotion }: { reducedMotion: boolean }) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  useEffect(() => setWebgl(hasWebGL()), []);
  if (webgl === null) return <div className="skeleton" aria-hidden="true" style={{ borderRadius: 24 }} />;
  if (!webgl) return <StaticStage />;
  return (
    <ErrorBoundary fallback={<StaticStage />}>
      <Suspense fallback={<div className="skeleton" aria-hidden="true" style={{ borderRadius: 24 }} />}>
        <div style={{ borderRadius: 24, overflow: "hidden" }}>
          <HeroScene reducedMotion={reducedMotion} />
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}

export function Hero() {
  const reduce = useReducedMotion() ?? false;
  const rise = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, delay } };

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container hero-grid">
        <div>
          <motion.p className="eyebrow" {...rise(0)}>
            The autumn edit
          </motion.p>
          <motion.h1 id="hero-title" {...rise(0.08)}>
            Quiet objects for considered homes
          </motion.h1>
          <motion.p className="lede" {...rise(0.16)}>
            Ceramics, lighting, and textiles in warm, natural materials: pieces designed to be used every day and to look better with time.
          </motion.p>
          <motion.div className="hero-actions" {...rise(0.24)}>
            <Link className="btn btn-primary" to="/shop">
              Shop the collection
            </Link>
            <Link className="btn btn-ghost" to="/shop/lighting">
              Explore lighting
            </Link>
          </motion.div>
          <p className="hero-note">Demo store: the products shown are fictional. Drag the scene to turn it.</p>
        </div>
        <div className="hero-stage">
          <Stage reducedMotion={reduce} />
        </div>
      </div>
    </section>
  );
}
