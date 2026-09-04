import { notFound } from "next/navigation";
import { DemoStage } from "@/components/DemoStage";
import { getSpace, spaceIds } from "@/lib/spaces";

export function generateStaticParams() {
  return spaceIds().map((spaceId) => ({ spaceId }));
}

export default async function DemoPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  if (!getSpace(spaceId)) notFound();

  // The stage looks the space up itself on the client rather than receiving it
  // serialized across the RSC boundary — the config is plain data either way,
  // and this keeps one source of truth for loading it.
  return <DemoStage spaceId={spaceId} />;
}
