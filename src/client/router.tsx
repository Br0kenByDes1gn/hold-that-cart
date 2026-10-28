import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { Boxes, CircleUser, Home, ScanLine } from "lucide-react";
import { HomeScreen, BriefingScreen } from "./screens/Home";
import { ScannerScreen } from "./screens/Scanner";
import { PantryScreen, ProductScreen } from "./screens/Pantry";
import { ListScreen } from "./screens/Lists";
import { ModeScreen } from "./screens/Mode";
import { QuickViewScreen } from "./screens/QuickView";
import { AnalyseScreen } from "./screens/Analyse";
import { SignUpScreen, LoginScreen } from "./screens/Auth";
import { isLoggedIn } from "./lib/auth";

function Shell() {
  const location = useLocation();
  const loggedIn = isLoggedIn();
  const hideHeader =
    location.pathname === "/" ||
    location.pathname === "/login" ||
    location.pathname === "/scanner" ||
    location.pathname === "/pantry";
  const homeTarget = loggedIn ? "/mode" : "/";
  const homeActive = loggedIn
    ? location.pathname === "/mode" || location.pathname === "/home"
    : location.pathname === "/";
  return (
    <div className="shell has-tabbar">
      {!hideHeader && (
        <header className="header">
          <Link to="/" className="wordmark wordmark-link">
            <span className="wordmark-line">HOLD</span>
            <span className="wordmark-line">THAT CART</span>
          </Link>
          <div className="level-block">
            <div className="level-row">
              <img className="level-icon" src="/assets/page-icons/profilepic.png" alt="Cart Commander profile" />
              <div className="level-text">
                <span className="level-name">Cart Commander</span>
                <div className="level-sub">level</div>
              </div>
            </div>
          </div>
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
          {loggedIn ? (
            <Link
              to="/pantry"
              className={`tab-icon ${location.pathname === "/pantry" ? "active" : ""}`}
              aria-label="Pantry"
            >
              <Boxes size={28} strokeWidth={2} />
            </Link>
          ) : (
            <span
              className="tab-icon is-disabled"
              aria-label="Pantry (log in required)"
              aria-disabled="true"
              title="Log in to use Pantry"
            >
              <Boxes size={28} strokeWidth={2} />
            </span>
          )}
          <Link
            to="/analyse"
            className={`tab-icon ${location.pathname === "/analyse" ? "active" : ""}`}
            aria-label="Analyse"
          >
            <CircleUser size={28} strokeWidth={2} />
          </Link>
      </nav>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/home", component: HomeScreen });
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
  path: "/",
  component: SignUpScreen,
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
