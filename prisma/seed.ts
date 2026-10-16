import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const channels = [
    "PORTAL DO ACADÊMICO",
    "NPS",
    "PLANILHA QR CODE",
    "REPRESENTANTES",
    "COLABORADOR",
    "INSTRUTORES",
    "RELATO PESSOAL DO ESTUDANTE",
  ];

  const locations = [
    "PEDAGÓGICO",
    "SECRETARIA",
    "ESTRUTURA",
    "BANHEIROS",
    "SALA DE AULA",
    "FINANCEIRO",
    "WIFI",
    "ÁREA EXTERNA",
    "OUTROS",
    "LAB. ENFERMAGEM",
    "LAB. ELETROTÉCNICA",
    "ESTÁGIO",
    "TODOS",
    "COPA",
    "BIBLIOTECA",
    "COMERCIAL",
    "LAB. INFORMÁTICA",
    "LAB. RADIOLOGIA",
  ];

  const categories = [
    "Reclamação",
    "Sugestão",
    "Elogio",
    "Não conformidade",
    "Solicitação",
  ];

  const responsibles = [
    "DIEGO SANTOS",
    "AMANDA",
    "DANIEL",
    "ANDREIA",
    "HERMESON",
    "LUIZ",
    "CAMILA",
    "FRANKLIN",
    "DAIANA",
    "TODOS",
  ];

  for (const name of channels) {
    await prisma.channel.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of locations) {
    await prisma.location.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of categories) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  for (const name of responsibles) {
    await prisma.responsible.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  await prisma.user.upsert({
    where: { email: "qualidade@grautecnico.local" },
    update: {},
    create: {
      name: "Equipe da Qualidade",
      email: "qualidade@grautecnico.local",
      role: "ADMIN",
    },
  });

  console.log("Cadastros iniciais criados com sucesso.");
}

main()
  .catch((error) => {
    console.error("Erro ao executar seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
