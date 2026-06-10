import { Routes, Route, Navigate } from "react-router-dom";
import { useSession } from "./lib/auth-client.js";
import Login from "./pages/Login.js";
import Register from "./pages/Register.js";
import Workspaces from "./pages/Workspaces.js";
import Workspace from "./pages/Workspace.js";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireGuest({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  if (session) return <Navigate to="/workspaces" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RequireGuest>
            <Login />
          </RequireGuest>
        }
      />
      <Route
        path="/register"
        element={
          <RequireGuest>
            <Register />
          </RequireGuest>
        }
      />
      <Route
        path="/workspaces"
        element={
          <RequireAuth>
            <Workspaces />
          </RequireAuth>
        }
      />
      <Route
        path="/workspaces/:workspaceId"
        element={
          <RequireAuth>
            <Workspace />
          </RequireAuth>
        }
      />
      <Route path="*" element={<Navigate to="/workspaces" replace />} />
    </Routes>
  );
}
