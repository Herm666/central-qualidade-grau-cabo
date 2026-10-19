import type {Metadata} from "next";
import Link from "next/link";
import SyncNotice from "@/components/sync-notice";
import "./globals.css";

export const metadata: Metadata = {
  title: "Central de Qualidade | Grau Técnico Cabo",
  description: "Gestão de manifestações, feedbacks e indicadores da qualidade."
};

const links = [
  {href:"/",label:"Visão geral"},
  {href:"/manifestacoes",label:"Manifestações"},
  {href:"/manifestacoes/nova",label:"+ Nova manifestação"},
  {href:"/feedbacks",label:"Voz do aluno"}
];

export default function RootLayout({children}:{children:React.ReactNode}) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">GRAU TÉCNICO<small>CENTRAL DE QUALIDADE</small></div>
            <div className="nav-label">GESTÃO DA QUALIDADE</div>
            <nav className="nav-items">
              {links.map(l => <Link className="nav-link" href={l.href} key={l.href}>{l.label}</Link>)}
            </nav>
            <div className="nav-label" style={{marginTop:24}}>SISTEMA</div>
            <div style={{padding:"0 12px",fontSize:12,color:"#9fb5d2",lineHeight:1.6}}>
              Base centralizada<br/>Indicadores por mês e ano
            </div>
          </aside>
          <main className="main">
            {children}
          </main>
        </div>
        <SyncNotice />
      </body>
    </html>
  );
}
