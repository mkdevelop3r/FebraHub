/* ============================================================
   ETAPAS DO ROTEIRO — rótulo humano de cada etapa auditada.

   A chave é o valor cru de `dim_peso_etapa.etapa`: o banco fala
   snake_case, a tela fala português.

   Este arquivo existe porque o mapa passou a ter DOIS consumidores — o
   Hub de Auditoria, em FebraHub.jsx, e o painel de prova, em
   Rotas/AuditoriaProva.jsx. Deixar uma cópia em cada lado funcionaria
   hoje e divergiria no dia em que alguém renomeasse uma etapa; importar
   um do outro criaria ciclo entre a tela e o hub que a rende.
   ============================================================ */

export const ETAPAS_ROTULO = {
  apresentacao: "Apresentação",
  quebra_gelo: "Quebra-gelo",
  conhecimento_previo: "Conhecimento prévio",
  motivo_contato: "Motivo do contato",
  perfil_profissional: "Perfil profissional",
  objetivos_futuro: "Objetivos de futuro",
  desafios_dores: "Desafios e dores",
  apresentacao_treinamento: "Apresentação do treinamento",
  validacao_interesse: "Validação de interesse",
  tratamento_objecoes: "Tratamento de objeções",
  fechamento: "Fechamento",
  proximos_passos: "Próximos passos",
};

/* Etapa desconhecida não vira erro nem some: vira o próprio nome com os
   sublinhados trocados por espaço. Se o roteiro ganhar uma etapa e
   ninguém atualizar este arquivo, a tela mostra "nova etapa" em vez de
   "undefined". */
export const rotuloEtapa = (e) =>
  ETAPAS_ROTULO[e] ?? String(e ?? "—").replace(/_/g, " ");
