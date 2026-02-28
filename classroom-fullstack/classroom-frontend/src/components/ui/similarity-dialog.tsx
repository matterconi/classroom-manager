import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
  } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";
  import { Badge } from "@/components/ui/badge";
  import type { SimilarItem } from "@/types";
  
  type Props = {
	items: SimilarItem[];
	onChoice: (choice: "variant" | "integration" | "standalone", targetId?: number) => void;
	onClose: () => void;
  };
  
  export function SimilarityDialog({ items, onChoice, onClose }: Props) {
	return (
	  <Dialog open onOpenChange={() => onClose()}>
		<DialogContent className="max-w-lg">
		  <DialogHeader>
			<DialogTitle>Similar items found</DialogTitle>
			<DialogDescription>
			  We found existing items that are similar. Would you like to link them?
			</DialogDescription>
		  </DialogHeader>
  
		  <div className="space-y-3 max-h-64 overflow-y-auto">
			{items.map((item) => (
			  <div key={item.id} className="rounded-lg border p-3 space-y-2">
				<div className="flex items-center justify-between">
				  <span className="font-medium">{item.name}</span>
				  <Badge variant="secondary">
					{Math.round(item.similarity * 100)}% match
				  </Badge>
				</div>
				{item.description && (
				  <p className="text-sm text-muted-foreground">{item.description}</p>
				)}
				<div className="flex gap-2">
				  <Button
					size="sm"
					variant="outline"
					onClick={() => onChoice("variant", item.id)}
				  >
					Link as Variant
				  </Button>
				  <Button
					size="sm"
					variant="outline"
					onClick={() => onChoice("integration", item.id)}
				  >
					Link as Integration
				  </Button>
				</div>
			  </div>
			))}
		  </div>
  
		  <Button variant="ghost" onClick={() => onChoice("standalone")}>
			Keep standalone
		  </Button>
		</DialogContent>
	  </Dialog>
	);
  }
  