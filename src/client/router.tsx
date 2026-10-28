import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useLocation,
} from "@tanstack/react-router";
import { HomeScreen, BriefingScreen } from "./screens/Home";
import { ScannerScreen } from "./screens/Scanner";
import { PantryScreen, ProductScreen } from "./screens/Pantry";
import { ListScreen } from "./screens/Lists";
import { ModeScreen } from "./screens/Mode";
import { QuickViewScreen } from "./screens/QuickView";
import { SignUpScreen, LoginScreen } from "./screens/Auth";

function Shell() {
  const location = useLocation();
  const hideHeader = location.pathname === "/" || location.pathname === "/login";
  return (
    <div className="shell">
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
      <nav className="tabbar">
        <Link to="/home" activeProps={{ className: "active" }}>Home</Link>
        <Link to="/scanner" activeProps={{ className: "active" }}>Scanner</Link>
        <Link to="/pantry" activeProps={{ className: "active" }}>Pantry</Link>
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
