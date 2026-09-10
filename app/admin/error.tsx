"use client";

import { CircleAlert, RotateCcw } from "lucide-react";

export default function AdminError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <div className="page-error" role="alert">
      <span><CircleAlert size={28} /></span>
      <h1>Le module n’a pas pu être affiché.</h1>
      <p>Une erreur inattendue est survenue pendant le rendu. Vos données locales n’ont pas été modifiées.</p>
      <button className="button button-primary" onClick={retry}><RotateCcw size={17} /> Réessayer</button>
    </div>
  );
}
