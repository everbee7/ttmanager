import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { AppShell } from "./shell/AppShell";
import { TodayPage } from "./pages/TodayPage";
import { TimelinePage } from "./pages/TimelinePage";
import { TasksPage } from "./pages/TasksPage";
import { SimplePage } from "./pages/SimplePage";
import { SettingsPage } from "./pages/SettingsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { ReportsPage } from "./pages/ReportsPage";
import { CalendarPage } from "./pages/CalendarPage";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("Local service error")) return failureCount < 40;
        return failureCount < 8;
      },
      retryDelay: (attempt) => Math.min(1000 * Math.max(1, attempt), 5000),
      refetchOnMount: "always",
      refetchOnReconnect: "always",
      refetchOnWindowFocus: true
    }
  }
});
const router = createHashRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <TodayPage /> },
      { path: "timeline", element: <TimelinePage /> },
      { path: "tasks", element: <TasksPage /> },
      { path: "calendar", element: <CalendarPage /> },
      { path: "history", element: <HistoryPage /> },
      { path: "reports", element: <ReportsPage /> },
      { path: "settings", element: <SettingsPage /> }
    ]
  }
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
