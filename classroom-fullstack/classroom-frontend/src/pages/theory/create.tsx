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
import { theorySchema } from "@/lib/schema";
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
import { Loader2 } from "lucide-react";
import type { Category } from "@/types";
import {
  THEORY_TYPE_OPTIONS,
  DOMAIN_OPTIONS,
  COMPLEXITY_OPTIONS,
  BACKEND_BASE_URL,
} from "@/constants";
import { buildTheoryPrompt } from "@/lib/prompts";
import { useEffect, useMemo } from "react";

const TheoryCreate = () => {
  const back = useBack();

  const form = useForm<z.infer<typeof theorySchema>>({
    resolver: zodResolver(theorySchema) as any,
    refineCoreProps: {
      resource: "theory",
      action: "create",
    },
    defaultValues: {},
  });

  const {
    refineCore: { onFinish },
    handleSubmit,
    formState: { isSubmitting },
    control,
  } = form;

  const onSubmit = async (values: Record<string, unknown>) => {
    try {
      const data = values as z.infer<typeof theorySchema>;
      await onFinish(data);
    } catch (error) {
      console.error("Error creating theory:", error);
    }
  };

  const { query: categoriesQuery } = useList<Category>({
    resource: "categories",
    pagination: { pageSize: 100 },
    filters: [{ field: "resource", operator: "eq", value: "theory" }],
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
      if (parsed.complexity) form.setValue("complexity", parsed.complexity);
      if (parsed.tags?.length) form.setValue("tags", parsed.tags);

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
            body: JSON.stringify({ name: parsed.category, resource: "theory" }),
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
    const code = form.getValues("code");

    const prompt = buildTheoryPrompt(name, code, {
      categories: categories.map((c) => c.name),
    });
    generate(prompt);
  };

  return (
    <CreateView>
      <Breadcrumb />

      <h1 className="page-title">Create a Theory Entry</h1>
      <div className="intro-row">
        <p>Add name and code example. All other fields are optional.</p>
        <Button onClick={() => back()}>Go Back</Button>
      </div>

      <Separator />

      <div className="my-4 flex items-center">
        <Card className="w-full max-w-3xl">
          <CardHeader>
            <CardTitle className="text-2xl font-bold">New Theory</CardTitle>
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
                          placeholder="e.g. Binary Search"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Code Example <span className="text-orange-600">*</span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Paste an example implementation..."
                          className="min-h-[300px] font-mono text-sm"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
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
                            {THEORY_TYPE_OPTIONS.map((opt) => (
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
                    name="complexity"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Complexity</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select complexity" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {COMPLEXITY_OPTIONS.map((opt) => (
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
                          placeholder="What is this concept and how does it work?"
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
                          placeholder="When to apply this algorithm/pattern..."
                          {...field}
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
                          placeholder="e.g. sorting"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <AIButton onGenerate={handleGenerate} isLoading={isLoading} />

                <Separator />

                <Button type="submit" size="lg" className="w-full">
                  {isSubmitting ? (
                    <div className="flex gap-1">
                      <span>Creating Theory...</span>
                      <Loader2 className="ml-2 inline-block animate-spin" />
                    </div>
                  ) : (
                    "Create Theory"
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

export default TheoryCreate;
