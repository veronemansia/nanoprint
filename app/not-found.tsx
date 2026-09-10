import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <main className="not-found">
      <span className="brand-mark"><i /><i /><i /><i /></span>
      <strong>404</strong>
      <h1>Cette feuille est sortie du format.</h1>
      <p>La page demandée n’existe pas ou a été déplacée.</p>
      <Link className="button button-primary" href="/admin"><ArrowLeft size={17} /> Retour à l’atelier</Link>
    </main>
  );
}
