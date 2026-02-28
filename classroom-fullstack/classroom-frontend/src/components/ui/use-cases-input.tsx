import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import type { UseCase } from "@/types";

type Props = {
  value: UseCase[];
  onChange: (value: UseCase[]) => void;
};

export function UseCasesInput({ value, onChange }: Props) {
  const add = () => onChange([...value, { title: "", use: "" }]);
  
  const remove = (index: number) =>
    onChange(value.filter((_, i) => i !== index));
  
  const update = (index: number, field: keyof UseCase, val: string) =>
    onChange(value.map((item, i) => (i === index ? { ...item, [field]: val } : item)));

  return (
    <div className="space-y-3">
      {value.map((uc, i) => (
        <div key={i} className="flex gap-2 items-start">
          <div className="flex-1 space-y-2">
            <Input
              placeholder="Title (e.g. Form validation)"
              value={uc.title}
              onChange={(e) => update(i, "title", e.target.value)}
            />
            <Textarea
              placeholder="When and why to use this..."
              value={uc.use}
              onChange={(e) => update(i, "use", e.target.value)}
              className="min-h-[60px]"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(i)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus className="mr-1 h-4 w-4" /> Add Use Case
      </Button>
    </div>
  );
}
