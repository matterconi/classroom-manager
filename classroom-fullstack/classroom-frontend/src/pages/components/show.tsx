import {
  ShowView,
  ShowViewHeader,
} from "@/components/refine-ui/views/show-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Copy, Check, ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";

import type { Component, ComponentFile, ComponentVariant } from "@/types";
import { useShow } from "@refinedev/core";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  SandpackProvider,
  SandpackLayout,
  SandpackCodeEditor,
  SandpackPreview,
} from "@codesandbox/sandpack-react";

const ComponentShow = () => {
  const { query } = useShow<Component>({ resource: "components" });
  const [variantSelections, setVariantSelections] = useState<
    Record<string, string>
  >({});

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
        <p className="text-muted-foreground">Component not found.</p>
      </ShowView>
    );
  }

  const hasFiles = record.files && record.files.length > 0;
  const hasVariants = record.variants && record.variants.length > 0;

  // Build sandbox files from component files or single code
  const buildSandpackFiles = () => {
    const files: Record<string, string> = {};

    if (hasFiles) {
      for (const f of record.files!) {
        files[`/${f.name}`] = f.code;
      }
    }

    // If variants are defined, generate a wrapper that renders with selected props
    if (hasVariants) {
      const propsString = record
        .variants!.map((v) => {
          const selected = variantSelections[v.prop] || v.options[0];
          return `${v.prop}="${selected}"`;
        })
        .join(" ");

      const componentName = record.name.replace(/\s+/g, "");
      const entryFile = record.entryFile || (hasFiles ? record.files![0].name : "App.tsx");
      const importPath = `./${entryFile.replace(/\.tsx?$/, "")}`;

      files["/VariantPreview.tsx"] = `import ${componentName} from "${importPath}";\n\nexport default function VariantPreview() {\n  return <${componentName} ${propsString} />;\n}`;
    }

    return files;
  };

  const getActiveFile = () => {
    if (hasVariants) return "/VariantPreview.tsx";
    if (record.entryFile) return `/${record.entryFile}`;
    if (hasFiles) return `/${record.files![0].name}`;
    return "/App.tsx";
  };

  return (
    <ShowView>
      <ShowViewHeader />

      {/* Metadata */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">{record.name}</CardTitle>
            <div className="flex gap-2">
              {record.type && (
                <Badge variant="secondary">{record.type}</Badge>
              )}
            </div>
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

      {/* Use Cases */}
      {record.useCases && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-lg">Use Cases</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-muted-foreground">
              {record.useCases.map((uc, i) => (
                <li key={i}>
                  <span className="font-medium text-foreground">{uc.title}</span>
                  {" — "}
                  {uc.use}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tabs: Code | Files | Preview */}
      <Tabs defaultValue="files" className="mt-4">
        <TabsList>
          {hasFiles && (
            <TabsTrigger value="files">
              Files ({record.files!.length})
            </TabsTrigger>
          )}
          <TabsTrigger value="preview">Live Preview</TabsTrigger>
        </TabsList>


        {hasFiles && (
          <TabsContent value="files">
            <div className="space-y-3">
              {record.files!.map((file) => (
                <FileCard key={file.id} file={file} />
              ))}
            </div>
          </TabsContent>
        )}

        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Live Preview</CardTitle>
            </CardHeader>
            <CardContent>
              {/* Variants control panel */}
              {hasVariants && (
                <VariantsPanel
                  variants={record.variants!}
                  selections={variantSelections}
                  onChange={setVariantSelections}
                />
              )}
              <SandpackProvider
                template="react-ts"
                files={buildSandpackFiles()}
                options={{ activeFile: getActiveFile() }}
                theme="dark"
              >
                <SandpackLayout>
                  <SandpackCodeEditor style={{ height: "400px" }} />
                  <SandpackPreview style={{ height: "400px" }} />
                </SandpackLayout>
              </SandpackProvider>
            </CardContent>
          </Card>
        </TabsContent>
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

function FileCard({ file }: { file: ComponentFile }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

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
              language="tsx"
              style={oneDark}
              customStyle={{
                borderRadius: "0.5rem",
                fontSize: "0.875rem",
              }}
            >
              {[file.code]}
            </SyntaxHighlighter>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function VariantsPanel({
  variants,
  selections,
  onChange,
}: {
  variants: ComponentVariant[];
  selections: Record<string, string>;
  onChange: (s: Record<string, string>) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap gap-4 rounded-lg border p-4">
      {variants.map((v) => {
        const current = selections[v.prop] || v.options[0];
        return (
          <div key={v.prop}>
            <p className="mb-1 text-sm font-medium text-muted-foreground">
              {v.prop}
            </p>
            <div className="flex gap-1">
              {v.options.map((opt) => (
                <Button
                  key={opt}
                  variant={current === opt ? "default" : "outline"}
                  size="sm"
                  onClick={() =>
                    onChange({ ...selections, [v.prop]: opt })
                  }
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
