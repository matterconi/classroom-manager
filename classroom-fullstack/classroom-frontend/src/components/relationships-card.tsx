import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "react-router";
import { Network, GitFork, Puzzle } from "lucide-react";
import type { Item, ItemSummary, ItemKind } from "@/types";

const kindToRoute: Record<ItemKind, string> = {
  snippet: "snippets",
  component: "components",
  collection: "collections",
};

function ItemLink({ item }: { item: ItemSummary }) {
  const route = kindToRoute[item.kind] || "snippets";
  return (
    <Link
      to={`/${route}/show/${item.id}`}
      className="flex items-center gap-2 rounded-lg border p-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{item.name}</p>
        {item.description && (
          <p className="truncate text-xs text-muted-foreground">
            {item.description}
          </p>
        )}
      </div>
      <Badge variant="outline" className="shrink-0 text-xs">
        {item.kind}
      </Badge>
    </Link>
  );
}

export function RelationshipsCard({ record }: { record: Item }) {
  const hasBelongsTo = record.belongsTo && record.belongsTo.length > 0;
  const hasParts = record.parts && record.parts.length > 0;
  const hasParent = !!record.familyParent;
  const hasChildren = record.children && record.children.length > 0;

  if (!hasBelongsTo && !hasParts && !hasParent && !hasChildren) return null;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-lg">Relationships</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Parts (structural children via belongs_to) */}
        {hasParts && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Puzzle className="h-4 w-4" />
              Parts ({record.parts!.length})
            </div>
            <div className="space-y-1">
              {record.parts!.map((part) => (
                <ItemLink key={part.id} item={part} />
              ))}
            </div>
          </div>
        )}

        {/* Belongs To (this item is part of...) */}
        {hasBelongsTo && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Network className="h-4 w-4" />
              Belongs To
            </div>
            <div className="space-y-1">
              {record.belongsTo!.map((group) => (
                <ItemLink key={group.id} item={group} />
              ))}
            </div>
          </div>
        )}

        {/* Family (parent edge) */}
        {(hasParent || hasChildren) && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <GitFork className="h-4 w-4" />
              Family
            </div>
            <div className="space-y-2">
              {hasParent && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Parent
                  </p>
                  <ItemLink item={record.familyParent!} />
                </div>
              )}
              {hasChildren && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Children ({record.children!.length})
                  </p>
                  <div className="space-y-1">
                    {record.children!.map((child) => (
                      <ItemLink
                        key={child.id}
                        item={{
                          id: child.id,
                          name: child.name,
                          kind: child.kind,
                          slug: child.slug,
                          description: child.description,
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
