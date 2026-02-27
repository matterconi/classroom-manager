import { useMemo, useState } from "react";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { ShowButton } from "@/components/refine-ui/buttons/show";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { useTable } from "@refinedev/react-table";
import { useList } from "@refinedev/core";
import type { Collection, Category } from "@/types";
import { COLLECTION_STACK_OPTIONS } from "@/constants";

const CollectionsList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStack, setSelectedStack] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");

  const { query: categoriesQuery } = useList<Category>({
    resource: "categories",
    pagination: { pageSize: 100 },
  });
  const categories = categoriesQuery?.data?.data || [];

  const filters = [
    ...(searchQuery
      ? [{ field: "name", operator: "contains" as const, value: searchQuery }]
      : []),
    ...(selectedStack !== "all"
      ? [{ field: "stack", operator: "eq" as const, value: selectedStack }]
      : []),
    ...(selectedCategory !== "all"
      ? [
          {
            field: "categoryId",
            operator: "eq" as const,
            value: selectedCategory,
          },
        ]
      : []),
  ];

  const collectionsTable = useTable<Collection>({
    columns: useMemo<ColumnDef<Collection>[]>(
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
          id: "category",
          accessorKey: "category.name",
          size: 130,
          header: () => <p className="column-title">Category</p>,
          cell: ({ getValue }) => {
            const val = getValue<string>();
            return val ? <Badge variant="outline">{val}</Badge> : <span>—</span>;
          },
        },
        {
          id: "stack",
          accessorKey: "stack",
          size: 110,
          header: () => <p className="column-title">Stack</p>,
          cell: ({ getValue }) => {
            const val = getValue<string>();
            if (!val) return <span>—</span>;
            const variant =
              val === "fullstack"
                ? "default"
                : val === "frontend"
                  ? "secondary"
                  : "outline";
            return <Badge variant={variant}>{val}</Badge>;
          },
        },
        {
          id: "filesCount",
          accessorKey: "filesCount",
          size: 80,
          header: () => <p className="column-title">Files</p>,
          cell: ({ getValue }) => (
            <Badge variant="secondary">{getValue<number>() ?? 0}</Badge>
          ),
        },
        {
          id: "libraries",
          accessorKey: "libraries",
          size: 200,
          header: () => <p className="column-title">Libraries</p>,
          cell: ({ getValue }) => {
            const libs = getValue<string[]>();
            if (!libs || libs.length === 0) return <span>—</span>;
            return (
              <div className="flex flex-wrap gap-1">
                {libs.slice(0, 3).map((lib) => (
                  <Badge key={lib} variant="secondary" className="text-xs">
                    {lib}
                  </Badge>
                ))}
                {libs.length > 3 && (
                  <Badge variant="secondary" className="text-xs">
                    +{libs.length - 3}
                  </Badge>
                )}
              </div>
            );
          },
        },
        {
          id: "actions",
          header: () => <p className="column-title">Actions</p>,
          size: 100,
          cell: ({ row }) => (
            <ShowButton
              resource="collections"
              recordItemId={row.original.id}
              size="sm"
              variant="ghost"
            />
          ),
        },
      ],
      [],
    ),
    refineCoreProps: {
      resource: "collections",
      pagination: {
        pageSize: 10,
        mode: "server",
      },
      filters: {
        permanent: filters,
      },
      sorters: {
        initial: [{ field: "id", order: "desc" }],
      },
    },
  });

  return (
    <ListView>
      <Breadcrumb />
      <h1 className="page-title">Collections</h1>

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
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Select value={selectedStack} onValueChange={setSelectedStack}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Stack" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stacks</SelectItem>
                {COLLECTION_STACK_OPTIONS.map((opt) => (
                  <SelectItem value={opt.value} key={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
            >
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem value={cat.id.toString()} key={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <CreateButton />
          </div>
        </div>
      </div>

      <DataTable table={collectionsTable} />
    </ListView>
  );
};

export default CollectionsList;
