import { CreateView } from "@/components/refine-ui/views/create-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { Button } from "@/components/ui/button";
import AIButton from "@/components/ui/ai-input";
import { useBack, useList } from "@refinedev/core";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "@refinedev/react-hook-form";
import { useFieldArray } from "react-hook-form";
import { useAi } from "@/hooks/useAI";
import { componentSchema } from "@/lib/schema";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/ui/tag-input";
import { FileDropzone } from "@/components/ui/file-dropzone";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Category } from "@/types";
import { COMPONENT_TYPE_OPTIONS, DOMAIN_OPTIONS, BACKEND_BASE_URL } from "@/constants";
import { buildComponentPrompt } from "@/lib/prompts";
import { useEffect, useMemo } from "react";

const ComponentCreate = () => {
  const back = useBack();

  const form = useForm<z.infer<typeof componentSchema>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(componentSchema) as any,
    refineCoreProps: {
      resource: "components",
      action: "create",
    },
    defaultValues: {
      files: [{ name: "", code: "" }],
      entryFile: "",
    },
  });

  const {
    refineCore: { onFinish },
    handleSubmit,
    formState: { isSubmitting },
    control,
  } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "files",
  });

  const { query: categoriesQuery } = useList<Category>({
    resource: "categories",
    pagination: { pageSize: 100 },
    filters: [{ field: "resource", operator: "eq", value: "components" }],
  });
  const categories = useMemo(() => categoriesQuery?.data?.data || [], [categoriesQuery]);

  const { generate, result, isLoading } = useAi();

  useEffect(() => {
    if (!result) return;

    const cleaned = result
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    
    try {
      const parsed = JSON.parse(cleaned);

      if (parsed.description) form.setValue("description", parsed.description);
      if (parsed.useCases) form.setValue("useCases", parsed.useCases);
      if (parsed.type) form.setValue("type", parsed.type);
      if (parsed.domain) form.setValue("domain", parsed.domain);
      if (parsed.libraries?.length) form.setValue("libraries", parsed.libraries);
      if (parsed.tags?.length) form.setValue("tags", parsed.tags);
      if (parsed.entryFile) form.setValue("entryFile", parsed.entryFile);

      if (parsed.category) {
        const match = categories.find(
          (c) => c.name.toLowerCase() === parsed.category.toLowerCase()
        );
        if (match) {
          form.setValue("categoryId", match.id);
        } else {
          fetch(`${BACKEND_BASE_URL}/api/categories`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: parsed.category, resource: "components" }),
          })
            .then((res) => res.json())
            .then(({ data }) => {
              if (data?.id) {
                form.setValue("categoryId", data.id);
                categoriesQuery.refetch();
              }
            })
            .catch((err) => console.error("Failed to create category:", err));
        }
      }
    } catch (e) {
      console.error("Failed to parse AI result:", e);
    }
  }, [result, form, categories, categoriesQuery])

  const onSubmit = async (values: Record<string, unknown>) => {
    try {
      const data = values as z.infer<typeof componentSchema>;
      await onFinish(data);
    } catch (error) {
      console.error("Error creating component:", error);
    }
  };

  const handleGenerate = async () => {
    const name = form.getValues("name");
    const files = form.getValues("files");
    const res = await fetch(`${BACKEND_BASE_URL}/api/components/meta`);
    const meta = await res.json();

    const prompt = buildComponentPrompt(name, files, {
      ...meta,
      categories: categories.map((c) => c.name),
    });
    generate(prompt);
  };

  const handleFilesAdded = (newFiles: { name: string; code: string }[]) => {
    const currentFiles = form.getValues("files");
    if (
      currentFiles.length === 1 &&
      !currentFiles[0].name &&
      !currentFiles[0].code
    ) {
      remove(0);
    }
    for (const file of newFiles) {
      append(file);
    }
  };

  return (
    <CreateView>
      <Breadcrumb />

      <h1 className="page-title">Create a Component</h1>
      <div className="intro-row">
        <p>Add name and files. All other fields are optional.</p>
        <Button onClick={() => back()}>Go Back</Button>
      </div>

      <Separator />

      <div className="my-4 flex items-center">
        <Card className="w-full max-w-3xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">New Component</CardTitle>
          </CardHeader>

          <Separator />

          <CardContent className="mt-7">
            <Form {...form}>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Name <span className="text-orange-600">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g. AnimatedCard"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COMPONENT_TYPE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="domain"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Domain</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select domain" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DOMAIN_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="categoryId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category</FormLabel>
                        <Select
                          onValueChange={(value) =>
                            field.onChange(Number(value))
                          }
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {categories.map((cat) => (
                              <SelectItem
                                key={cat.id}
                                value={cat.id.toString()}
                              >
                                {cat.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                </div>

                <FormField
                  control={control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of the component"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="useCases"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Use Cases</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="When should this component be used?"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={control}
                    name="libraries"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Libraries</FormLabel>
                        <FormControl>
                          <TagInput
                            value={field.value || []}
                            onChange={field.onChange}
                            placeholder="e.g. framer-motion"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={control}
                    name="tags"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tags</FormLabel>
                        <FormControl>
                          <TagInput
                            value={field.value || []}
                            onChange={field.onChange}
                            placeholder="e.g. animation"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <Separator />

                {/* Files section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">
                      Files <span className="text-orange-600">*</span>
                    </h3>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ name: "", code: "" })}
                    >
                      <Plus className="mr-1 h-4 w-4" /> Add File
                    </Button>
                  </div>

                  <FileDropzone onFilesAdded={handleFilesAdded} />

                  {fields.map((fieldItem, index) => (
                    <Card key={fieldItem.id} className="p-4">
                      <div className="mb-3 flex items-center justify-between">
                        <span className="text-sm font-medium text-muted-foreground">
                          File {index + 1}
                        </span>
                        {fields.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => remove(index)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>

                      <div className="space-y-3">
                        <FormField
                          control={control}
                          name={`files.${index}.name`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>File Name</FormLabel>
                              <FormControl>
                                <Input
                                  placeholder="e.g. AnimatedCard.tsx"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={control}
                          name={`files.${index}.code`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Code</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Paste code here..."
                                  className="min-h-[200px] font-mono text-sm"
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </Card>
                  ))}

                  <FormField
                    control={control}
                    name="entryFile"
                    render={({ field: entryField }) => (
                      <FormItem>
                        <FormLabel>Entry File</FormLabel>
                        <Select
                          onValueChange={entryField.onChange}
                          value={entryField.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select entry file for preview" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {fields.map((f, i) => {
                              const fileName = form.getValues(`files.${i}.name`);
                              return fileName ? (
                                <SelectItem key={f.id} value={fileName}>
                                  {fileName}
                                </SelectItem>
                              ) : null;
                            })}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <AIButton onGenerate={handleGenerate} isLoading={isLoading} />

                <Separator />

                <Button type="submit" size="lg" className="w-full">
                  {isSubmitting ? (
                    <div className="flex gap-1">
                      <span>Creating Component...</span>
                      <Loader2 className="ml-2 inline-block animate-spin" />
                    </div>
                  ) : (
                    "Create Component"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </CreateView>
  );
};

export default ComponentCreate;
