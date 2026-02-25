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
import type { Snippet, Category } from "@/types";
import {
  DOMAIN_OPTIONS,
  SNIPPET_STACK_OPTIONS,
  STATUS_OPTIONS,
} from "@/constants";

const SnippetsList = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDomain, setSelectedDomain] = useState("all");
  const [selectedStack, setSelectedStack] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
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
    ...(selectedDomain !== "all"
      ? [{ field: "domain", operator: "eq" as const, value: selectedDomain }]
      : []),
    ...(selectedStack !== "all"
      ? [{ field: "stack", operator: "eq" as const, value: selectedStack }]
      : []),
    ...(selectedStatus !== "all"
      ? [{ field: "status", operator: "eq" as const, value: selectedStatus }]
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

  const snippetsTable = useTable<Snippet>({
    columns: useMemo<ColumnDef<Snippet>[]>(
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
          id: "domain",
          accessorKey: "domain",
          size: 130,
          header: () => <p className="column-title">Domain</p>,
          cell: ({ getValue }) => {
            const val = getValue<string>();
            if (!val) return <span>—</span>;
            const label =
              DOMAIN_OPTIONS.find((o) => o.value === val)?.label ?? val;
            return <Badge variant="secondary">{label}</Badge>;
          },
        },
        {
          id: "stack",
          accessorKey: "stack",
          size: 100,
          header: () => <p className="column-title">Stack</p>,
          cell: ({ getValue }) => {
            const val = getValue<string>();
            if (!val) return <span>—</span>;
            return (
              <Badge variant={val === "frontend" ? "default" : "outline"}>
                {val}
              </Badge>
            );
          },
        },
        {
          id: "language",
          accessorKey: "language",
          size: 100,
          header: () => <p className="column-title">Language</p>,
          cell: ({ getValue }) => (
            <span className="text-muted-foreground font-mono text-sm">
              {(getValue() as string) || "—"}
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
            return val ? (
              <Badge variant="outline">{val}</Badge>
            ) : (
              <span>—</span>
            );
          },
        },
        {
          id: "status",
          accessorKey: "status",
          size: 90,
          header: () => <p className="column-title">Status</p>,
          cell: ({ getValue }) => <Badge>{getValue<string>()}</Badge>,
        },
        {
          id: "actions",
          header: () => <p className="column-title">Actions</p>,
          size: 100,
          cell: ({ row }) => (
            <ShowButton
              resource="snippets"
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
      resource: "snippets",
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
      <h1 className="page-title">Snippets</h1>

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
            <Select value={selectedDomain} onValueChange={setSelectedDomain}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Domains</SelectItem>
                {DOMAIN_OPTIONS.map((opt) => (
                  <SelectItem value={opt.value} key={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedStack} onValueChange={setSelectedStack}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Stack" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Stacks</SelectItem>
                {SNIPPET_STACK_OPTIONS.map((opt) => (
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

            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem value={opt.value} key={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <CreateButton />
          </div>
        </div>
      </div>

      <DataTable table={snippetsTable} />
    </ListView>
  );
};

export default SnippetsList;
