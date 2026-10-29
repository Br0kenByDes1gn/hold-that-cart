import { Suspense, lazy } from "react";
import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { Boxes, CircleUser, Home, ScanLine } from "lucide-react";
import { BriefingScreen } from "./screens/Home";
import { ScannerScreen } from "./screens/Scanner";
import { PantryScreen, ProductScreen } from "./screens/Pantry";
import { ListScreen } from "./screens/Lists";
import { ModeScreen } from "./screens/Mode";
import { QuickViewScreen } from "./screens/QuickView";
import { AnalyseScreen } from "./screens/Analyse";
import { SignUpScreen, LoginScreen } from "./screens/Auth";
import profilePic from "../../assets/page-icons/profilepic.png";

// Dev-only corner menu (seed/reset). Lazily loaded and gated on
// import.meta.env.DEV so production builds neither show nor ship it.
const DevMenu = import.meta.env.DEV
  ? lazy(() => import("./components/DevMenu").then((m) => ({ default: m.DevMenu })))
  : null;

function Shell() {
  const location = useLocation();
  // No gating: the app starts on an anonymous household; signup is optional
  // and (later) attaches this household to an account. Access never depends
  // on login state.
  const hideHeader =
    location.pathname === "/" ||
    location.pathname === "/mode" ||
    location.pathname === "/login" ||
    location.pathname === "/signup" ||
    location.pathname === "/scanner" ||
    location.pathname === "/pantry" ||
    location.pathname === "/quick-view";
  const homeTarget = "/mode";
  const homeActive =
    location.pathname === "/mode" || location.pathname === "/" || location.pathname === "/home";
  return (
    <div className="shell has-tabbar">
      {!hideHeader && (
        <header className="header">
          <Link to="/" className="wordmark wordmark-link">
            <span className="wordmark-line">HOLD</span>
            <span className="wordmark-line">THAT CART</span>
          </Link>
          <Link to="/signup" className="level-block" aria-label="Account (optional sign up)">
            <div className="level-row">
              <img className="level-icon" src={profilePic} alt="Cart Commander profile" />
              <div className="level-text">
                <span className="level-name">Cart Commander</span>
                <div className="level-sub">level</div>
              </div>
            </div>
          </Link>
        </header>
      )}
      <Outlet />
      <nav className="tabbar" aria-label="Main navigation">
          <Link
            to={homeTarget}
            className={`tab-icon ${homeActive ? "active" : ""}`}
            aria-label="Home"
          >
            <Home size={28} strokeWidth={2} />
          </Link>
          <Link
            to="/scanner"
            className={`tab-icon ${location.pathname === "/scanner" ? "active" : ""}`}
            aria-label="Scanner"
          >
            <ScanLine size={28} strokeWidth={2} />
          </Link>
          <Link
            to="/pantry"
            className={`tab-icon ${location.pathname === "/pantry" ? "active" : ""}`}
            aria-label="Pantry"
          >
            <Boxes size={28} strokeWidth={2} />
          </Link>
          <Link
            to="/analyse"
            className={`tab-icon ${location.pathname === "/analyse" ? "active" : ""}`}
            aria-label="Analyse"
          >
            <CircleUser size={28} strokeWidth={2} />
          </Link>
      </nav>
      {DevMenu && (
        <Suspense fallback={null}>
          <DevMenu />
        </Suspense>
      )}
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });
const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/home",
  component: () => <Navigate to="/mode" />,
});
const briefingRoute = createRoute({ getParentRoute: () => rootRoute, path: "/briefing", component: BriefingScreen });
const scannerRoute = createRoute({ getParentRoute: () => rootRoute, path: "/scanner", component: ScannerScreen });
const pantryRoute = createRoute({ getParentRoute: () => rootRoute, path: "/pantry", component: PantryScreen });
const productRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pantry/$productId",
  component: ({ params }: any) => <ProductScreen productId={params.productId} />,
});
const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lists/$listId",
  component: ({ params }: any) => <ListScreen listId={params.listId} />,
});

const modeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/mode",
  component: ModeScreen,
});

const quickViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/quick-view",
  component: QuickViewScreen,
});

const analyseRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/analyse",
  component: AnalyseScreen,
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/signup",
  component: SignUpScreen,
});

const entryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ModeScreen,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginScreen,
});

const routeTree = rootRoute.addChildren([
  homeRoute,
  briefingRoute,
  scannerRoute,
  pantryRoute,
  productRoute,
  listRoute,
  modeRoute,
  quickViewRoute,
  analyseRoute,
  signupRoute,
  loginRoute,
  entryRoute,
]);
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
