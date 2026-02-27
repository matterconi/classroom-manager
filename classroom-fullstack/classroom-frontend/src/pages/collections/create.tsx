import { CreateView } from "@/components/refine-ui/views/create-view";
import { Breadcrumb } from "@/components/refine-ui/layout/breadcrumb";
import { Button } from "@/components/ui/button";
import AIButton from "@/components/ui/ai-input";
import { useBack, useList } from "@refinedev/core";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "@refinedev/react-hook-form";
import { useAi } from "@/hooks/useAI";
import { collectionSchema } from "@/lib/schema";
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
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Category } from "@/types";
import { DOMAIN_OPTIONS, COLLECTION_STACK_OPTIONS, STATUS_OPTIONS, BACKEND_BASE_URL } from "@/constants";
import { buildCollectionPrompt } from "@/lib/prompts";
import { useFieldArray } from "react-hook-form";
import { useEffect, useMemo } from "react";

const CollectionCreate = () => {
  const back = useBack();

  const form = useForm<z.infer<typeof collectionSchema>>({
    resolver: zodResolver(collectionSchema) as any,
    refineCoreProps: {
      resource: "collections",
      action: "create",
    },
    defaultValues: {
      status: "draft",
      entryFile: "",
      files: [{ name: "", code: "" }],
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

  const onSubmit = async (values: Record<string, unknown>) => {
    try {
      const data = values as z.infer<typeof collectionSchema>;
      await onFinish(data);
    } catch (error) {
      console.error("Error creating collection:", error);
    }
  };

  const { query: categoriesQuery } = useList<Category>({
    resource: "categories",
    pagination: { pageSize: 100 },
    filters: [{ field: "resource", operator: "eq", value: "collections" }],
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
      if (parsed.domain) form.setValue("domain", parsed.domain);
      if (parsed.stack) form.setValue("stack", parsed.stack);
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
            body: JSON.stringify({ name: parsed.category, resource: "collections" }),
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
  }, [result, form, categories, categoriesQuery]);

  const handleGenerate = async () => {
    const name = form.getValues("name");
    const files = form.getValues("files");

    const prompt = buildCollectionPrompt(name, files, {
      categories: categories.map((c) => c.name),
    });
    generate(prompt);
  };

  return (
    <CreateView>
      <Breadcrumb />

      <h1 className="page-title">Create a Collection</h1>
      <div className="intro-row">
        <p>Add a collection with multiple files.</p>
        <Button onClick={() => back()}>Go Back</Button>
      </div>

      <Separator />

      <div className="my-4 flex items-center">
        <Card className="w-full max-w-3xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">New Collection</CardTitle>
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
                          placeholder="e.g. Auth System"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

                  <FormField
                    control={control}
                    name="stack"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stack</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select stack" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COLLECTION_STACK_OPTIONS.map((opt) => (
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
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
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
                </div>

                <FormField
                  control={control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Brief description of the collection"
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
                            placeholder="e.g. express"
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
                            placeholder="e.g. auth"
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
                                  placeholder="e.g. AuthForm.tsx"
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
                      <span>Creating Collection...</span>
                      <Loader2 className="ml-2 inline-block animate-spin" />
                    </div>
                  ) : (
                    "Create Collection"
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

export default CollectionCreate;
