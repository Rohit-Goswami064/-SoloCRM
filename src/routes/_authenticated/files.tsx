/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Surface } from "@/components/crm/Common";
import { FileManager } from "@/components/crm/FileManager";

export const Route = createFileRoute("/_authenticated/files")({
  head: () => ({
    meta: [
      { title: "Files · SoloCRM" },
      { name: "description", content: "Every proposal, invoice, contract and screenshot stored securely in one place." },
      { property: "og:title", content: "Files · SoloCRM" },
      { property: "og:description", content: "Proposals, invoices, contracts and screenshots stored securely in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: FilesPage,
});

function FilesPage() {
  return (
    <div>
      <PageHeader
        title="Files"
        description="Stored privately — download links are temporary and only work for you."
      />
      <Surface>
        <FileManager />
      </Surface>
    </div>
  );
}
