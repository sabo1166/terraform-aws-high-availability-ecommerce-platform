import { Link } from "react-router-dom";
import { Reveal } from "../../components/Reveal";
import { api } from "../../lib/api";
import { useAsync } from "../../lib/useAsync";
import { ProductCard, ProductCardSkeleton } from "../catalog/ProductCard";
import { Hero } from "./Hero";
import { ProductArt } from "../../components/ProductArt";

function Featured() {
  const featured = useAsync((signal) => api.featured(signal), "featured");
  return (
    <section className="section" aria-labelledby="featured-title">
      <div className="container">
        <Reveal>
          <div className="section-head">
            <div>
              <p className="eyebrow">Curated</p>
              <h2 id="featured-title" style={{ margin: 0 }}>Pieces we keep coming back to</h2>
            </div>
            <Link className="btn btn-ghost btn-sm" to="/shop">View all</Link>
          </div>
        </Reveal>
        {featured.error ? (
          <div className="alert alert-error" role="alert">
            {featured.error.message}{" "}
            <button type="button" className="link-btn" onClick={featured.reload}>Try again</button>
          </div>
        ) : (
          <div className="grid grid-products">
            {featured.loading
              ? Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)
              : featured.data?.items.slice(0, 8).map((product, index) => (
                  <Reveal key={product.id} delay={Math.min(index, 4) * 0.05}>
                    <ProductCard product={product} />
                  </Reveal>
                ))}
          </div>
        )}
      </div>
    </section>
  );
}

function Categories() {
  const categories = useAsync((signal) => api.categories(signal), "categories");
  if (categories.error || !categories.data) return null;
  return (
    <section className="section" style={{ paddingBlock: "0 clamp(48px, 8vw, 96px)" }} aria-labelledby="cat-title">
      <div className="container">
        <Reveal>
          <p className="eyebrow">Collections</p>
          <h2 id="cat-title">Shop by room and routine</h2>
        </Reveal>
        <div className="grid grid-categories">
          {categories.data.categories.map((category, index) => (
            <Reveal key={category.slug} delay={index * 0.05}>
              <Link className="category-tile" to={`/shop/${category.slug}`}>
                <h3>{category.name}</h3>
                <p>{category.productCount ?? 0} pieces</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Editorial() {
  return (
    <section className="container" aria-labelledby="edit-title">
      <Reveal>
        <div className="editorial">
          <div className="editorial-copy">
            <p className="eyebrow">Light, softly</p>
            <h2 id="edit-title">Lamps that make evenings slower</h2>
            <p>Warm linen shades, ceramic bases, and dimmable bulbs. Build a room around low, layered light instead of one bright ceiling.</p>
            <Link className="btn btn-primary" to="/shop/lighting">Shop lighting</Link>
          </div>
          <div className="editorial-art" aria-hidden="true">
            <div style={{ width: "min(70%, 300px)" }}>
              <ProductArt art={{ shape: "lamp", palette: ["#e8d6bd", "#b38b5d", "#fff6e6"] }} label="" view={2} />
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Story() {
  return (
    <section className="section container" aria-labelledby="story-title">
      <Reveal>
        <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", alignItems: "center" }}>
          <div>
            <p className="eyebrow">Our story</p>
            <h2 id="story-title">Made to be used, kept, and handed on</h2>
          </div>
          <div>
            <p className="lede">
              Oriel is an imagined brand: a small range of home objects chosen for honest materials, simple shapes, and a calm palette.
              Everything here is demonstration content, created to show what a complete online shop can feel like.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Services() {
  return (
    <section className="container" style={{ paddingBottom: 56 }} aria-labelledby="services-title">
      <h2 id="services-title" className="sr-only">Delivery, returns, and support</h2>
      <div className="info-grid">
        <Reveal><div className="info"><h3>Delivery <span className="demo-flag">Demo policy</span></h3><p>Flat-rate delivery, free on orders of $75 or more. No orders are actually shipped.</p></div></Reveal>
        <Reveal delay={0.05}><div className="info"><h3>Returns <span className="demo-flag">Demo policy</span></h3><p>An example 30-day return window, shown to illustrate where this information would live.</p></div></Reveal>
        <Reveal delay={0.1}><div className="info"><h3>Support <span className="demo-flag">Demo</span></h3><p>There is no live support team. <Link to="/help#support">See how support would work</Link>.</p></div></Reveal>
      </div>
    </section>
  );
}

export function HomePage() {
  return (
    <>
      <Hero />
      <Featured />
      <Categories />
      <Editorial />
      <Story />
      <Services />
    </>
  );
}
