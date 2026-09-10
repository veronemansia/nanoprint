import { notFound, redirect } from "next/navigation";
import { moduleMap } from "@/lib/modules";
import type { ModuleId } from "@/lib/types";

type Props = {
  params: Promise<{ module: string }>;
};

export default async function ModuleIndexPage({ params }: Props) {
  const { module: moduleId } = await params;
  const moduleDefinition = moduleMap[moduleId as ModuleId];
  if (!moduleDefinition) notFound();
  redirect(`/admin/${moduleDefinition.id}/${moduleDefinition.features[0].id}`);
}
