import {
  ShowView,
  ShowViewHeader,
} from "@/components/refine-ui/views/show-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2 } from "lucide-react";
import { useState } from "react";

import type { Component } from "@/types";
import { useShow } from "@refinedev/core";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ComponentShow = () => {
  const { query } = useShow<Component>({ resource: "components" });
  const [copied, setCopied] = useState(false);

  const record = query?.data?.data;
  const isLoading = query?.isLoading;

  const handleCopy = async () => {
    if (!record?.code) return;
    await navigator.clipboard.writeText(record.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
        <p className="text-muted-foreground">Component not found.</p>
      </ShowView>
    );
  }

  const languageMap: Record<string, string> = {
    typescript: "tsx",
    javascript: "jsx",
    css: "css",
    html: "html",
    sql: "sql",
    shell: "bash",
  };

  return (
    <ShowView>
      <ShowViewHeader />

      {/* Metadata */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">{record.name}</CardTitle>
            <Badge>{record.status}</Badge>
          </div>
          {record.description && (
            <p className="text-muted-foreground">{record.description}</p>
          )}
        </CardHeader>

        <Separator />

        <CardContent className="mt-4 flex flex-wrap gap-4">
          {record.category && (
            <InfoField label="Category" value={record.category.name} />
          )}
          {record.stack && <InfoField label="Stack" value={record.stack} />}
          {record.language && (
            <InfoField label="Language" value={record.language} />
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

      {/* Tabs: Code | Demo | Docs */}
      <Tabs defaultValue="code" className="mt-4">
        <TabsList>
          <TabsTrigger value="code">Code</TabsTrigger>
          {record.stack === "frontend" && record.demoUrl && (
            <TabsTrigger value="demo">Live Demo</TabsTrigger>
          )}
          {record.documentation && (
            <TabsTrigger value="docs">Documentation</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="code">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Source Code</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-4 w-4" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-4 w-4" /> Copy
                  </>
                )}
              </Button>
            </CardHeader>
            <CardContent>
              <SyntaxHighlighter
                language={languageMap[record.language || ""] || "typescript"}
                style={oneDark}
                customStyle={{
                  borderRadius: "0.5rem",
                  fontSize: "0.875rem",
                }}
              >
                {record.code}
              </SyntaxHighlighter>
            </CardContent>
          </Card>
        </TabsContent>

        {record.stack === "frontend" && record.demoUrl && (
          <TabsContent value="demo">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Live Demo</CardTitle>
              </CardHeader>
              <CardContent>
                <iframe
                  src={record.demoUrl}
                  className="h-[500px] w-full rounded-lg border"
                  sandbox="allow-scripts allow-same-origin"
                  title={`${record.name} demo`}
                />
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {record.documentation && (
          <TabsContent value="docs">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Documentation</CardTitle>
              </CardHeader>
              <CardContent className="prose dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {record.documentation}
                </ReactMarkdown>
              </CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </ShowView>
  );
};

export default ComponentShow;

function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-foreground">{value ?? "—"}</p>
    </div>
  );
}
