import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ModuleWorkspace } from "@/components/modules/module-workspace";
import { allFeatureParams, getFeature } from "@/lib/modules";

type Props = {
  params: Promise<{ module: string; feature: string }>;
};

export function generateStaticParams() {
  return allFeatureParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { module: moduleId, feature: featureId } = await params;
  if (moduleId === "achats" && featureId === "bons-achat") {
    return { title: "Approvisionnement" };
  }
  if (moduleId === "achats" && featureId === "livraisons-entrantes") {
    return { title: "Historique d’approvisionnement" };
  }
  if (moduleId === "achats" && featureId === "comparateur") {
    return { title: "Approvisionnement" };
  }
  if (moduleId === "stocks" && (featureId === "consommables" || featureId === "reservations")) {
    return { title: "Suivi stock" };
  }
  const found = getFeature(moduleId, featureId);
  if (!found) return { title: "Écran introuvable" };
  return { title: found.feature.title, description: found.feature.description };
}

export default async function FeaturePage({ params }: Props) {
  const { module: moduleId, feature: featureId } = await params;
  if (moduleId === "achats" && featureId === "bons-achat") {
    redirect("/admin/achats/approvisionnement");
  }
  if (moduleId === "achats" && featureId === "livraisons-entrantes") {
    redirect("/admin/achats/historique-approvisionnement");
  }
  if (moduleId === "achats" && featureId === "comparateur") {
    redirect("/admin/achats/approvisionnement");
  }
  if (moduleId === "stocks" && (featureId === "consommables" || featureId === "reservations")) {
    redirect("/admin/stocks/stock-papier");
  }
  const found = getFeature(moduleId, featureId);
  if (!found) notFound();
  return <ModuleWorkspace module={found.moduleDefinition} feature={found.feature} />;
}
