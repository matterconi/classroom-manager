import { useState } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { BACKEND_BASE_URL } from "@/constants";
import { Loader2, Upload, CheckCircle2, XCircle, Trash2 } from "lucide-react";

type FileEntry = { name: string; code: string };

type PieceRecord = {
  name: string;
  itemId: number;
  level: string;
  action: "created" | "reused";
  makeDemo: boolean;
  verdict: string | null;
};

type DemoRecord = {
  itemId: number;
  demoId: number;
  name: string;
  action: string;
};

type IngestResult = {
  data: { id: number; name: string; kind: string; description?: string };
  hierarchy?: { items: PieceRecord[] } | null;
  demos?: DemoRecord[];
};

const UploadPage = () => {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFilesAdded = (newFiles: FileEntry[]) => {
    setFiles((prev) => [...prev, ...newFiles]);
    setResult(null);
    setError(null);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch(`${BACKEND_BASE_URL}/api/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }

      const json: IngestResult = await res.json();
      setResult(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const kindRoute = (kind: string) => {
    if (kind === "snippet") return "snippets";
    if (kind === "component") return "components";
    return "collections";
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-3xl font-bold">Upload</h1>
      <p className="text-muted-foreground">
        Drop files or a folder. The AI classifies, decomposes, and generates demos automatically.
      </p>

      <Separator />

      <div className="flex items-start gap-6">
        <Card className="w-full max-w-2xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Files
            </CardTitle>
          </CardHeader>

          <Separator />

          <CardContent className="mt-4 space-y-4">
            <FileDropzone onFilesAdded={handleFilesAdded} />

            {files.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  {files.length} file{files.length !== 1 ? "s" : ""} ready
                </p>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded border p-2">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between rounded px-2 py-1 text-sm hover:bg-muted"
                    >
                      <span className="truncate font-mono text-xs">
                        {f.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => removeFile(i)}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>

                <Button
                  onClick={handleUpload}
                  disabled={isUploading}
                  size="lg"
                  className="w-full"
                >
                  {isUploading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </div>
                  ) : (
                    "Upload & Process"
                  )}
                </Button>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                <XCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Result
              </CardTitle>
            </CardHeader>

            <Separator />

            <CardContent className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-base font-semibold"
                  onClick={() =>
                    navigate(
                      `/${kindRoute(result.data.kind)}/show/${result.data.id}`,
                    )
                  }
                >
                  {result.data.name}
                </Button>
                <span className="ml-2 rounded bg-muted px-2 py-0.5 text-xs">
                  {result.data.kind}
                </span>
                {result.data.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {result.data.description}
                  </p>
                )}
              </div>

              {result.hierarchy && result.hierarchy.items.length > 0 && (
                <div>
                  <p className="text-sm font-medium">
                    Pieces ({result.hierarchy.items.length})
                  </p>
                  <div className="mt-1 space-y-1">
                    {result.hierarchy.items.map((piece, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className={`rounded px-1.5 py-0.5 text-xs ${
                            piece.action === "reused"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                              : "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
                          }`}
                        >
                          {piece.action}
                        </span>
                        <span>{piece.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {piece.level}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.demos && result.demos.length > 0 && (
                <div>
                  <p className="text-sm font-medium">
                    Demos ({result.demos.length})
                  </p>
                  <div className="mt-1 space-y-1">
                    {result.demos.map((demo, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                          {demo.action}
                        </span>
                        <span>{demo.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setFiles([]);
                  setResult(null);
                }}
              >
                Upload Another
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default UploadPage;
