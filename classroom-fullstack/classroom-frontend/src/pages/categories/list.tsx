import { useMemo, useState } from "react";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { useTable } from "@refinedev/react-table";
import type { Category } from "@/types";

const CategoriesList = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const searchFilters = searchQuery
    ? [
        {
          field: "name",
          operator: "contains" as const,
          value: searchQuery,
        },
      ]
    : [];

  const categoriesTable = useTable<Category>({
    columns: useMemo<ColumnDef<Category>[]>(
      () => [
        {
          id: "name",
          accessorKey: "name",
          size: 200,
          header: () => <p className="column-title">Name</p>,
          cell: ({ getValue }) => (
            <span className="text-foreground font-medium">
              {getValue() as string}
            </span>
          ),
        },
        {
          id: "slug",
          accessorKey: "slug",
          size: 150,
          header: () => <p className="column-title">Slug</p>,
          cell: ({ getValue }) => (
            <span className="text-muted-foreground font-mono text-sm">
              {getValue() as string}
            </span>
          ),
        },
        {
          id: "description",
          accessorKey: "description",
          size: 300,
          header: () => <p className="column-title">Description</p>,
          cell: ({ getValue }) => (
            <span className="text-foreground line-clamp-2 truncate">
              {(getValue() as string) || "—"}
            </span>
          ),
        },
      ],
      [],
    ),
    refineCoreProps: {
      resource: "categories",
      pagination: {
        pageSize: 10,
        mode: "server",
      },
      filters: {
        permanent: [...searchFilters],
      },
      sorters: {
        initial: [{ field: "id", order: "desc" }],
      },
    },
  });

  return (
    <ListView>
      <Breadcrumb />
      <h1 className="page-title">Categories</h1>

      <div className="intro-row">
        <div className="actions-row">
          <div className="search-field">
            <Search className="search-icon" />
            <Input
              type="text"
              placeholder="Search by name..."
              className="w-full pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <CreateButton />
          </div>
        </div>
      </div>

      <DataTable table={categoriesTable} />
    </ListView>
  );
};

export default CategoriesList;
