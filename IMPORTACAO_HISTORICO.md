# Importação do histórico da Qualidade 2026

A planilha antiga deve ser tratada como fonte histórica, não como banco operacional.

Antes da importação:
1. Faça uma cópia imutável do Excel original.
2. Separe manifestações de feedbacks.
3. Remova cabeçalhos repetidos e linhas que não sejam registros.
4. Normalize datas para `AAAA-MM-DD`, mas não altere anos automaticamente sem revisão.
5. Revise prazos; há valores aparentemente inconsistentes.
6. Normalize canais, locais e responsáveis com os cadastros de referência.
7. Preserve o texto original e registre correções em planilha de auditoria.

Campos de manifestação: `date, channel, location, category, issue, action, responsible, deadline, status, disclosure, sourceReference`.

Status: `PENDENTE`, `EM_ANALISE`, `EM_ANDAMENTO`, `CONCLUIDO`, `INDEFERIDO`.

Importador futuro deve validar cada linha, evitar duplicações em reexecução e produzir relatório de rejeições. Não importe linhas ambíguas como dados oficiais.
