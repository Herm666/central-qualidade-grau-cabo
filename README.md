# Central de Qualidade — Grau Técnico Cabo

Aplicação web independente para manifestações, tratativas, feedbacks e indicadores. Stack: Next.js App Router, TypeScript, Prisma 6.19 e PostgreSQL no Neon. Sem Docker.

## Incluído
- Dashboard anual com todos os 12 meses, mesmo vazios.
- Cadastro e listagem de manifestações.
- Campos de canal, local, categoria, responsável, prazo, status, tratativa, divulgação e observações.
- Página de Voz do Aluno preparada para feedbacks.
- Cadastros de referência e histórico de alterações no banco.
- Seed com canais, locais, categorias e responsáveis iniciais.
- API GET/POST para manifestações.
- Layout responsivo.

## Instalação (PowerShell/Windows)
```powershell
cd "$env:USERPROFILE\Desktop\central-qualidade-grau-cabo"
npm.cmd install
Copy-Item .env.example .env.local
notepad .env.local
```
Preencha `DATABASE_URL` com a URL do banco Neon. Nunca publique credenciais no GitHub.

Depois execute:
```powershell
npx.cmd prisma generate
npx.cmd prisma validate
npx.cmd prisma migrate dev --name init
npm.cmd run db:seed
npm.cmd run dev
```
Abra http://localhost:3000.

## Neon + Vercel
1. Na Vercel, abra o projeto `central-qualidade-grau-cabo` e confirme a integração Neon.
2. Em Settings → Environment Variables, confirme `DATABASE_URL` em Preview e Production. Ela deve ser do Neon, não do antigo Supabase.
3. Vincule a pasta se necessário: `npx.cmd vercel link`
4. Baixe Preview para `.env.local`: `npx.cmd vercel env pull .env.local --environment=preview`
5. Não imprima nem compartilhe a URL do banco: ela contém credenciais.
6. Rode migrations em um banco de desenvolvimento antes de aplicar em produção.

## Importação da planilha de 2026
A importação histórica não é automática neste pacote. A base antiga tem cabeçalhos/linhas que não são registros e datas/prazos inconsistentes. Faça cópia original, valide datas, responsáveis, status e prazos, e documente as correções. Não altere anos automaticamente sem revisão.

## Segurança — importante
Este pacote ainda **não inclui autenticação**. Antes de uso real, implemente login e autorização, proteja os endpoints e restrinja relatos identificáveis de estudantes. Configure backups e política de retenção. A tabela de histórico existe; o registro detalhado de edições deve ser ampliado junto com a função de edição. Não use `npm audit fix --force` como solução genérica.
