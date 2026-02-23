import { ShowView, ShowViewHeader } from "@/components/refine-ui/views/show-view";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Loader2 } from "lucide-react";

import type { ClassDetails } from "@/types";
import { useShow } from "@refinedev/core";

const ClassesShow = () => {
  // ============================================================
  // TODO 1: Usa useShow<ClassDetails> per fetchare i dati
  //
  // import { useShow } from "@refinedev/core";
  //
  // const { query } = useShow<ClassDetails>({ resource: "classes" });
  // const record = query?.data?.data;
  // const isLoading = query?.isLoading;
  // ============================================================

  const { query } = useShow<ClassDetails>({ resource: "classes" });
  
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
        <p className="text-muted-foreground">Class not found.</p>
      </ShowView>
    );
  }

  return (
    <ShowView>
      <ShowViewHeader />

      {/* Banner */}
      {record.bannerUrl && (
        <div className="overflow-hidden rounded-lg">
          <img
            src={record.bannerUrl}
            alt={record.name}
            className="h-48 w-full object-cover"
          />
        </div>
      )}

      {/* Info principali */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl">{record.name}</CardTitle>
            <Badge variant={record.status === "active" ? "default" : "secondary"}>
              {record.status}
            </Badge>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="mt-4 grid gap-4 sm:grid-cols-2">
          <InfoField label="Course Code" value={record.courseCode} />
          <InfoField label="Capacity" value={record.capacity?.toString()} />
          <InfoField label="Subject" value={record.subject?.name} />
          <InfoField label="Teacher" value={record.teacher?.name} />
          <InfoField label="Department" value={record.department?.name} />
          <InfoField label="Invite Code" value={record.inviteCode} />
        </CardContent>
      </Card>

      {/* Descrizione */}
      {record.description && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{record.description}</p>
          </CardContent>
        </Card>
      )}
    </ShowView>
  );
};

export default ClassesShow;

/* ── Componente helper interno ── */

function InfoField({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-foreground">{value ?? "—"}</p>
    </div>
  );
}
