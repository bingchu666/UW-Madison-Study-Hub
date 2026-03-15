import { createBrowserRouter } from "react-router";
import Layout from "./components/Layout";
import Home from "./components/Home";
import Tasks from "./components/Tasks";
import TaskDetail from "./components/TaskDetail";
import Exams from "./components/Exams";
import Planner from "./components/Planner";
import SyncCenter from "./components/SyncCenter";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Home },
      { path: "tasks", Component: Tasks },
      { path: "tasks/:id", Component: TaskDetail },
      { path: "exams", Component: Exams },
      { path: "planner", Component: Planner },
      { path: "sync", Component: SyncCenter },
    ],
  },
]);
