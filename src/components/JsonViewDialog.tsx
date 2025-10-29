import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState } from "react";

interface JsonViewDialogProps {
  data: any;
  triggerLabel?: string;
  title?: string;
}

export function JsonViewDialog({ data, triggerLabel = "Ver payload", title = "Payload completo" }: JsonViewDialogProps) {
  const [open, setOpen] = useState(false);
  const json = typeof data === "string" ? data : JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json);
    } catch (e) {
      // no-op
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">{triggerLabel}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto"> {/* Adicionado max-h e overflow-y-auto */}
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-background p-3">
            <pre className="max-h-96 overflow-auto text-xs leading-relaxed whitespace-pre-wrap break-all font-mono">
{json}
            </pre>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" size="sm" onClick={handleCopy}>Copiar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}