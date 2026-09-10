import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/admin/achats/bons-achat", destination: "/admin/achats/approvisionnement", permanent: false },
      { source: "/admin/achats/livraisons-entrantes", destination: "/admin/achats/historique-approvisionnement", permanent: false },
      { source: "/admin/achats/comparateur", destination: "/admin/achats/approvisionnement", permanent: false },
      { source: "/admin/stocks/consommables", destination: "/admin/stocks/stock-papier", permanent: false },
      { source: "/admin/stocks/reservations", destination: "/admin/stocks/stock-papier", permanent: false },
    ];
  },
};

export default nextConfig;
