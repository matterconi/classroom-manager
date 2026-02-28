import { Refine } from "@refinedev/core";
import { DevtoolsPanel, DevtoolsProvider } from "@refinedev/devtools";
import { RefineKbar, RefineKbarProvider } from "@refinedev/kbar";

import routerProvider, {
  DocumentTitleHandler,
  UnsavedChangesNotifier,
} from "@refinedev/react-router";
import { BrowserRouter, Outlet, Route, Routes } from "react-router";
import "./App.css";
import { Toaster } from "./components/refine-ui/notification/toaster";
import { useNotificationProvider } from "./components/refine-ui/notification/use-notification-provider";
import { ThemeProvider } from "./components/refine-ui/theme/theme-provider";
import { dataProvider } from "./providers/data";
import { Home, Code2, FolderOpen, Braces, BookOpen, Tag, Upload } from "lucide-react";
import { Layout } from "./components/refine-ui/layout/layout";
import DashBoard from "./pages/dashboard";
import ComponentsList from "./pages/components/list";
import ComponentCreate from "./pages/components/create";
import ComponentShow from "./pages/components/show";
import CollectionsList from "./pages/collections/list";
import CollectionCreate from "./pages/collections/create";
import CollectionShow from "./pages/collections/show";
import SnippetsList from "./pages/snippets/list";
import SnippetCreate from "./pages/snippets/create";
import SnippetShow from "./pages/snippets/show";
import TheoryList from "./pages/theory/list";
import TheoryCreate from "./pages/theory/create";
import TheoryShow from "./pages/theory/show";
import CategoriesList from "./pages/categories/list";
import CategoryCreate from "./pages/categories/create";
import UploadPage from "./pages/upload";

function App() {
  return (
    <BrowserRouter>
      <RefineKbarProvider>
        <ThemeProvider>
          <DevtoolsProvider>
            <Refine
              dataProvider={dataProvider}
              notificationProvider={useNotificationProvider()}
              routerProvider={routerProvider}
              options={{
                syncWithLocation: true,
                warnWhenUnsavedChanges: true,
                projectId: "9PKLXz-l2vDyN-fCLkJc",
                title: { text: "La Bottega UI" },
              }}
              resources={[
                {
                  name: "dashboard",
                  list: "/",
                  meta: { label: "Home", icon: <Home /> },
                },
                {
                  name: "upload",
                  list: "/upload",
                  meta: { label: "Upload", icon: <Upload /> },
                },
                {
                  name: "components",
                  list: "/components",
                  create: "/components/create",
                  show: "/components/show/:id",
                  meta: { label: "Components", icon: <Code2 /> },
                },
                {
                  name: "collections",
                  list: "/collections",
                  create: "/collections/create",
                  show: "/collections/show/:id",
                  meta: { label: "Collections", icon: <FolderOpen /> },
                },
                {
                  name: "snippets",
                  list: "/snippets",
                  create: "/snippets/create",
                  show: "/snippets/show/:id",
                  meta: { label: "Snippets", icon: <Braces /> },
                },
                {
                  name: "theory",
                  list: "/theory",
                  create: "/theory/create",
                  show: "/theory/show/:id",
                  meta: { label: "Theory", icon: <BookOpen /> },
                },
                {
                  name: "categories",
                  list: "/categories",
                  create: "/categories/create",
                  meta: { label: "Categories", icon: <Tag /> },
                },
              ]}
            >
              <Routes>
                <Route
                  element={
                    <Layout>
                      <Outlet />
                    </Layout>
                  }
                >
                  <Route path="/" element={<DashBoard />} />
                  <Route path="/upload" element={<UploadPage />} />

                  <Route path="components">
                    <Route index element={<ComponentsList />} />
                    <Route path="create" element={<ComponentCreate />} />
                    <Route path="show/:id" element={<ComponentShow />} />
                  </Route>

                  <Route path="collections">
                    <Route index element={<CollectionsList />} />
                    <Route path="create" element={<CollectionCreate />} />
                    <Route path="show/:id" element={<CollectionShow />} />
                  </Route>

                  <Route path="snippets">
                    <Route index element={<SnippetsList />} />
                    <Route path="create" element={<SnippetCreate />} />
                    <Route path="show/:id" element={<SnippetShow />} />
                  </Route>

                  <Route path="theory">
                    <Route index element={<TheoryList />} />
                    <Route path="create" element={<TheoryCreate />} />
                    <Route path="show/:id" element={<TheoryShow />} />
                  </Route>

                  <Route path="categories">
                    <Route index element={<CategoriesList />} />
                    <Route path="create" element={<CategoryCreate />} />
                  </Route>
                </Route>
              </Routes>
              <Toaster />
              <RefineKbar />
              <UnsavedChangesNotifier />
              <DocumentTitleHandler />
            </Refine>
            <DevtoolsPanel />
          </DevtoolsProvider>
        </ThemeProvider>
      </RefineKbarProvider>
    </BrowserRouter>
  );
}

export default App;
