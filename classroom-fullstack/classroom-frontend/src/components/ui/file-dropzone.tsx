import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload, File, FolderOpen } from "lucide-react";
import { Button } from "./button";

type FileEntry = { name: string; code: string };

interface FileDropzoneProps {
  onFilesAdded: (files: FileEntry[]) => void;
}

const IGNORED = ["node_modules", ".git", ".DS_Store", ".env", "thumbs.db"];

function isIgnored(name: string): boolean {
  return IGNORED.includes(name);
}

function readFileAsText(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

async function readAllEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];
  do {
    batch = await new Promise((res, rej) => reader.readEntries(res, rej));
    all.push(...batch);
  } while (batch.length > 0);
  return all;
}

async function traverseEntry(
  entry: FileSystemEntry,
  path = "",
): Promise<FileEntry[]> {
  if (isIgnored(entry.name)) return [];
  const fullPath = path ? `${path}/${entry.name}` : entry.name;

  if (entry.isFile) {
    const file = await new Promise<globalThis.File>((res, rej) =>
      (entry as FileSystemFileEntry).file(res, rej),
    );
    try {
      const code = await readFileAsText(file);
      return [{ name: fullPath, code }];
    } catch {
      return [];
    }
  }

  if (entry.isDirectory) {
    const dirReader = (entry as FileSystemDirectoryEntry).createReader();
    const entries = await readAllEntries(dirReader);
    const results: FileEntry[] = [];
    for (const child of entries) {
      results.push(...(await traverseEntry(child, fullPath)));
    }
    return results;
  }

  return [];
}

export function FileDropzone({ onFilesAdded }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const items = e.dataTransfer.items;
      const results: FileEntry[] = [];

      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) {
          results.push(...(await traverseEntry(entry)));
        }
      }

      if (results.length > 0) onFilesAdded(results);
    },
    [onFilesAdded],
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList) return;

      const results: FileEntry[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        if (isIgnored(file.name)) continue;
        try {
          const code = await readFileAsText(file);
          const name = file.webkitRelativePath || file.name;
          results.push({ name, code });
        } catch {
          // skip unreadable files
        }
      }

      if (results.length > 0) onFilesAdded(results);
      e.target.value = "";
    },
    [onFilesAdded],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={`flex flex-col items-center gap-3 rounded-lg border-2 border-dashed p-6 transition-colors ${
        isDragging
          ? "border-primary bg-primary/5"
          : "border-muted-foreground/25"
      }`}
    >
      <Upload className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">
        Drag & drop files or a folder here
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
        >
          <File className="mr-1 h-4 w-4" /> Browse Files
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => folderInputRef.current?.click()}
        >
          <FolderOpen className="mr-1 h-4 w-4" /> Browse Folder
        </Button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}
