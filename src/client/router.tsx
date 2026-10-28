import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { HomeScreen, BriefingScreen } from "./screens/Home";
import { ScannerScreen } from "./screens/Scanner";
import { PantryScreen, ProductScreen } from "./screens/Pantry";
import { ListScreen } from "./screens/Lists";

function Shell() {
  return (
    <div className="shell">
      <header className="header">
        <div className="wordmark">HOLD THAT CART</div>
        <div className="subtitle">Cart Radar · The Stash</div>
      </header>
      <Outlet />
      <nav className="tabbar">
        <Link to="/" activeProps={{ className: "active" }}>Home</Link>
        <Link to="/scanner" activeProps={{ className: "active" }}>Scanner</Link>
        <Link to="/pantry" activeProps={{ className: "active" }}>Pantry</Link>
      </nav>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });
const homeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: HomeScreen });
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

const routeTree = rootRoute.addChildren([homeRoute, briefingRoute, scannerRoute, pantryRoute, productRoute, listRoute]);
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
