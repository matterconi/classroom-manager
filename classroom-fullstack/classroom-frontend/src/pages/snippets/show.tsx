import {
  ShowView,
  ShowViewHeader,
} from "@/components/refine-ui/views/show-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Copy, Check, Loader2 } from "lucide-react";
import { useState } from "react";

import type { Snippet } from "@/types";
import { useShow } from "@refinedev/core";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { DOMAIN_OPTIONS, SNIPPET_STACK_OPTIONS, LANGUAGE_OPTIONS } from "@/constants";

const languageMap: Record<string, string> = {
  typescript: "tsx",
  javascript: "jsx",
  python: "python",
  sql: "sql",
  css: "css",
  html: "html",
  shell: "bash",
};

const SnippetShow = () => {
  const { query } = useShow<Snippet>({ resource: "snippets" });
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
        <p className="text-muted-foreground">Snippet not found.</p>
      </ShowView>
    );
  }

  const domainLabel =
    DOMAIN_OPTIONS.find((o) => o.value === record.domain)?.label ??
    record.domain;
  const stackLabel =
    SNIPPET_STACK_OPTIONS.find((o) => o.value === record.stack)?.label ??
    record.stack;
  const languageLabel =
    LANGUAGE_OPTIONS.find((o) => o.value === record.language)?.label ??
    record.language;

  const syntaxLang = languageMap[record.language || ""] || "typescript";

  return (
    <ShowView>
      <ShowViewHeader />

      {/* Metadata */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">{record.name}</CardTitle>
            <div className="flex gap-2">
              {record.domain && (
                <Badge variant="secondary">{domainLabel}</Badge>
              )}
              {record.stack && (
                <Badge variant="secondary">{stackLabel}</Badge>
              )}
              {record.language && (
                <Badge variant="secondary" className="font-mono">
                  {languageLabel}
                </Badge>
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

      {/* Source Code */}
      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Source Code</CardTitle>
          <Button variant="outline" size="sm" onClick={handleCopy}>
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
            language={syntaxLang}
            style={oneDark}
            customStyle={{
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
            }}
          >
            {[record.code ?? ""]}
          </SyntaxHighlighter>
        </CardContent>
      </Card>
    </ShowView>
  );
};

export default SnippetShow;

function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-foreground">{value ?? "—"}</p>
    </div>
  );
}
