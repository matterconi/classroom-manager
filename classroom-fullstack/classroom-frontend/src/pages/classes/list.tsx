import React, { useMemo, useState } from "react";

import { ClassDetails } from "@/types";
import { ListView } from "@/components/refine-ui/views/list-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@radix-ui/react-select";
import { CreateButton } from "@/components/refine-ui/buttons/create";
import { ShowButton } from "@/components/refine-ui/buttons/show";
import { DataTable } from "@/components/refine-ui/data-table/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { useTable } from "@refinedev/react-table";

const STATUS = ["active", "inactive"]

const ClassesList = () => {

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedStatus, setSelectedStatus] = useState("all");

  const statusFilter =
  selectedStatus === "all"
    ? []
    : [
        {
          field: "status",
          operator: "eq" as const,
          value: selectedStatus,
        },
      ];
const searchFilters = searchQuery
  ? [
      {
        field: "name",
        operator: "contains" as const,
        value: searchQuery,
      },
    ]
  : [];

const classesTable = useTable<ClassDetails>({
  columns: useMemo<ColumnDef<ClassDetails>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        size: 200,
        header: () => <p className="column-title">Name</p>,
        cell: ({ getValue }) => (
          <span className="text-foreground">{getValue() as string}</span>
        ),
        filterFn: "includesString",
      },
       {
        id: "status",
        accessorKey: "status",
        size: 100,
        header: () => <p className="column-title">Status</p>,
        cell: ({ getValue }) => <Badge>{getValue<string>()}</Badge>,
      },
      {
        id: "capacity",
        accessorKey: "capacity",
        size: 150,
        header: () => <p className="column-title">Capacity</p>,
        cell: ({ getValue }) => (
          <Badge variant="secondary">{getValue<number>()}</Badge>
        ),
      },
      {
        id: "subject.name",
        accessorKey: "subject.name",
        size: 150,
        header: () => <p className="column-title">Subject</p>,
        cell: ({ getValue }) => (
          <span className="text-foreground line-clamp-2 truncate">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: "teacher.name",
        accessorKey: "teacher.name",
        size: 150,
        header: () => <p className="column-title">Teacher</p>,
        cell: ({ getValue }) => (
          <span className="text-foreground line-clamp-2 truncate">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: "description",
        accessorKey: "description",
        size: 150,
        header: () => <p className="column-title">Description</p>,
        cell: ({ getValue }) => (
          <span className="text-foreground line-clamp-2 truncate">
            {getValue<string>()}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <p className="column-title">Actions</p>,
        size: 100,
        cell: ({ row }) => (
          <ShowButton
            resource="classes"
            recordItemId={row.original.id}
            size="sm"
            variant="ghost"
          />
        ),
      },
    ],
    []
  ),
  refineCoreProps: {
    resource: "classes",
    pagination: {
      pageSize: 10,
      mode: "server",
    },
    filters: {
      permanent: [...statusFilter, ...searchFilters],
    },
    sorters: {
      initial: [{ field: "id", order: "desc" }],
    },
  },
});

  return (<ListView>
      <Breadcrumb />

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
            <Select
              value={selectedStatus}
              onValueChange={setSelectedStatus}
            >
              <SelectTrigger className="">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">Status</SelectItem>
                {STATUS.map((status) => (
                  <SelectItem value={status} key={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <CreateButton />
          </div>
        </div>
      </div>

      <DataTable table={classesTable} />
    </ListView>);
};

export default ClassesList;
