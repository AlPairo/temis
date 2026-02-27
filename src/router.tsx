import { createBrowserRouter } from "react-router-dom";
import Landing from "./pages/Landing";
import AppHome from "./pages/AppHome";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Landing />
  },
  {
    path: "/app/*",
    element: <AppHome />
  },
  {
    path: "*",
    element: <Landing />
  }
]);

export default router;
