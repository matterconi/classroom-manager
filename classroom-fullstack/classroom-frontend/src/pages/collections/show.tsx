import {
  ShowView,
  ShowViewHeader,
} from "@/components/refine-ui/views/show-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Copy, Check, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

import type { Collection, CollectionFile } from "@/types";
import { useShow } from "@refinedev/core";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
} from "@codesandbox/sandpack-react";

const CollectionShow = () => {
  const { query } = useShow<Collection>({ resource: "collections" });

  const record = query?.data?.data;
  const isLoading = query?.isLoading;

  if (isLoading) {
    return (
      <ShowView>
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </ShowView>
    );
  }

  if (!record) {
    return (
      <ShowView>
        <ShowViewHeader />
        <p className="text-muted-foreground">Collection not found.</p>
      </ShowView>
    );
  }

  return (
    <ShowView>
      <ShowViewHeader />

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">{record.name}</CardTitle>
            <div className="flex gap-2">
              {record.stack && <Badge variant="secondary">{record.stack}</Badge>}
              <Badge>{record.status}</Badge>
            </div>
          </div>
          {record.description && (
            <p className="text-muted-foreground">{record.description}</p>
          )}
        </CardHeader>

        <Separator />

        <CardContent className="mt-4 flex flex-wrap gap-4">
          {record.category && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Category
              </p>
              <Badge variant="outline">{record.category.name}</Badge>
            </div>
          )}
          {record.libraries && record.libraries.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                Libraries
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {record.libraries.map((lib) => (
                  <Badge key={lib} variant="secondary">
                    {lib}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {record.tags && record.tags.length > 0 && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Tags</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {record.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs: Files | Preview */}
      <Tabs defaultValue="files" className="mt-4">
        <TabsList>
          <TabsTrigger value="files">
            Files ({record.files?.length ?? 0})
          </TabsTrigger>
          {(record.stack === "frontend" || record.stack === "fullstack") &&
            record.files &&
            record.files.length > 0 && (
              <TabsTrigger value="preview">Preview</TabsTrigger>
            )}
        </TabsList>

        <TabsContent value="files">
          {record.files && record.files.length > 0 && (
            <div className="space-y-3">
              {record.files.map((file) => (
                <FileCard key={file.id} file={file} />
              ))}
            </div>
          )}
        </TabsContent>

        {(record.stack === "frontend" || record.stack === "fullstack") &&
          record.files &&
          record.files.length > 0 && (
            <TabsContent value="preview">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Live Preview</CardTitle>
                </CardHeader>
                <CardContent>
                  <SandpackProvider
                    template="react-ts"
                    files={Object.fromEntries(
                      record.files.map((f) => [`/${f.name}`, f.code]),
                    )}
                    options={{
                      activeFile: record.entryFile
                        ? `/${record.entryFile}`
                        : `/${record.files[0].name}`,
                    }}
                    theme="dark"
                  >
                    <SandpackLayout>
                      <SandpackCodeEditor style={{ height: "500px" }} />
                      <SandpackPreview style={{ height: "500px" }} />
                    </SandpackLayout>
                  </SandpackProvider>
                </CardContent>
              </Card>
            </TabsContent>
          )}
      </Tabs>
    </ShowView>
  );
};

export default CollectionShow;

function FileCard({ file }: { file: CollectionFile }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const languageMap: Record<string, string> = {
    typescript: "tsx",
    javascript: "jsx",
    css: "css",
    html: "html",
    sql: "sql",
    shell: "bash",
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(file.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`}
                />
                <span className="font-mono text-sm font-medium">
                  {file.name}
                </span>
                {file.language && (
                  <Badge variant="secondary" className="text-xs">
                    {file.language}
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy();
                }}
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent>
            <SyntaxHighlighter
              language={languageMap[file.language || ""] || "typescript"}
              style={oneDark}
              customStyle={{
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              {file.code}
            </SyntaxHighlighter>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
