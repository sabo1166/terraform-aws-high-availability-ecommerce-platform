import { useEffect, useRef, type ReactNode } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Layout } from "./components/Layout";
import { AdminPage } from "./features/admin/AdminPage";
import { AccountPage, LoginPage, RegisterPage } from "./features/account/AccountPages";
import { AuthProvider } from "./features/account/AuthContext";
import { CartPage } from "./features/cart/CartPage";
import { CartProvider } from "./features/cart/CartContext";
import { ProductPage } from "./features/catalog/ProductPage";
import { ShopPage } from "./features/catalog/ShopPage";
import { CheckoutPage } from "./features/checkout/CheckoutPage";
import { ConfirmationPage, FindOrderPage } from "./features/checkout/OrderPages";
import { HelpPage, NotFoundPage } from "./features/home/HelpPage";
import { HomePage } from "./features/home/HomePage";

/**
 * On client-side navigation, scroll to the top and move focus to <main> so keyboard and screen-reader
 * users start at the new page. It must NOT run for the first page load: focusing <main> there would
 * move the keyboard starting point past the skip link and the header.
 */
function ScrollToTop() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);
  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;
    window.scrollTo(0, 0);
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}

export function AppRoutes() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="shop" element={<ShopPage />} />
          <Route path="shop/:category" element={<ShopPage />} />
          <Route path="products/:slug" element={<ProductPage />} />
          <Route path="cart" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="order/find" element={<FindOrderPage />} />
          <Route path="order/:reference" element={<ConfirmationPage />} />
          <Route path="account" element={<AccountPage />} />
          <Route path="account/login" element={<LoginPage />} />
          <Route path="account/register" element={<RegisterPage />} />
          <Route path="admin" element={<AdminPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <CartProvider>{children}</CartProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Providers>
        <AppRoutes />
      </Providers>
    </BrowserRouter>
  );
}

