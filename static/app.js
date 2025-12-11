// ===================== app.js - Frontend Nortetel =====================
// Este arquivo concentra toda a lógica de frontend da aplicação:
// - Tela de login
// - Armazenamento e uso do token JWT
// - Troca de senha obrigatória no primeiro acesso
// - Listagem e criação de avaliações simples
// ======================================================================

// ------------------------------
// Configurações básicas
// ------------------------------

// URL base da API. Quando o front é servido pela mesma aplicação FastAPI (ambiente local),
// podemos usar string vazia ("") para chamar a própria origem (ex.: http://127.0.0.1:8000/avaliacoes).
// Quando o front estiver hospedado em outro domínio (ex.: Netlify),
// precisamos apontar explicitamente para a URL pública do backend (Render, por exemplo).
// URL base da API.
// Em desenvolvimento local (frontend servido pelo próprio FastAPI em http://localhost:8000),
// usamos string vazia ("") para chamar a própria origem.
// Em produção (frontend hospedado em outro domínio, como Netlify),
// apontamos explicitamente para a URL pública do backend hospedado no Render.
const API_BASE_URL = (function () {                               // IIFE: função imediatamente executada que calcula a URL base
  const hostname = window.location.hostname;                      // obtém o hostname atual (ex.: "localhost", "avaliacao-nortetel.netlify.app")

  const isLocalhost =                                             // flag indicando se estamos em ambiente local
    hostname === "localhost" || hostname === "127.0.0.1";         // considera tanto "localhost" quanto "127.0.0.1" como desenvolvimento

  if (isLocalhost) {                                              // se estivermos rodando localmente
    return "";                                                    // usa string vazia: a API é chamada na mesma origem (FastAPI local)
  }

  // Se NÃO for localhost (ou seja, produção no Netlify, por exemplo),
  // usamos a URL pública do backend no Render.
  return "https://avaliacao-nortetel-backend.onrender.com";       // <-- SUBSTITUA aqui se o seu domínio do Render for outro
})();                                                             // executa a função imediatamente e guarda o resultado em API_BASE_URL

// Variável global para manter o token JWT em memória enquanto a página está aberta.
let authToken = null;

// Variável global para armazenar os dados do usuário logado (nome, se é admin, etc.).
let currentUser = null;

// Variável global para controlar se estamos editando uma avaliação existente (id diferente de null)
// ou criando uma nova (valor null).
let avaliacaoEmEdicaoId = null; // mantém o id da avaliação que está sendo editada (null significa "nova avaliação")

// Constante com a chave usada no localStorage para guardar a lista de rascunhos de avaliações.
const DRAFTS_STORAGE_KEY = "nortetel_avaliacoes_rascunhos_v1"; // chave única no localStorage para armazenar todos os rascunhos do sistema

const SESSION_MARKER_KEY = "nt_avaliacoes_had_session"; // chave usada no localStorage para indicar se este navegador já teve uma sessão autenticada
// Quando o usuário faz login com sucesso, gravamos "1" nessa chave.
// Quando o usuário faz logout manual, removemos essa chave.
// Assim conseguimos diferenciar "primeiro acesso" de "sessão expirada" ao abrir a página.

// Variável global para manter o id do rascunho atualmente associado ao formulário em edição.
let rascunhoEmEdicaoId = null; // guarda o identificador do rascunho local vinculado ao formulário (null quando não há rascunho carregado)

// Intervalo de tempo (em milissegundos) usado para o salvamento automático de rascunhos.
const AUTO_SAVE_DELAY_MS = 2000; // define um atraso de 2 segundos após a última digitação antes de salvar automaticamente

// Variável para armazenar o identificador do timer de autosave (retornado por setTimeout).
let autoSaveTimeoutId = null; // permite cancelar o salvamento automático anterior antes de agendar um novo

/**
 * Verifica se o formulário de avaliação está "vazio" do ponto de vista de rascunho.
 * Usa o objeto "valores" montado em coletarEstadoFormularioComoRascunho().
 * Se só tiver campos técnicos/ocultos ou tudo em branco, devolve true.
 */
function formularioRascunhoEstaVazio(valores) {
  console.log(
    "[RASCUNHO][DEBUG] Iniciando verificação de formulário vazio. Valores recebidos:",
    valores
  ); // registra no console todos os valores coletados antes de analisar se o formulário está vazio

  if (!valores || typeof valores !== "object") {          // se não vier um objeto de valores válido
    console.log(
      "[RASCUNHO][DEBUG] Valores inválidos ou indefinidos. Considerando formulário vazio."
    );                                                    // informa no console que não há dados utilizáveis
    return true;                                          // considera o formulário como vazio
  }

  const idsIgnorados = [                                              // lista de ids de campos que não contam como "preenchimento real"
    "rascunho-id",                                                    // id do campo oculto que guarda o id do rascunho
    "tipo-formulario",                                                // id do campo oculto que guarda o tipo de formulário (UTP/Fibra x Câmeras)
    "avaliacao-id",                                                   // id de eventual campo oculto técnico da avaliação (se existir)
  ];

  const chaves = Object.keys(valores);                                // obtém a lista de ids de campos presentes no objeto de valores

  for (let i = 0; i < chaves.length; i++) {                           // percorre cada chave (id de campo) encontrada
    const idCampo = chaves[i];                                        // guarda o id atual para facilitar leitura

    if (!Object.prototype.hasOwnProperty.call(valores, idCampo)) {    // garante que a chave é realmente própria do objeto (não herdada)
      continue;                                                       // se não for própria, ignora e passa para a próxima
    }

    if (idsIgnorados.indexOf(idCampo) !== -1) {                       // se este id está na lista de campos ignorados
      continue;                                                       // não conta como preenchimento e avança para o próximo
    }

    const valor = valores[idCampo];                                   // obtém o valor associado a este campo

    // Tratamento especial para o campo "status"
    if (idCampo === "status") {                           // se o campo atual for o select de status
      const statusVal = (valor || "").toString().trim();  // normaliza o valor do status como string sem espaços
      if (statusVal === "" || statusVal === "aberto") {   // se estiver vazio (caso raro) ou no valor padrão "aberto"
        // Não consideramos isso como preenchimento "real" para fins de rascunho
        console.log(
          "[RASCUNHO][DEBUG] Campo status em valor padrão (ou vazio):",
          JSON.stringify(statusVal)
        );                                                // registra no console que o status está em estado padrão
        continue;                                         // ignora o campo status e segue analisando os demais
      }
      // Se o status for diferente de "aberto", conta como preenchido
      console.log(
        "[RASCUNHO][DEBUG] Campo status preenchido com valor não padrão:",
        JSON.stringify(statusVal)
      );                                                  // registra no console que o status foi alterado do padrão
      encontrouAlgumPreenchido = true;                    // marca que o formulário não está vazio
      break;                                              // encerra o loop, pois já achamos algo relevante
    }

    if (typeof valor === "boolean") {                                 // se o valor for booleano (tipicamente checkbox)
      if (valor === true) {                                           // se o checkbox estiver marcado
        return false;                                                 // já consideramos que o formulário não está vazio
      }
      continue;                                                       // se for false, ignora e segue avaliando os demais campos
    }

    if (valor === null || valor === undefined) {                      // se for null ou undefined
      continue;                                                       // não conta como preenchimento
    }

    if (typeof valor === "string") {                                  // se o valor for uma string
      if (valor.trim() !== "") {                                      // verifica se, depois de remover espaços, sobrou algum conteúdo
        return false;                                                 // se houver texto, consideramos que o formulário não está vazio
      }
      continue;                                                       // se a string estiver vazia, ignora e passa para o próximo campo
    }

    if (typeof valor === "number") {                                  // se o valor for numérico
      if (!Number.isNaN(valor) && valor !== 0) {                      // se não for NaN e for diferente de zero
        return false;                                                 // consideramos que há um valor relevante preenchido
      }
      continue;                                                       // se for 0 ou NaN, tratamos como ausência de valor
    }

    if (valor) {                                                      // para outros tipos, qualquer valor "truthy" conta como preenchido
      return false;                                                   // assim que encontramos um valor truthy, encerramos indicando que não está vazio
    }
  }

  return true;                                                        // se percorremos todos os campos sem encontrar nada relevante, o formulário é considerado vazio
}

/**
 * Lê do localStorage a lista bruta de rascunhos salvos.
 * O retorno é sempre um array; em caso de erro, cai para [].
 */
function lerRascunhosDoStorage() {
  const valorBruto = window.localStorage.getItem(DRAFTS_STORAGE_KEY); // lê a string JSON armazenada sob a chave de rascunhos
  //window.localStorage.clear(); //limpar para debug
  if (!valorBruto) { // se não existir nada salvo ainda
    return []; // devolve lista vazia para simplificar o uso pelos chamadores
  }
  try {
    const lista = JSON.parse(valorBruto); // tenta converter a string JSON em objeto JavaScript
    if (Array.isArray(lista)) { // garante que o valor seja de fato um array
      return lista; // retorna a lista de rascunhos lida do storage
    }
    return []; // se o formato não for um array, devolve lista vazia para evitar erros de execução
  } catch (error) {
    console.error("Erro ao ler rascunhos do localStorage:", error); // registra o erro no console para debug
    return []; // em caso de falha no parse, devolve uma lista vazia e segue o fluxo
  }
}

/**
 * Salva no localStorage a lista completa de rascunhos.
 */
function gravarRascunhosNoStorage(listaRascunhos) {
  try {
    const texto = JSON.stringify(listaRascunhos); // converte o array de rascunhos em string JSON
    window.localStorage.setItem(DRAFTS_STORAGE_KEY, texto); // grava a string JSON no localStorage na chave configurada
  } catch (error) {
    console.error("Erro ao salvar rascunhos no localStorage:", error); // registra o erro se algo impedir a gravação (ex.: cota cheia)
  }
}

/**
 * Retorna apenas os rascunhos associados ao usuário atualmente logado.
 * Caso não haja usuário válido, retorna rascunhos sem user_id definido.
 */
function obterRascunhosDoUsuarioAtual() {
  const todos = lerRascunhosDoStorage(); // carrega todos os rascunhos existentes no storage
  if (!currentUser || typeof currentUser.id !== "number") { // se ainda não houver usuário logado com id numérico
    return todos.filter((r) => !r.user_id); // retorna apenas rascunhos que não possuem user_id associado
  }
  const idUsuario = currentUser.id; // guarda o id do usuário logado
  return todos.filter((r) => r.user_id === idUsuario); // devolve apenas os rascunhos cujo user_id bate com o usuário atual
}

/**
 * Cria ou atualiza um rascunho local no navegador.
 * - Se rascunhoParcial.id existir e estiver na lista, atualiza aquele rascunho.
 * - Caso contrário, cria um novo com id gerado automaticamente.
 *
 * Retorna sempre o rascunho completo (com id, timestamps e user_id).
 */
function salvarOuAtualizarRascunhoLocal(rascunhoParcial) {
  const todos = lerRascunhosDoStorage(); // busca todos os rascunhos já salvos
  const agora = new Date().toISOString(); // gera timestamp ISO para marcação de criação/atualização
  let idUsuario = null; // inicializa o id do usuário associado ao rascunho

  if (currentUser && typeof currentUser.id === "number") { // se tivermos um usuário logado com id definido
    idUsuario = currentUser.id; // usa o id retornado pelo backend como dono do rascunho
  }

  let rascunhoExistente = null; // variável para armazenar eventual rascunho já existente com o mesmo id
  if (rascunhoParcial && rascunhoParcial.id) { // se o objeto parcial possuir um campo id
    rascunhoExistente = todos.find((item) => item.id === rascunhoParcial.id); // procura na lista um rascunho com esse mesmo id
  }

  if (!rascunhoExistente) { // se nenhum rascunho foi encontrado (novo rascunho)
    const novoId =
      (rascunhoParcial && rascunhoParcial.id) || "draft-" + Date.now(); // gera um id simples baseado no horário atual, se não vier um explícito

    const novoRascunho = {
      id: novoId, // identificador único do rascunho
      user_id: idUsuario, // id do usuário dono do rascunho (pode ser null se ainda não houver login)
      criado_em: agora, // data/hora de criação no formato ISO
      atualizado_em: agora, // data/hora de última atualização no formato ISO
      ...rascunhoParcial, // espalha os demais campos específicos do rascunho (ex.: dados do formulário, rótulos)
    };

    todos.push(novoRascunho); // adiciona o novo rascunho à lista total
    gravarRascunhosNoStorage(todos); // persiste a lista atualizada no localStorage
    return novoRascunho; // devolve o rascunho completo (já com id e timestamps)
  }

  const rascunhosAtualizados = todos.map((item) => {
    // percorre todos os rascunhos existentes
    if (item.id !== rascunhoExistente.id) {
      // se o id não for o que queremos atualizar
      return item; // mantém o rascunho inalterado
    }
    return {
      ...item, // reaproveita todos os campos atuais do rascunho
      ...rascunhoParcial, // substitui/insere os campos vindos no objeto parcial
      user_id: idUsuario, // garante que o rascunho permaneça associado ao usuário atual
      atualizado_em: agora, // atualiza o timestamp de última modificação
    }; // retorna o rascunho já atualizado
  });

  gravarRascunhosNoStorage(rascunhosAtualizados); // grava a nova lista com o rascunho atualizado

  return rascunhosAtualizados.find(
    (item) => item.id === (rascunhoParcial && rascunhoParcial.id)
  ); // retorna o rascunho atualizado encontrado na lista
}

/**
 * Remove definitivamente um rascunho local a partir do seu id.
 */
function excluirRascunhoLocalPorId(idRascunho) {
  const todos = lerRascunhosDoStorage(); // lê a lista de todos os rascunhos do storage
  const filtrados = todos.filter((item) => item.id !== idRascunho); // filtra removendo o item cujo id foi informado
  gravarRascunhosNoStorage(filtrados); // persiste a nova lista sem o rascunho excluído
}

// ------------------------------
// Seletores de elementos de tela
// ------------------------------

// Seções principais (telas) do SPA.
const loginScreen = document.getElementById("login-screen"); // tela de login
const appScreen = document.getElementById("app-screen"); // tela principal da aplicação

// Formulário e campos de login.
const loginForm = document.getElementById("login-form"); // formulário de login
const loginUsernameInput = document.getElementById("login-username"); // input de usuário
const loginPasswordInput = document.getElementById("login-password"); // input de senha
const loginErrorEl = document.getElementById("login-error"); // parágrafo para mostrar erros de login
const loginSubmitButton =
  loginForm ? loginForm.querySelector("button[type='submit']") : null; // obtém o botão de envio do formulário de login (pode ser null se o formulário não existir)

// Elementos relacionados ao usuário logado no topo da aplicação.
const userNameEl = document.getElementById("user-name"); // span com o nome do usuário
const userRoleEl = document.getElementById("user-role"); // span com a função (admin/colaborador)
const logoutButton = document.getElementById("btn-logout"); // botão "Sair"

// Elementos da lista de avaliações.
const recarregarButton = document.getElementById("btn-recarregar"); // botão para recarregar lista
const avaliacoesTbody = document.getElementById("avaliacoes-tbody"); // corpo da tabela com as avaliações

// Elementos do formulário de avaliação.
// Elementos do formulário de avaliação.
const formAvaliacao = document.getElementById("form-avaliacao"); // formulário de nova avaliação
const rascunhoIdInput = document.getElementById("rascunho-id"); // input oculto que armazena o id do rascunho vinculado ao formulário
const clienteNomeInput = document.getElementById("cliente-nome"); // select com nome do cliente (lista fixa + opção "Outro")
const clienteNomeOutroInput = document.getElementById("cliente-nome-outro"); // input de texto para o caso "Outro"
const clienteOutroWrapper = document.getElementById("cliente-outro-wrapper"); // wrapper usado para mostrar/ocultar o campo "Outro"
const dataAvaliacaoInput = document.getElementById("data-avaliacao"); // input de data da avaliação
const localInput = document.getElementById("local"); // input de local
const objetoInput = document.getElementById("objeto"); // input de objeto
const statusSelect = document.getElementById("status"); // select de status
const equipeSelect = document.getElementById("equipe"); // select de equipe
const responsavelInput = document.getElementById("responsavel-avaliacao"); // input de responsável
const contatoInput = document.getElementById("contato-cliente"); // input de contato do cliente
const emailClienteInput = document.getElementById("email-cliente"); // input de e-mail do cliente
const escopoTextarea = document.getElementById("escopo-texto");     // textarea de escopo / observações
//tipo_formulario
const tipoFormularioInput = document.getElementById("tipo-formulario");         // input hidden que armazena o tipo atual de formulário selecionado
const tabButtons = document.querySelectorAll(".avaliacao-tab-btn");             // NodeList contendo todos os botões de aba de tipo de formulário
const blocosTipoRedes = document.querySelectorAll(".tipo-redes-only");          // blocos exclusivos do formulário UTP/Fibra (legado "Redes")
const blocosTipoCamera = document.querySelectorAll(".tipo-camera-only");          // blocos exclusivos do formulário de Câmeras (legado "Infraestrutura")
//tipo_formulario
// ===================== CAMPOS NOVOS =====================

// ===================== CAMPOS NOVOS =====================

// Flags gerais do serviço
const servicoForaMC = document.getElementById("servico-fora-montes-claros"); // checkbox serviço fora de Montes Claros
const servicoIntermediario = document.getElementById("servico-intermediario"); // checkbox serviço para intermediário

// Quantitativo 01 – Patch Panel / Cabeamento
// Quantitativo 01 – Patch Panel / Cabeamento
const q1Categoria = document.getElementById("q1-categoria-cab");              // select de categoria do cabeamento (CAT5e/CAT6/CAT6A)
const q1Blindado = document.getElementById("q1-blindado");                    // select Sim/Não: cabeamento blindado?
const q1NovoPatch = document.getElementById("q1-novo-patch-panel");           // select Sim/Não: necessita novo patch panel?
const q1IncluirGuia = document.getElementById("q1-incluir-guia");             // select Sim/Não: incluir guia de cabos?
const q1QtdGuiasCabos = document.getElementById("q1-qtd-guias-cabos");        // input numérico para quantidade de guias de cabos
const q1QtdGuiasCabosWrapper = document.getElementById("q1-qtd-guias-cabos-wrapper"); // wrapper da quantidade de guias de cabos (controla visibilidade)
const q1QtdPontosRede = document.getElementById("q1-qtd-pontos-rede");        // input numérico: quantidade de pontos de rede
const q1QtdCabos = document.getElementById("q1-qtd-cabos");                   // input numérico: quantidade de cabos
const q1QtdPortasPP = document.getElementById("q1-qtd-portas-patch-panel");   // input numérico: quantidade de portas no patch panel
const q1QtdPatchCords = document.getElementById("q1-qtd-patch-cords");        // input numérico: quantidade de patch cords

const q1ModeloPatchPanel = document.getElementById("q1-modelo-patch-panel");  // select: modelo do patch panel (CommScope/Furukawa/Systimax/Outro)
const q1ModeloPatchPanelOutroInput = document.getElementById(                 // input texto: descrição do modelo quando a opção "Outro" for usada
  "q1-modelo-patch-panel-outro"
);
const q1ModeloPatchPanelWrapper = document.getElementById("q1-modelo-patch-panel-wrapper"); // linha contendo os campos de modelo de patch panel
const q1ModeloPatchPanelOutroWrapper = document.getElementById(              // wrapper do campo "Outro" para modelo de patch panel
  "q1-modelo-patch-panel-outro-wrapper"
);
const q1MarcaCab = document.getElementById("q1-marca-cab");                   // select para marca do cabeamento UTP (CommScope/Furukawa/Outro)
const q1MarcaCabOutroInput = document.getElementById("q1-marca-cab-outro");   // input de texto para a marca quando for "Outro"
const q1MarcaCabOutroWrapper = document.getElementById("q1-marca-cab-outro-wrapper"); // wrapper do campo "Outro" de marca
const q1PatchCordsModelo = document.getElementById("q1-patch-cords-modelo");        // select: modelo dos patch cords (comprimentos padrão)
const q1PatchCordsCor = document.getElementById("q1-patch-cords-cor");              // select: cor dos patch cords (padrões de cor)
const q1PatchPanelExistenteNome = document.getElementById(                    // input de texto para identificar o patch panel existente
  "q1-patch-panel-existente-nome"
);

// Quantitativo 02 – Switch
const q2NovoSwitch = document.getElementById("q2-novo-switch");                 // select Sim/Não indicando se precisa de switch novo
const q2FornecedorSwitchWrapper = document.getElementById("q2-fornecedor-switch-wrapper"); // wrapper do campo "Fornecedor do switch"
const q2SwitchPoe = document.getElementById("q2-switch-poe");                   // select Sim/Não para PoE (LEGADO)
const q2RedeIndustrial = document.getElementById("q2-rede-industrial");         // select Sim/Não para rede industrial (LEGADO)
const q2QtdPontosRede = document.getElementById("q2-qtd-pontos-rede");          // input numérico: quantidade de pontos atendidos
const q2QtdPortasSwitch = document.getElementById("q2-qtd-portas-switch");      // input numérico: quantidade de portas do switch
const q2FornecedorSwitch = document.getElementById("q2-fornecedor-switch");      // select: fornecedor do switch ("nortetel" ou "cliente")
const q2ModeloSwitch = document.getElementById("q2-modelo-switch");             // input texto: modelo do switch
const q2SwitchExistenteNome = document.getElementById("q2-switch-existente-nome"); // input texto: identificação do switch existente
const q2SwitchFotoUrl = document.getElementById("q2-switch-foto-url");          // input texto: URL da foto do switch
const q2SwitchFotosTabela = document.getElementById("q2-switch-fotos-tabela");      // tabela dinâmica de URLs de fotos do switch (Q2)
const q2SwitchFotosTbody = document.getElementById("q2-switch-fotos-tbody");        // corpo da tabela onde as linhas de fotos serão gerenciadas
const q2SwitchAdicionarFotoButton = document.getElementById("btn-q2-switch-adicionar-foto"); // botão "Adicionar foto +" da seção de switch
const q2SwitchFotoFileInput = document.getElementById("q2-switch-foto-file-input"); // input de arquivo escondido usado para abrir câmera/galeria ao adicionar fotos do switch (Q2)
const q2ObsSwitch = document.getElementById("q2-observacoes");                  // textarea: observações sobre switches

// Quantitativo 03 – Cabeamento Óptico
const q3TipoFibra = document.getElementById("q3-tipo-fibra");                   // select: tipo de fibra (SM/OMx)
const q3QtdFibrasPorCabo = document.getElementById("q3-qtd-fibras-por-cabo");  // select: número de fibras por cabo
const q3TipoConector = document.getElementById("q3-tipo-conector");            // select: tipo de conector (LC/SC/ST/MTRJ)
const q3NovoDio = document.getElementById("q3-novo-dio");                       // select: pergunta se é necessário novo DIO
const q3ModeloDio = document.getElementById("q3-modelo-dio");                   // input texto: modelo do DIO
const q3ModeloDioWrapper = document.getElementById("q3-modelo-dio-wrapper");    // wrapper do campo de modelo do DIO
const q3CaixaTerminacao = document.getElementById("q3-caixa-terminacao");      // select Sim/Não: caixa de terminação?
const q3TipoCaboOptico = document.getElementById("q3-tipo-cabo-optico");       // select: tipo de cabo óptico (indoor/outdoor etc.)
const q3CaixaEmenda = document.getElementById("q3-caixa-emenda");              // select Sim/Não: caixa de emenda?
const q3QtdCabos = document.getElementById("q3-qtd-cabos");                    // input numérico: quantidade de cabos ópticos
const q3TamanhoTotal = document.getElementById("q3-tamanho-total-m");          // input numérico: metragem total em metros
const q3QtdFibras = document.getElementById("q3-qtd-fibras");                  // input numérico: quantidade total de fibras
const q3QtdPortasDio = document.getElementById("q3-qtd-portas-dio");           // input numérico: quantidade de portas do DIO
const q3QtdCordoesOpticos = document.getElementById("q3-qtd-cordoes-opticos"); // input numérico: quantidade de cordões ópticos
const q3MarcaCabOptico = document.getElementById("q3-marca-cab-optico");           // select: marca do cabo óptico (Furukawa/CommScope/Outro)
const q3MarcaCabOpticoOutroInput = document.getElementById("q3-marca-cab-optico-outro"); // input texto para marca "Outro"
const q3MarcaCabOpticoOutroWrapper = document.getElementById("q3-marca-cab-optico-outro-wrapper"); // wrapper do campo "Outro" de marca óptica
const q3ModeloCordaoOptico = document.getElementById("q3-modelo-cordao-optico"); // input texto: modelo do cordão óptico
const q3Obs = document.getElementById("q3-observacoes");                       // textarea: observações sobre fibra óptica

// Quantitativo 04 – Equipamentos
const q4Camera = document.getElementById("q4-camera");                     // select Sim/Não indicando se há câmeras no projeto
const q4NvrDvr = document.getElementById("q4-nvr-dvr");                   // select Sim/Não indicando se há NVR/DVR
const q4AccessPoint = document.getElementById("q4-access-point");         // select Sim/Não para Access Point (LEGADO)
const q4Conversor = document.getElementById("q4-conversor-midia");        // select Sim/Não para conversor de mídia
const q4Gbic = document.getElementById("q4-gbic");                        // select Sim/Não para GBIC
const q4Switch = document.getElementById("q4-switch");                    // select Sim/Não para switch (LEGADO)
const q4CameraNova = document.getElementById("q4-camera-nova");           // select Sim/Não: indica se a câmera é nova/realocação
const q4CameraNovaWrapper = document.getElementById("q4-camera-nova-wrapper");
const q4CameraFornecedor = document.getElementById("q4-camera-fornecedor"); // select: fornecedor da câmera (nortetel/cliente)
const q4CameraModelo = document.getElementById("q4-camera-modelo");       // input texto: modelo da câmera
const q4CameraModeloWrapper = document.getElementById("q4-camera-modelo-wrapper");
const q4CameraQtd = document.getElementById("q4-camera-qtd");             // input numérico: quantidade de câmeras
const q4CameraQtdWrapper = document.getElementById("q4-camera-qtd-wrapper");
const q4NvrDvrModelo = document.getElementById("q4-nvr-dvr-modelo");      // input texto: modelo do NVR/DVR
const q4NvrDvrModeloWrapper = document.getElementById("q4-nvr-dvr-modelo-wrapper");
const q4ConversorMidiaModelo = document.getElementById(                   // input texto: modelo do conversor de mídia
  "q4-conversor-midia-modelo"
);
const q4GbicModelo = document.getElementById("q4-gbic-modelo");           // input texto: modelo do GBIC

// Quantitativo 05 – Infraestrutura
const q5NovaEletrocalha = document.getElementById("q5-nova-eletrocalha");           // select Sim/Não: nova eletrocalha?
const q5NovoEletroduto = document.getElementById("q5-novo-eletroduto");             // select Sim/Não: novo eletroduto?
const q5NovoRack = document.getElementById("q5-novo-rack");                         // select Sim/Não: novo rack?
const q5InstalacaoEletrica = document.getElementById("q5-instalacao-eletrica");     // select Sim/Não: instalação elétrica?
const q5Nobreak = document.getElementById("q5-nobreak");                            // select Sim/Não: nobreak?
const q5Serralheria = document.getElementById("q5-serralheria");                    // select Sim/Não: serralheria?

const q5EletrocalhaModelo = document.getElementById("q5-eletrocalha-modelo");       // input texto: modelo da eletrocalha
const q5EletrocalhaQtd = document.getElementById("q5-eletrocalha-qtd");             // input numérico: quantidade de eletrocalhas
const q5EletrodutoModelo = document.getElementById("q5-eletroduto-modelo");         // input texto: modelo do eletroduto
const q5EletrodutoQtd = document.getElementById("q5-eletroduto-qtd");               // input numérico: quantidade de eletrodutos
const q5RackModelo = document.getElementById("q5-rack-modelo");                     // input texto: modelo do rack
const q5RackQtd = document.getElementById("q5-rack-qtd");                           // input numérico: quantidade de racks
const q5NobreakModelo = document.getElementById("q5-nobreak-modelo");               // input texto: modelo do nobreak
const q5NobreakQtd = document.getElementById("q5-nobreak-qtd");                     // input numérico: quantidade de nobreaks
const q5SerralheriaDescricao = document.getElementById("q5-serralheria-descricao"); // textarea: descrição da serralheria
const q5InstalacaoEletricaObs = document.getElementById("q5-instalacao-eletrica-obs"); // textarea: observações da instalação elétrica

// ----------------------------- // bloco de constantes específico da lista de materiais de infraestrutura
// Lista de materiais – Infraestrutura
// ----------------------------- // comentário visual separando a seção de lista de materiais das demais constantes

const infraListaMateriaisTabela = document.getElementById("infra-lista-materiais-tabela"); // obtém a referência para a tabela da lista de materiais de infraestrutura
const infraListaMateriaisTbody = document.getElementById("infra-lista-materiais-tbody");   // obtém o corpo da tabela onde as linhas de materiais serão inseridas/removidas
const infraAdicionarLinhaButton = document.getElementById("btn-infra-adicionar-linha");    // obtém o botão responsável por adicionar uma nova linha na lista de materiais

// Imagens
const imgRef1 = document.getElementById("localizacao-imagem1-url");
const imgRef2 = document.getElementById("localizacao-imagem2-url");

// Pré-requisitos
const preTrabalhoAltura = document.getElementById("pre-trabalho-altura");
const prePlataforma = document.getElementById("pre-plataforma");
const prePlataformaModelo = document.getElementById("pre-plataforma-modelo");
const prePlataformaDias = document.getElementById("pre-plataforma-dias");
const preForaHorario = document.getElementById("pre-fora-horario-comercial");
const preVeiculoNortetel = document.getElementById("pre-veiculo-nortetel");
const preContainer = document.getElementById("pre-container-materiais");

// Horas trabalhadas - Tabela 4 (dias normais)
const encarregadoDiasInput = document.getElementById("encarregado-dias");                 // input com a quantidade de dias do encarregado
const instaladorDiasInput = document.getElementById("instalador-dias");                   // input com a quantidade de dias do instalador
const auxiliarDiasInput = document.getElementById("auxiliar-dias");                       // input com a quantidade de dias do auxiliar
const tecnicoInstalacaoDiasInput = document.getElementById("tecnico-de-instalacao-dias"); // input com dias do técnico de instalação
const tecnicoSegurancaDiasInput = document.getElementById("tecnico-em-seguranca-dias");   // input com dias do técnico em segurança eletrônica

// Horas extras por função
const encarregadoHoraExtraInput = document.getElementById("encarregado-hora-extra");                 // input com horas extras do encarregado
const instaladorHoraExtraInput = document.getElementById("instalador-hora-extra");                   // input com horas extras do instalador
const auxiliarHoraExtraInput = document.getElementById("auxiliar-hora-extra");                       // input com horas extras do auxiliar
const tecnicoInstalacaoHoraExtraInput = document.getElementById("tecnico-de-instalacao-hora-extra"); // input com horas extras do técnico de instalação
const tecnicoSegurancaHoraExtraInput = document.getElementById("tecnico-em-seguranca-hora-extra");   // input com horas extras do técnico em segurança

// Trabalho em domingos/feriados por função
const encarregadoDomingoInput = document.getElementById("encarregado-trabalho-domingo");                 // domingos/feriados trabalhados pelo encarregado
const instaladorDomingoInput = document.getElementById("instalador-trabalho-domingo");                   // domingos/feriados trabalhados pelo instalador
const auxiliarDomingoInput = document.getElementById("auxiliar-trabalho-domingo");                       // domingos/feriados trabalhados pelo auxiliar
const tecnicoInstalacaoDomingoInput = document.getElementById("tecnico-de-instalacao-trabalho-domingo"); // domingos/feriados do técnico de instalação
const tecnicoSegurancaDomingoInput = document.getElementById("tecnico-em-seguranca-trabalho-domingo");   // domingos/feriados do técnico em segurança

// Prazos (cronograma e entregas)
const cronogramaExecucaoSelect = document.getElementById("cronograma-execucao");           // select de Sim/Não para cronograma de execução
const diasInstalacaoInput = document.getElementById("dias-instalacao");                    // input de dias previstos de instalação
const asBuiltSelect = document.getElementById("as-built");                                 // select de Sim/Não para As Built
const diasEntregaRelatorioInput = document.getElementById("dias-entrega-relatorio");       // input de dias para entrega do relatório
const artSelect = document.getElementById("art");                                          // select de Sim/Não para ART

// Alimentação / refeições
const almocoQtdInput = document.getElementById("almoco-qtd");   // input com quantidade estimada de almoços
const lancheQtdInput = document.getElementById("lanche-qtd");   // input com quantidade estimada de lanches

const avaliacaoFeedbackEl = document.getElementById("avaliacao-feedback"); // parágrafo para mensagens de feedback
const salvarAvaliacaoButton = document.getElementById("btn-salvar-avaliacao"); // referência ao botão "Salvar Avaliação"
const salvarRascunhoButton = document.getElementById("btn-salvar-rascunho"); // referência ao botão "Salvar rascunho" (salvamento local)
// Botão para limpar o formulário e voltar explicitamente ao modo "Nova Avaliação".
const novaAvaliacaoButton = document.getElementById("btn-nova-avaliacao"); // referência ao botão "Nova avaliação"

const rascunhosTbody = document.getElementById("rascunhos-tbody"); // corpo da tabela que exibirá os rascunhos locais
const recarregarRascunhosButton = document.getElementById("btn-recarregar-rascunhos"); // botão que força o recarregamento da lista de rascunhos
const limparRascunhosButton = document.getElementById("btn-limpar-rascunhos");

// Elementos do título e do subtítulo do formulário de avaliação, usados para indicar "Nova" ou "Editar".
const formTituloEl = document.getElementById("form-avaliacao-titulo"); // h2 acima do formulário de avaliação
const formSubtituloEl = document.getElementById("form-avaliacao-subtitulo"); // texto pequeno logo abaixo do título


// ======================= Gestão de usuários (apenas admins) =======================

// Card inteiro de gestão de usuários, mostrado apenas se o usuário logado for admin.
const userManagementCard = document.getElementById("user-management-card"); // seção com formulário + tabela

// Formulário para criar novos usuários.
const userForm = document.getElementById("form-usuario");                   // formulário de criação de usuário

// Campos do formulário de usuário.
const userNomeInput = document.getElementById("usuario-nome");              // input de nome completo
const userEmailInput = document.getElementById("usuario-email");            // input de e-mail
const userUsernameInput = document.getElementById("usuario-username");      // input de login
const userSenhaInput = document.getElementById("usuario-senha");            // input de senha inicial
const userIsAdminInput = document.getElementById("usuario-is-admin");       // checkbox para marcar como administrador

// Área de feedback e tabela de usuários.
const userFeedbackEl = document.getElementById("usuario-feedback");         // parágrafo para mensagens de erro/sucesso
const usuariosTbody = document.getElementById("usuarios-tbody");            // corpo da tabela de usuários

// Elementos do modal de troca de senha.                                        // comentário: agrupa todas as referências do modal
const passwordModal = document.getElementById("password-modal-overlay");        // pega o overlay do modal (div com fundo escuro e o conteúdo dentro)
const passwordForm = document.getElementById("password-change-form");           // pega o formulário interno do modal de senha
const senhaAtualInput = document.getElementById("senha_atual");                 // pega o input de senha atual (id com underline, igual ao HTML)
const novaSenhaInput = document.getElementById("nova_senha");                   // pega o input de nova senha (id com underline)
const passwordErrorEl = document.getElementById("password-modal-error");        // pega o parágrafo de erro do modal (para mensagens de validação)

// Elementos do modal de gestão de usuários.
const openUsersButton = document.getElementById("btn-open-users");      // botão na topbar que abre o modal de gestão de usuários
const usersModalOverlay = document.getElementById("users-modal-overlay"); // overlay escuro do modal de usuários
const usersTbody = document.getElementById("usuarios-tbody");           // corpo da tabela que exibirá a lista de usuários
const usersFeedbackEl = document.getElementById("usuarios-feedback");   // parágrafo usado para mensagens de erro/sucesso no modal
const closeUsersButton = document.getElementById("btn-fechar-usuarios");// botão que fecha o modal de usuários

const btnAuditoria = document.getElementById("btnAuditoria"); // pega o botão da aba Auditoria

const equipeInput = document.getElementById("equipe-responsavel");       // input da equipe responsável
const escopoTextoInput = document.getElementById("escopo-texto");        // textarea do escopo da avaliação

if (btnAuditoria) { // se o botão existir
  btnAuditoria.addEventListener("click", () => { // adiciona listener para o clique
    // aqui você chama a função que mostra a section correta
    // exemplo genérico, adapte para seu código real:
    // mostrarSecao("sec-auditoria");

    if(document.getElementById("sec-auditoria").style.display === "block"){
        document.getElementById("sec-auditoria").style.display = "none";
    }
    else{
        document.getElementById("sec-auditoria").style.display = "block";
    }
    // esconda as outras sections conforme sua lógica atual (não escrevi aqui para não quebrar seu fluxo)
    inicializarTelaAuditoria(); // inicializa os controles e carrega as listas da tela de auditoria
  });
}

/**
 * Mostra ou esconde o card de gestão de usuários
 * dependendo se o usuário atual é administrador.
 */
function atualizarVisibilidadeGestaoUsuarios() {
  if (!userManagementCard) {                                   // se o HTML não tiver o card, não há nada a fazer
    return;                                                    // sai silenciosamente
  }

  if (currentUser && currentUser.is_admin) {                   // se existe usuário logado e ele é admin
    userManagementCard.classList.remove("hidden");             // remove a classe hidden para exibir o card
    carregarUsuarios();                                        // carrega a lista de usuários sempre que o admin entrar
  } else {
    userManagementCard.classList.add("hidden");                // garante que o card fique escondido para não-admins
  }
}

/**
 * Busca no backend a lista de usuários cadastrados
 * (GET /usuarios) e preenche a tabela da tela de administração.
 */
async function carregarUsuarios() {
  if (!usuariosTbody) {                                        // se por algum motivo não houver tbody no DOM
    return;                                                    // não tenta fazer nada
  }

  // Mensagem de carregamento enquanto a requisição é feita
  usuariosTbody.innerHTML =
    '<tr><td colspan="5" class="table-empty">Carregando usuários...</td></tr>';

  try {
    const lista = await apiGet("/usuarios");                   // chama o backend para buscar todos os usuários

    if (!lista || lista.length === 0) {                        // se a lista estiver vazia
      usuariosTbody.innerHTML =
        '<tr><td colspan="5" class="table-empty">Nenhum usuário encontrado.</td></tr>';
      return;                                                  // encerra a função aqui
    }

    const linhas = lista
      .map((user) => {                                         // mapeia cada usuário para uma linha HTML
        const perfil = user.is_admin ? "Administrador" : "Colaborador"; // texto amigável para o perfil
        const precisaTrocar = user.precisa_trocar_senha ? "Sim" : "Não"; // se ainda precisa trocar a senha

        return `
          <tr>
            <td>${user.id}</td>
            <td>${user.nome}</td>
            <td>${user.username}</td>
            <td>${user.email}</td>
            <td>${perfil} · Trocar senha: ${precisaTrocar}</td>
          </tr>
        `;
      })
      .join("");                                               // junta todas as linhas em uma única string

    usuariosTbody.innerHTML = linhas;                          // injeta as linhas geradas na tabela
  } catch (err) {
    console.error(err);                                        // registra o erro no console para debug
    usuariosTbody.innerHTML =
      '<tr><td colspan="5" class="table-empty">Erro ao carregar usuários.</td></tr>'; // mensagem de erro visível
  }
}

/**
 * Lê os dados do formulário de gestão de usuários
 * e envia para o backend criar um novo usuário (POST /usuarios).
 */
async function salvarUsuario(event) {
  event.preventDefault();                                      // evita reload da página ao enviar o formulário

  if (!userFeedbackEl) {                                       // se não houver elemento de feedback
    return;                                                    // não faz nada
  }

  userFeedbackEl.textContent = "";                             // limpa mensagem anterior
  userFeedbackEl.className = "form-feedback";                  // reseta classes de erro/sucesso

  const nome = userNomeInput.value.trim();                     // lê e remove espaços extras do nome
  const email = userEmailInput.value.trim();                   // lê e-mail
  const username = userUsernameInput.value.trim();             // lê login
  const senha = userSenhaInput.value.trim();                   // lê senha inicial
  const isAdmin = userIsAdminInput.checked;                    // verifica se o checkbox está marcado

  // Validação simples de campos obrigatórios
  if (!nome || !email || !username || !senha) {                // se algum campo obrigatório estiver vazio
    userFeedbackEl.textContent =
      "Preencha todos os campos obrigatórios para criar o usuário."; // mensagem de validação
    userFeedbackEl.classList.add("form-error");                // aplica estilo de erro
    return;                                                    // interrompe o fluxo sem chamar a API
  }

  const payload = {
    nome,                                                      // nome completo
    email,                                                     // e-mail
    username,                                                  // login
    senha,                                                     // senha inicial
    is_admin: isAdmin,                                         // se o usuário será administrador
  };

  try {
    await apiPostJson("/usuarios", payload);                   // chama o backend para criar o novo usuário

    userFeedbackEl.textContent = "Usuário criado com sucesso."; // mensagem de sucesso
    userFeedbackEl.classList.add("form-success");              // aplica estilo de sucesso

    if (userForm) {                                            // se o formulário existir
      userForm.reset();                                        // limpa os campos do formulário
    }

    await carregarUsuarios();                                  // recarrega a lista de usuários para incluir o novo
  } catch (err) {
    console.error(err);                                        // registra o erro no console
    userFeedbackEl.textContent =
      "Erro ao criar usuário. Verifique os dados informados ou se já existe outro com o mesmo login/e-mail."; // mensagem amigável
    userFeedbackEl.classList.add("form-error");                // aplica estilo de erro
  }
}

// ----------------------------------------------------------------------
// Funções utilitárias gerais
// ----------------------------------------------------------------------

/**
 * Exibe a tela de login e esconde a tela principal.
 * Chamado quando o usuário ainda não está autenticado ou fez logout.
 */
function mostrarTelaLogin() {
  // Mostra a seção de login
  loginScreen.classList.remove("hidden");
  // Esconde a seção principal do app
  appScreen.classList.add("hidden");
}

/**
 * Exibe a tela principal da aplicação (listagem + formulário de avaliação)
 * e esconde a tela de login.
 */
function mostrarTelaApp() {
  // Antes de exibir a tela principal, conferimos se há um usuário autenticado
  if (!authToken || !currentUser) {
    // Se não houver token ou objeto de usuário, tratamos como problema de autenticação
    handleAuthError(); // limpa qualquer resquício de sessão e volta para a tela de login com mensagem apropriada
    return; // interrompe a tentativa de mostrar a tela principal
  }

  // Esconde a tela de login (já que temos um usuário válido)
  loginScreen.classList.add("hidden"); // garante que a seção de login não fique visível

  // Mostra a tela principal da aplicação com lista de avaliações e formulário
  appScreen.classList.remove("hidden"); // remove a classe que escondia a tela principal
}

/**
 * Salva o token JWT em memória e no localStorage para persistir entre recarregamentos.
 * @param {string} token - Token JWT recebido do backend.
 */
function setAuthToken(token) {
  authToken = token; // guarda em variável global
  if (token) {
    // se existir token, salva no localStorage
    localStorage.setItem("nt_avaliacoes_token", token);
  } else {
    // se token nulo/undefined, remove do localStorage
    localStorage.removeItem("nt_avaliacoes_token");
  }
}

/**
 * Recupera o token armazenado no localStorage (se existir).
 * @returns {string|null} - Token JWT ou null se não houver.
 */
function getStoredToken() {
  return localStorage.getItem("nt_avaliacoes_token"); // lê do armazenamento do navegador
}

/**
 * Função auxiliar para tratar erros de autenticação.
 * Se encontrarmos um 401/403, limpamos o token e voltamos para a tela de login.
 */
function handleAuthError() {
  // Limpa informações de autenticação
  setAuthToken(null);
  currentUser = null;
  // Opcional: mensagem de erro no login
  loginErrorEl.textContent =
    "Sua sessão expirou. Entre novamente para continuar.";
  // Mostra a tela de login
  window.alert("Sua sessão expirou. Entre novamente para continuar.");
  mostrarTelaLogin();
}

/**
 * Função genérica para chamadas GET autenticadas na API.
 * @param {string} path - Caminho relativo (ex.: "/avaliacoes").
 * @returns {Promise<any>} - JSON retornado pela API.
 */
async function apiGet(path) {
  try {
    // Monta URL usando a base configurada
    const url = API_BASE_URL + path;

    // Faz a requisição GET
    const response = await fetch(url, {
      method: "GET",
      headers: {
        // Cabeçalho indicando que aceitamos JSON
        Accept: "application/json",
        // Cabeçalho de autorização com o token JWT, se existir
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
    });

    // Se a resposta indicar não autorizado, delegamos para handleAuthError
    if (response.status === 401 || response.status === 403) {
      handleAuthError();
      throw new Error("Não autorizado");
    }

    // Se vier outro erro HTTP, lançamos uma exceção genérica
    if (!response.ok) {
      throw new Error("Erro na requisição GET: " + response.status);
    }

    // Retorna o JSON parseado
    return await response.json();
  } catch (err) {
    // Apenas propagamos o erro para quem chamou
    console.error(err);
    throw err;
  }
}

/**
 * Função genérica para chamadas POST com corpo JSON e autenticação.
 * @param {string} path - Caminho relativo (ex.: "/avaliacoes").
 * @param {object} data - Objeto a ser enviado como JSON no corpo.
 * @returns {Promise<any>} - JSON retornado pela API.
 */
async function apiPostJson(path, data) {
  try {
    // Monta URL final
    const url = API_BASE_URL + path;

    // Executa a requisição POST
    const response = await fetch(url, {
      method: "POST",
      headers: {
        // Diz que estamos enviando JSON
        "Content-Type": "application/json",
        // Diz que esperamos receber JSON
        Accept: "application/json",
        // Inclui token de autorização, se existir
        Authorization: authToken ? `Bearer ${authToken}` : "",
      },
      // Converte o objeto `data` em JSON
      body: JSON.stringify(data),
    });

    // Se o backend indicar problema de autenticação, tratamos
    if (response.status === 401 || response.status === 403) {
      handleAuthError();
      throw new Error("Não autorizado");
    }

    // Se qualquer outro erro HTTP acontecer, lança erro
    if (!response.ok) {
      const text = await response.text(); // tenta ler texto de erro
      throw new Error("Erro na requisição POST: " + text);
    }

    // Retorna o corpo JSON da resposta
    return await response.json();
  } catch (err) {
    // Log simples no console para debug
    console.error(err);
    throw err;
  }
}

/**
 * Função genérica para chamadas POST sem corpo JSON, apenas autenticadas.
 * Útil para endpoints que não esperam body (ex.: resetar senha).
 * @param {string} path - Caminho relativo (ex.: "/usuarios/1/resetar-senha").
 * @returns {Promise<any>} - JSON retornado pela API.
 */
async function apiPost(path) {
  try {
    const url = API_BASE_URL + path;                              // monta a URL final juntando base e caminho

    const response = await fetch(url, {                           // faz a requisição HTTP
      method: "POST",                                             // método POST
      headers: {
        Accept: "application/json",                               // indica que esperamos JSON de resposta
        Authorization: authToken ? `Bearer ${authToken}` : "",    // envia o token JWT se existir
      },
    });

    if (response.status === 401 || response.status === 403) {     // se o backend indicar problema de autenticação/autorização
      handleAuthError();                                          // trata o erro de autenticação (limpa token e volta para login)
      throw new Error("Não autorizado");                          // lança erro para quem chamou
    }

    if (!response.ok) {                                           // se veio qualquer outro erro HTTP
      const text = await response.text();                         // tenta ler o corpo como texto para ajudar no debug
      throw new Error("Erro na requisição POST: " + text);        // lança erro com a mensagem completa
    }

    return await response.json();                                 // retorna o JSON parseado
  } catch (err) {
    console.error(err);                                           // registra o erro no console
    throw err;                                                    // propaga o erro para quem chamou
  }
}

/**
 * Função genérica para chamadas POST usando FormData (multipart/form-data).
 * Útil para upload de arquivos (imagens, documentos, etc.) com autenticação.
 * @param {string} path - Caminho relativo (ex.: "/avaliacoes/1/fotos/upload").
 * @param {FormData} formData - Instância de FormData com os campos do formulário, incluindo arquivos.
 * @returns {Promise<any>} - JSON retornado pela API.
 */
async function apiPostFormData(path, formData) {
  try {
    const url = API_BASE_URL + path;                            // monta a URL final juntando a base da API com o caminho

    const response = await fetch(url, {
      method: "POST",                                            // método HTTP POST para criação/envio de recursos
      headers: {
        // NÃO definimos "Content-Type" manualmente aqui        // o navegador se encarrega de definir o boundary correto do multipart
        Accept: "application/json",                             // indicamos que esperamos JSON como resposta
        Authorization: authToken ? `Bearer ${authToken}` : "",  // envia o token JWT no cabeçalho, se estiver definido
      },
      body: formData,                                            // corpo da requisição é o próprio FormData com campos e arquivos
    });

    if (response.status === 401 || response.status === 403) {   // se o backend indicar problema de autenticação/autorização
      handleAuthError();                                        // tratamos a expiração de sessão (limpa token, volta para login)
      throw new Error("Não autorizado");                        // interrompe o fluxo com um erro
    }

    if (!response.ok) {                                         // se qualquer outro erro HTTP ocorrer
      const text = await response.text().catch(() => "");       // tentamos ler o corpo como texto para ajudar no debug
      throw new Error(
        "Erro na requisição POST (multipart): " + text          // montamos uma mensagem detalhada informando o erro
      );
    }

    return await response.json();                               // se deu tudo certo, retornamos o JSON parseado da resposta
  } catch (err) {
    console.error(err);                                         // registra o erro no console do navegador
    throw err;                                                  // propaga o erro para quem chamou
  }
}

/**
 * Função genérica para chamadas PATCH com corpo JSON e autenticação.
 * Útil para atualizações parciais (ex.: ativar/desativar usuário).
 * @param {string} path - Caminho relativo (ex.: "/usuarios/1/status").
 * @param {object} data - Objeto a ser enviado como JSON no corpo.
 * @returns {Promise<any>} - JSON retornado pela API.
 */
async function apiPatchJson(path, data) {
  try {
    const url = API_BASE_URL + path;                              // monta a URL final juntando base e caminho

    const response = await fetch(url, {                           // faz a requisição HTTP
      method: "PATCH",                                            // usa o método PATCH
      headers: {
        "Content-Type": "application/json",                       // informa que o corpo está em JSON
        Accept: "application/json",                               // indica que esperamos JSON de resposta
        Authorization: authToken ? `Bearer ${authToken}` : "",    // envia o token JWT se existir
      },
      body: JSON.stringify(data),                                 // serializa o objeto data para JSON
    });

    if (response.status === 401 || response.status === 403) {     // trata casos de não autorizado
      handleAuthError();                                          // limpa sessão e volta para login
      throw new Error("Não autorizado");                          // informa o erro para o chamador
    }

    if (!response.ok) {                                           // se veio outro erro HTTP
      const text = await response.text();                         // lê o texto de erro retornado pelo backend
      throw new Error("Erro na requisição PATCH: " + text);       // lança erro com mensagem detalhada
    }

    return await response.json();                                 // retorna o JSON da resposta
  } catch (err) {
    console.error(err);                                           // loga o erro no console
    throw err;                                                    // repassa o erro para quem chamou
  }
}

/**
 * Função genérica para chamadas PUT com corpo JSON e autenticação.
 * É igual à apiPostJson, mudando apenas o método HTTP para "PUT".
 * @param {string} path - Caminho relativo (ex.: "/avaliacoes/1").
 * @param {object} data - Objeto enviado como JSON no corpo.
 * @returns {Promise<any>} - JSON retornado pela API.
 */
async function apiPutJson(path, data) {
  try {
    const url = API_BASE_URL + path; // monta a URL final juntando base + caminho

    const response = await fetch(url, {
      method: "PUT", // método HTTP específico para atualização
      headers: {
        "Content-Type": "application/json", // enviamos JSON no corpo
        Accept: "application/json", // esperamos JSON na resposta
        Authorization: authToken ? `Bearer ${authToken}` : "", // envia o token JWT se existir
      },
      body: JSON.stringify(data), // converte o objeto JS em string JSON
    });

    if (response.status === 401 || response.status === 403) {
      // se o backend indicar problema de autenticação
      handleAuthError(); // força o usuário a logar de novo
      throw new Error("Não autorizado"); // interrompe o fluxo com erro
    }

    if (!response.ok) {
      // se veio outro erro HTTP qualquer
      const text = await response.text().catch(() => ""); // tenta ler o corpo como texto
      throw new Error("Erro na requisição PUT: " + text); // lança erro com detalhe bruto
    }

    return await response.json(); // devolve o JSON parseado para quem chamou
  } catch (err) {
    console.error(err); // registra o erro no console para debug
    throw err; // repassa o erro adiante
  }
}

async function apiDelete(path) {
  try {
    const url = API_BASE_URL + path; // monta a URL final juntando a base da API com o caminho recebido

    const response = await fetch(url, {
      method: "DELETE", // método HTTP específico para remoção de recursos
      headers: {
        Accept: "application/json", // indica que esperamos receber JSON na resposta
        Authorization: authToken ? `Bearer ${authToken}` : "", // envia o token JWT, se existir, para autenticação
      },
    });

    if (response.status === 401 || response.status === 403) {
      // se o backend indicar problema de autenticação/autorização
      handleAuthError(); // delega o tratamento de autenticação (logout, redirecionamento, etc.)
      throw new Error("Não autorizado"); // interrompe o fluxo com um erro específico
    }

    if (!response.ok) {
      // se qualquer outro erro HTTP acontecer
      const text = await response.text().catch(() => ""); // tenta ler o corpo como texto para detalhar o erro
      throw new Error("Erro na requisição DELETE: " + text); // lança erro com a mensagem detalhada
    }

    try {
      const data = await response.json(); // tenta interpretar a resposta como JSON
      return data; // retorna o JSON parseado se houver corpo de resposta
    } catch (_err) {
      return null; // se não houver corpo JSON, apenas retorna null (caso comum em DELETE)
    }
  } catch (err) {
    console.error(err); // registra o erro no console para auxiliar em debug
    throw err; // propaga o erro para quem chamou a função
  }
}

/**
 * Sincroniza a lista de materiais de infraestrutura de uma avaliação com o backend.
 * Estratégia: apagar todos os registros atuais da avaliação e recriar a partir da lista enviada.
 */
async function salvarListaMateriaisInfraNoBackend(
  avaliacaoId,
  listaMateriaisInfra
) {
  if (!avaliacaoId) {
    // se não houver id de avaliação, não há como associar materiais
    return; // encerra a função silenciosamente
  }

  const listaNormalizada = Array.isArray(listaMateriaisInfra)
    ? listaMateriaisInfra
    : []; // garante que sempre trabalharemos com um array (mesmo que venha indefinido)

  try {
    const existentes = await apiGet(
      `/avaliacoes/${avaliacaoId}/equipamentos`
    ); // busca no backend todos os materiais já vinculados a esta avaliação

    if (Array.isArray(existentes)) {
      // se a resposta do backend for uma lista válida
      for (const itemExistente of existentes) {
        // percorre cada material já cadastrado
        if (
          itemExistente &&
          typeof itemExistente.id === "number"
        ) {
          // garante que o registro possua um id numérico válido
          await apiDelete(
            `/equipamentos/${itemExistente.id}`
          ); // chama a API para excluir o registro de material pelo id
        }
      }
    }

    for (const item of listaNormalizada) {
      // percorre cada item da lista que queremos persistir
      const equipamento =
        item && item.equipamento
          ? item.equipamento.toString().trim()
          : ""; // normaliza o texto de equipamento/material

      const modelo =
        item && item.modelo
          ? item.modelo.toString().trim()
          : ""; // normaliza o texto de modelo, se existir

      let quantidadeInt = null; // inicializa variável numérica de quantidade
      if (
        item &&
        item.quantidade !== undefined &&
        item.quantidade !== null
      ) {
        // verifica se há algum valor de quantidade no item
        const parsed = parseInt(item.quantidade, 10); // tenta converter o valor da quantidade em inteiro
        if (!Number.isNaN(parsed) && parsed > 0) {
          // se a conversão for bem-sucedida e maior que zero
          quantidadeInt = parsed; // guarda o valor convertido
        }
      }

      const fabricante =
        item && item.fabricante
          ? item.fabricante.toString().trim()
          : ""; // normaliza o texto de fabricante, se existir

      if (!equipamento || quantidadeInt === null) {
        // se o item estiver sem equipamento ou sem quantidade válida
        continue; // ignora este item silenciosamente (supõe-se que já validamos antes no front)
      }

      const payloadEquipamento = {
        equipamento: equipamento, // nome do equipamento/material
        modelo: modelo || null, // modelo ou null se estiver em branco
        quantidade: quantidadeInt, // quantidade em formato inteiro validado
        fabricante: fabricante || null, // fabricante ou null se não informado
      }; // objeto que será enviado ao endpoint de criação de equipamentos

      await apiPostJson(
        `/avaliacoes/${avaliacaoId}/equipamentos`,
        payloadEquipamento
      ); // cria o registro de material no backend vinculado à avaliação
    }
  } catch (err) {
    console.error(
      "Erro ao sincronizar a lista de materiais de infraestrutura com o backend:",
      err
    ); // registra no console um erro detalhado da sincronização
    throw err; // propaga o erro para que o fluxo de salvamento da avaliação possa tratar
  }
}

async function salvarListaFotosSwitchQ2NoBackend(
  avaliacaoId,                  // id da avaliação cujas fotos serão sincronizadas
  listaFotos                    // lista de objetos { url, descricao } coletados do formulário
) {
  if (!avaliacaoId) {           // se não houver id de avaliação informado
    return;                     // encerra a função silenciosamente (não há avaliação para associar fotos)
  }

  const listaNormalizada = Array.isArray(listaFotos)
    ? listaFotos                // se já for um array válido, usamos diretamente
    : [];                       // caso contrário, garantimos que trabalharemos com um array vazio

  try {
    const existentes = await apiGet(
      `/avaliacoes/${avaliacaoId}/fotos`
    );                          // busca no backend todas as fotos já vinculadas a esta avaliação

    if (Array.isArray(existentes)) {  // se a resposta do backend for uma lista válida
      for (const fotoExistente of existentes) { // percorre cada foto já cadastrada
        if (
          fotoExistente &&                  // garante que o objeto não seja null/undefined
          fotoExistente.secao === "q2_switch" && // só manipulamos as fotos da seção Q2 (switch)
          typeof fotoExistente.id === "number"   // confere se a foto possui um id numérico válido
        ) {
          await apiDelete(
            `/fotos/${fotoExistente.id}`
          );                      // chama a API para excluir a foto específica pelo id
        }
      }
    }

    for (const item of listaNormalizada) { // percorre cada item da lista de fotos que queremos persistir
      const url =
        item && item.url
          ? item.url.toString().trim()
          : "";                   // normaliza a URL da foto, garantindo string sem espaços nas extremidades

      const descricao =
        item && item.descricao
          ? item.descricao.toString().trim()
          : "";                   // normaliza a descrição, se houver

      if (!url) {                 // se a URL estiver vazia ou inválida
        continue;                 // ignora silenciosamente este item da lista
      }

      const payloadFoto = {
        secao: "q2_switch",       // seção fixa indicando que a foto é do bloco Q2 (switch)
        arquivo_url: url,         // URL da imagem que será armazenada no backend
        descricao: descricao || null, // descrição ou null se o campo estiver em branco
      };                          // objeto que será enviado ao endpoint de criação de fotos

      await apiPostJson(
        `/avaliacoes/${avaliacaoId}/fotos`,
        payloadFoto
      );                          // cria o registro de foto no backend vinculado à avaliação
    }
  } catch (err) {
    console.error(
      "Erro ao sincronizar a lista de fotos do switch (Q2) com o backend:",
      err
    );                            // registra no console um erro detalhado da sincronização
    throw err;                    // propaga o erro para que o fluxo de salvamento da avaliação possa tratar
  }
}

async function carregarListaFotosSwitchQ2DoBackend(avaliacaoId) {
  if (!q2SwitchFotosTbody) {      // se a tabela de fotos não estiver presente no DOM
    return;                       // encerra a função sem fazer nada (evita erro em telas onde o bloco não existe)
  }

  q2SwitchFotosTbody.innerHTML = ""; // limpa todas as linhas atuais da tabela de fotos para evitar mistura de dados

  const valorLegado =
    q2SwitchFotoUrl && q2SwitchFotoUrl.value
      ? q2SwitchFotoUrl.value
      : "";                       // lê o valor do campo legado escondido (q2-switch-foto-url), se existir

  if (!avaliacaoId) {             // se nenhum id de avaliação foi informado
    preencherListaFotosSwitchQ2APartirDeValorUnico(valorLegado); // preenche a tabela de fotos usando apenas o valor legado (se houver)
    return;                       // encerra a função, pois não faz sentido chamar o backend sem id
  }

  try {
    const itens = await apiGet(
      `/avaliacoes/${avaliacaoId}/fotos`
    );                            // chama a API para buscar todas as fotos associadas a esta avaliação

    if (!Array.isArray(itens) || itens.length === 0) { // se a resposta não for uma lista válida ou vier vazia
      preencherListaFotosSwitchQ2APartirDeValorUnico(valorLegado); // volta a exibir apenas a foto principal (campo legado), se houver
      return;                   // encerra a função mantendo a tabela com uma linha baseada no valor legado
    }

    const fotosQ2 = itens.filter(
      (item) => item && item.secao === "q2_switch"
    );                          // filtra apenas as fotos pertencentes à seção Q2 (switch)

    if (!fotosQ2 || fotosQ2.length === 0) { // se não houver nenhuma foto marcada como q2_switch
      preencherListaFotosSwitchQ2APartirDeValorUnico(valorLegado); // usa o campo legado como fallback visual
      return;                   // encerra a função
    }

    q2SwitchFotosTbody.innerHTML = ""; // limpa novamente para garantir que só as fotos Q2 serão exibidas

    fotosQ2.forEach((foto) => { // percorre cada foto retornada pelo backend
      const linha = criarLinhaListaFotosSwitchQ2({ deveFocar: false }); // cria uma nova linha na tabela sem alterar o foco
      if (!linha) {            // se por algum motivo a linha não puder ser criada
        return;                // simplesmente ignora essa iteração
      }

      const inputUrl = linha.querySelector(".q2-switch-foto-url-input"); // pega o input de URL na linha criada
      const inputDescricao = linha.querySelector(
        ".q2-switch-foto-descricao-input"
      );                            // pega o input de descrição na mesma linha

      if (inputUrl) {              // se o campo de URL existir
        inputUrl.value = foto.arquivo_url || ""; // preenche o campo com a URL vinda do backend (ou string vazia se undefined)
      }
      if (inputDescricao) {        // se o campo de descrição existir
        inputDescricao.value = foto.descricao || ""; // preenche a descrição com o texto retornado pela API (ou vazio)
      }
    });

    const linhasAtuais = q2SwitchFotosTbody.querySelectorAll(
      ".q2-switch-fotos-linha"
    );                            // após o preenchimento, confere quantas linhas existem na tabela

    if (!linhasAtuais || linhasAtuais.length === 0) { // se por algum motivo nenhuma linha estiver presente
      preencherListaFotosSwitchQ2APartirDeValorUnico(valorLegado); // garante pelo menos uma linha baseada no valor legado
    }
  } catch (err) {
    console.error(
      "Erro ao carregar fotos do switch (Q2) do backend:",
      err
    );                            // registra no console o erro ocorrido ao chamar a API
    preencherListaFotosSwitchQ2APartirDeValorUnico(valorLegado); // em caso de erro, volta a exibir a linha baseada no valor legado
  }
}

async function enviarArquivoFotoSwitchQ2ParaBackend(arquivo) {
  if (!arquivo) {                                                // se nenhum arquivo foi fornecido
    throw new Error("Nenhum arquivo informado para upload.");    // lançamos um erro explícito para facilitar debug
  }

  if (!avaliacaoEmEdicaoId) {                                    // se não houver avaliação em edição associada
    throw new Error(
      "Não há avaliação em edição para associar a foto do switch (Q2)."
    );                                                           // lançamos erro, pois o upload depende de um id de avaliação válido
  }

  const formData = new FormData();                               // cria um novo objeto FormData para envio multipart/form-data
  formData.append("secao", "q2_switch");                         // informa ao backend que a foto pertence à seção Q2 (switch)
  formData.append("descricao", "");                              // descrição opcional fica vazia por enquanto (pode ser ajustada no futuro)
  formData.append("arquivo", arquivo);                           // anexa o arquivo de imagem propriamente dito no campo "arquivo"

  const path = `/avaliacoes/${avaliacaoEmEdicaoId}/fotos/upload`; // monta o caminho relativo do endpoint de upload de foto

  const fotoCriada = await apiPostFormData(path, formData);      // chama a função genérica de POST multipart para enviar o arquivo

  return fotoCriada;                                             // devolve o objeto retornado pelo backend (inclui arquivo_url, id, etc.)
}

/**
 * Carrega a lista de materiais de infraestrutura do backend
 * e preenche a tabela da interface com esses dados.
 */
async function carregarListaMateriaisInfraDoBackend(avaliacaoId) {
  if (!infraListaMateriaisTbody) {
    // se a tabela de materiais não estiver presente no DOM
    return; // encerra a função sem fazer nada
  }

  limparTabelaMateriaisInfra(); // limpa a tabela atual para não misturar dados de avaliações diferentes

  if (!avaliacaoId) {
    // se nenhum id de avaliação foi informado
    return; // não tenta chamar o backend sem saber qual avaliação carregar
  }

  try {
    const itens = await apiGet(
      `/avaliacoes/${avaliacaoId}/equipamentos`
    ); // busca no backend todos os materiais vinculados à avaliação

    if (!Array.isArray(itens) || itens.length === 0) {
      // se não vier lista válida ou se estiver vazia
      return; // mantém a tabela apenas com a linha vazia padrão
    }

    const listaParaPreencher = itens.map((item) => {
      // converte cada item retornado pela API para o formato esperado pelos helpers de UI
      return {
        equipamento:
          item && item.equipamento ? item.equipamento : "", // preserva o nome do equipamento/material
        modelo: item && item.modelo ? item.modelo : "", // preserva o modelo, se houver
        quantidade:
          item && typeof item.quantidade === "number"
            ? String(item.quantidade) // se vier como número, converte para string
            : item && item.quantidade
            ? String(item.quantidade) // se vier como string, garante que seja string
            : "", // caso contrário, deixa o campo de quantidade vazio
        fabricante:
          item && item.fabricante ? item.fabricante : "", // preserva o fabricante, se houver
      }; // objeto compatível com o formato usado pelo helper de preenchimento da tabela
    }); // fim do map sobre os itens retornados pelo backend

    preencherListaMateriaisInfraAPartirDeDados(
      listaParaPreencher
    ); // recria as linhas da tabela de materiais com base na lista carregada
  } catch (err) {
    console.error(
      "Erro ao carregar a lista de materiais de infraestrutura do backend:",
      err
    ); // registra no console um erro detalhado de carregamento
    // Em caso de erro, deixamos a avaliação carregar normalmente, apenas sem lista de materiais
  }
}

// ----------------------------------------------------------------------
// Fluxo de login e carregamento inicial
// ----------------------------------------------------------------------

/**
 * Faz o login do usuário usando o endpoint /auth/login da API.
 * O backend espera os dados em formato application/x-www-form-urlencoded,
 * padrão do OAuth2PasswordRequestForm.
 * @param {string} username - Login do usuário.
 * @param {string} password - Senha digitada.
 */
async function realizarLogin(username, password) {
  // Limpa mensagem anterior de erro
  loginErrorEl.textContent = "";

  try {
    // Monta corpo no formato de formulário URL-encoded
    const body = new URLSearchParams();
    body.append("username", username);
    body.append("password", password);
    // Opcionalmente podemos enviar grant_type, mas o FastAPI não exige
    body.append("grant_type", "password");

    // Faz a requisição para /auth/login
    const response = await fetch(API_BASE_URL + "/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    // Se credenciais inválidas, mostra mensagem amigável
    if (response.status === 400 || response.status === 401) {
      const data = await response.json().catch(() => null);
      const detail =
        data && data.detail
          ? data.detail
          : "Usuário ou senha inválidos. Tente novamente.";
      loginErrorEl.textContent = detail;
      return;
    }

    // Se qualquer outro erro HTTP acontecer, lança exceção
    if (!response.ok) {
      throw new Error("Erro ao tentar fazer login: " + response.status);
    }

    // Se deu certo, lemos o JSON com o token
    const tokenData = await response.json(); // converte a resposta da API de JSON para objeto JavaScript

    // Salva o token no helper e no localStorage
    setAuthToken(tokenData.access_token); // guarda o access_token em memória e no localStorage sob a chave de token

    // Marca no localStorage que este navegador já teve uma sessão autenticada
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SESSION_MARKER_KEY, "1"); // grava o valor "1" indicando que já houve login bem-sucedido neste navegador
    }

    // Depois de logar, carregamos os dados do usuário
    await carregarDadosUsuario(); // chama o endpoint /auth/me para obter nome, papel (admin/colaborador) e demais dados do usuário logado

    // E então carregamos a tela principal
    mostrarTelaApp();

    // Por fim, carregamos a lista de avaliações
    await carregarAvaliacoes();

    resetarFormularioParaNovaAvaliacao(); // garante que o formulário comece como "Nova Avaliação" após o login
    renderizarListaRascunhos(); // carrega também a tabela de rascunhos locais para o usuário logado

    resetarFormularioParaNovaAvaliacao(); // garante que o formulário comece como "Nova Avaliação" após o login

    // Se o usuário precisa trocar a senha, mostramos o modal específico
    if (currentUser && currentUser.precisa_trocar_senha) {
      abrirModalSenha();
    }
  } catch (err) {
    // Em qualquer erro inesperado, exibimos mensagem genérica
    console.error(err);
    loginErrorEl.textContent =
      "Erro inesperado ao fazer login. Verifique sua conexão e tente de novo.";
  }
}

/**
 * Busca as informações do usuário logado no endpoint /auth/me
 * e preenche a área de usuário na topbar.
 */
async function carregarDadosUsuario() {
  try {
    // Chama a API autenticada para obter os dados do usuário
    const data = await apiGet("/auth/me");

    // Guarda o objeto retornado na variável global
    currentUser = data;

    // Preenche o nome no cabeçalho
    userNameEl.textContent = currentUser.nome || currentUser.username;

    // Define o papel exibido de forma amigável
    if (currentUser.is_admin) {
      userRoleEl.textContent = "Administrador";
    } else {
      userRoleEl.textContent = "Colaborador";
    }
    if (currentUser.is_admin && openUsersButton) {                 // se o usuário logado for administrador e o botão existir
      openUsersButton.classList.remove("hidden");                  // remove a classe hidden para exibir o botão "Usuários" na topbar
    }

    atualizarVisibilidadeGestaoUsuarios();                     // mostra ou esconde o card de gestão de usuários conforme o perfil
  } catch (err) {
    // Se falhar ao carregar o usuário, tratamos como problema de autenticação
    console.error(err);
    handleAuthError();
  }
}

/**
 * Efetua logout limpando token e dados de usuário,
 * e retornando o usuário para a tela de login.
 */
function realizarLogout() {
  // Limpa token e dados do usuário
  setAuthToken(null); // remove o token JWT armazenado (localStorage) e em memória
  currentUser = null; // limpa o objeto com dados do usuário logado

  // Como o usuário clicou em "Sair", removemos o marcador de sessão anterior
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(SESSION_MARKER_KEY); // apaga a informação de que este navegador tinha uma sessão ativa
  }

  avaliacaoEmEdicaoId = null; // garante que não mantenha nenhuma avaliação em edição após sair
  rascunhoEmEdicaoId = null;  // garante que nenhum rascunho continue marcado como "em edição" após o logout

  if (formAvaliacao) {
    formAvaliacao.reset(); // limpa o formulário ao fazer logout
  }

  resetarFormularioParaNovaAvaliacao(); // volta o título/subtítulo para o modo padrão (texto de "Nova avaliação")

  // Limpa eventuais mensagens do formulário de avaliação
  avaliacaoFeedbackEl.textContent = ""; // apaga qualquer feedback de sucesso/erro do formulário de avaliação

  if (userManagementCard) { // se o card de gestão de usuários existir no DOM
    userManagementCard.classList.add("hidden"); // garante que ele não apareça quando estivermos na tela de login
  }

  // Exibe a tela de login após o logout
  mostrarTelaLogin(); // troca para a tela de login, escondendo a tela principal
}

// ----------------------------------------------------------------------
// Modal de troca de senha
// ----------------------------------------------------------------------

/**
 * Abre o modal que exige troca de senha no primeiro acesso.
 */
function abrirModalSenha() {
  if (!passwordModal) return;                                                 // se por algum motivo o elemento não existir, sai silenciosamente

  senhaAtualInput.value = "";                                                 // limpa o campo de senha atual
  novaSenhaInput.value = "";                                                  // limpa o campo de nova senha
  passwordErrorEl.textContent = "";                                           // limpa qualquer texto de erro anterior
  passwordErrorEl.classList.add("hidden");                                    // garante que a mensagem de erro esteja escondida

  passwordModal.classList.remove("hidden");                                   // remove a classe hidden para exibir o overlay do modal
}

/**
 * Fecha o modal de troca de senha.                                           // explica que a função esconde o modal
 */
function fecharModalSenha() {
  if (!passwordModal) return;                                                 // segurança: se não existir, não faz nada
  passwordModal.classList.add("hidden");                                      // adiciona a classe hidden para esconder o overlay do modal
}

/**
 * Envia para o backend a solicitação de troca de senha usando /auth/trocar-senha.   // descrição geral da função
 * Se for bem-sucedida, atualiza o campo precisa_trocar_senha do usuário.           // explica o efeito colateral
 */
async function enviarTrocaSenha(event) {
  event.preventDefault();                                                           // impede o envio padrão do formulário (reload da página)

  passwordErrorEl.textContent = "";                                                 // limpa qualquer mensagem de erro anterior
  passwordErrorEl.classList.add("hidden");                                          // esconde o parágrafo de erro

  const senhaAtual = senhaAtualInput.value.trim();                                  // lê e remove espaços da senha atual
  const novaSenha = novaSenhaInput.value.trim();                                    // lê e remove espaços da nova senha

  if (!senhaAtual || !novaSenha) {                                                  // valida se ambos os campos foram preenchidos
    passwordErrorEl.textContent = "Preencha todos os campos.";                      // mensagem de erro para campos vazios
    passwordErrorEl.classList.remove("hidden");                                     // exibe o parágrafo de erro
    return;                                                                         // interrompe a função sem chamar a API
  }

  try {
    const payload = {                                                               // monta o objeto que será enviado para o backend
      senha_atual: senhaAtual,                                                      // envia senha atual no campo esperado pelo schema Pydantic
      nova_senha: novaSenha,                                                        // envia nova senha no campo esperado pelo schema Pydantic
    };

    const result = await apiPostJson("/auth/trocar-senha", payload);                // faz a chamada POST autenticada para /auth/trocar-senha

    if (currentUser) {                                                              // se tivermos o usuário carregado em memória
      currentUser.precisa_trocar_senha = false;                                     // atualizamos a flag local para não exigir mais troca de senha
    }

    alert(result.detail || "Senha alterada com sucesso.");                          // mostra alerta de sucesso para o usuário
    fecharModalSenha();                                                             // fecha o modal de troca de senha
  } catch (err) {
    console.error(err);                                                             // registra o erro no console para depuração

    passwordErrorEl.textContent =
      "Não foi possível alterar a senha. Verifique a senha atual e tente novamente."; // mensagem genérica de erro para o usuário
    passwordErrorEl.classList.remove("hidden");                                     // exibe o parágrafo de erro
  }
}

// ----------------------------------------------------------------------
// Listagem e criação de avaliações
// ----------------------------------------------------------------------

/**
 * Carrega a lista de avaliações do backend e preenche a tabela da coluna esquerda.
 */
async function carregarAvaliacoes() {
  // Garante que a tabela tenha pelo menos uma linha enquanto carrega
  avaliacoesTbody.innerHTML =
    '<tr><td colspan="5" class="table-empty">Carregando avaliações...</td></tr>';

  try {
    // Chama o endpoint GET /avaliacoes
    const lista = await apiGet("/avaliacoes");

    // Se a lista estiver vazia, mostramos mensagem amigável
    if (!lista || lista.length === 0) {
      avaliacoesTbody.innerHTML =
        '<tr><td colspan="5" class="table-empty">Nenhuma avaliação encontrada.</td></tr>';
      return;
    }

    // Monta as linhas de tabela manualmente
    const linhas = lista
      .map((item) => {
        // Garante que temos um texto de data amigável
        const dataStr = item.data_avaliacao || "";
        // Garantir "YYYY-MM-DD" -> "DD/MM/YYYY" visualmente
        let dataFormatada = dataStr;
        if (dataStr && dataStr.includes("-")) {
          const [ano, mes, dia] = dataStr.split("-");
          dataFormatada = `${dia}/${mes}/${ano}`;
        }

        // Escapa informações básicas, caindo para string vazia se nulo
        const cliente = item.cliente_nome || "";                   // nome do cliente ou string vazia se não vier preenchido
        const local = item.local || "";                            // local da avaliação ou string vazia se não vier
        const status = (item.status || "").toString().toUpperCase(); // status em maiúsculas (ABERTO, FECHADO, etc.)
        const objeto = item.objeto || "";                          // objeto da avaliação ou string vazia por padrão

        const codigo =
          (item.codigo_avaliacao &&                                // verifica se o backend retornou um código amigável
            item.codigo_avaliacao.toString()) ||                   // se sim, converte para string e usa como código principal
          (item.id != null ? String(item.id) : "");                // senão, cai para o id numérico como fallback (registros antigos)

        // Retorna o HTML da linha de tabela
        return `
            <tr class="avaliacao-row" data-avaliacao-id="${item.id}">
                <td>${codigo}</td>
                <td>${objeto}</td>
                <td>${cliente}</td>
                <td>${dataFormatada}</td>
                <td>${local}</td>
                <td>${status}</td>
            </tr>
            `;

    })
    .join(""); // junta todas as linhas geradas em uma única string HTML

    // Atualiza o corpo da tabela com as linhas montadas
    avaliacoesTbody.innerHTML = linhas;
      // Depois de injetar as linhas, registra um listener de clique em cada uma
    const linhasTabela = avaliacoesTbody.querySelectorAll("tr.avaliacao-row"); // seleciona todas as linhas de avaliação

    linhasTabela.forEach((tr) => { // percorre cada linha de avaliação já renderizada na tabela
        const id = tr.getAttribute("data-avaliacao-id"); // lê o id da avaliação gravado no atributo data
        if (!id) { // se a linha não tiver um id válido
          return; // não registra evento de clique nesta linha
        }

        tr.addEventListener("click", async () => { // adiciona um listener assíncrono para o clique na linha
          if (salvarAvaliacaoButton) { // se o botão de salvar avaliação existir
            salvarAvaliacaoButton.disabled = true; // desabilita o botão de salvar durante o carregamento da avaliação
          }
          if (novaAvaliacaoButton) { // se o botão de nova avaliação existir
            novaAvaliacaoButton.disabled = true; // desabilita o botão de nova avaliação para evitar quebra de fluxo
          }
          if (recarregarButton) { // se o botão de recarregar existir
            recarregarButton.disabled = true; // desabilita o botão de recarregar lista enquanto carrega a avaliação
          }

          const linhasTabelaInterno =
            avaliacoesTbody.querySelectorAll("tr.avaliacao-row"); // seleciona novamente todas as linhas da tabela
          linhasTabelaInterno.forEach((linha) => {
            linha.classList.add("lista-avaliacoes-bloqueada"); // adiciona classe que bloqueia interação visualmente nas linhas
          });

          try { // garante que vamos tentar reabilitar a interface mesmo com erro
            await carregarAvaliacaoParaEdicao(parseInt(id, 10)); // chama a função que carrega os dados da avaliação clicada para o formulário
          } finally {
            if (salvarAvaliacaoButton) { // se o botão de salvar ainda estiver disponível
              salvarAvaliacaoButton.disabled = false; // reabilita o botão de salvar
            }
            if (novaAvaliacaoButton) { // se o botão de nova avaliação existir
              novaAvaliacaoButton.disabled = false; // reabilita o botão de nova avaliação
            }
            if (recarregarButton) { // se o botão de recarregar existir
              recarregarButton.disabled = false; // reabilita o botão de recarregar lista
            }

            const linhasTabelaLimpar =
              avaliacoesTbody.querySelectorAll("tr.avaliacao-row"); // seleciona novamente todas as linhas para limpar o estado de bloqueio
            linhasTabelaLimpar.forEach((linha) => {
              linha.classList.remove("lista-avaliacoes-bloqueada"); // remove a classe de bloqueio, liberando os cliques novamente
            });
          }
        });

        if (!id) {
        return; // se por algum motivo não houver id, não registra o clique
        }

        tr.addEventListener("click", () => {
        // ao clicar na linha, carregamos a avaliação para edição
        carregarAvaliacaoParaEdicao(parseInt(id, 10)); // converte o id para número e chama o loader
        });
    });
  } catch (err) {
    // Em caso de erro, mostra mensagem genérica e mantém trace no console
    console.error(err);
    avaliacoesTbody.innerHTML =
      '<tr><td colspan="5" class="table-empty">Erro ao carregar avaliações.</td></tr>';
  }
}

// ----------------------------------------------------------------------
// Gestão de usuários (somente administradores)
// ----------------------------------------------------------------------

/**
 * Carrega a lista de usuários do backend e preenche a tabela do modal.
 */
async function carregarUsuarios() {                                      // carrega a lista de usuários via API e preenche a tabela
  if (!usersTbody) {                                                     // se o corpo da tabela não existir no DOM
    return;                                                              // sai sem fazer nada (evita erros em telas sem modal)
  }

  usersTbody.innerHTML =
    '<tr><td colspan="6" class="table-empty">Carregando usuários...</td></tr>'; // mostra mensagem de carregamento enquanto espera a API

  if (usersFeedbackEl) {                                                 // se o parágrafo de feedback existir
    usersFeedbackEl.textContent = "";                                    // limpa qualquer mensagem anterior
    usersFeedbackEl.className = "form-feedback";                         // reseta as classes de estilo de feedback
  }

  try {                                                                  // inicia o bloco try/catch para tratar erros de rede
    const lista = await apiGet("/usuarios");                             // chama a API GET /usuarios para obter a lista de usuários

    if (!lista || lista.length === 0) {                                  // verifica se a lista veio vazia ou indefinida
      usersTbody.innerHTML =
        '<tr><td colspan="6" class="table-empty">Nenhum usuário encontrado.</td></tr>'; // mostra mensagem amigável de lista vazia
      return;                                                            // encerra a função
    }

    const linhas = lista                                                 // percorre a lista de usuários e monta as linhas HTML
      .map((usuario) => {                                                // para cada usuário retornado pelo backend
        const statusTexto = usuario.ativo ? "Ativo" : "Inativo";         // monta o texto do status (Ativo/Inativo)
        const labelBotao = usuario.ativo ? "Desativar" : "Ativar";       // define o texto do botão de alternância de status
        
        if(usuario.id === 1) {                             // se o usuário for o primeiro administrador
        return `
          <tr>
            <td>${usuario.id}</td>
            <td>${usuario.nome}</td>
            <td>${usuario.username}</td>
            <td>${usuario.email}</td>
            <td>${statusTexto}</td>
            <td>
              <section>
              <button type="button"
                      class="btn btn-ghost btn-small"
                      onclick="resetarSenhaUsuario(${usuario.id})">
                Resetar senha
              </button>
              </section>
            </td>
          </tr>
        `;
        } else{
            return `
            <tr>
                <td>${usuario.id}</td>
                <td>${usuario.nome}</td>
                <td>${usuario.username}</td>
                <td>${usuario.email}</td>
                <td>${statusTexto}</td>
                <td>
                <section>
                <button type="button"
                        class="btn btn-ghost btn-small"
                        onclick="alternarStatusUsuario(${usuario.id}, ${usuario.ativo})">
                    ${labelBotao}
                </button>
                </section>
                <section>
                <button type="button"
                        class="btn btn-ghost btn-small"
                        onclick="resetarSenhaUsuario(${usuario.id})">
                    Resetar senha
                </button>
                </section>
                </td>
            </tr>
            `;            
        }                                                               // devolve o HTML de uma linha da tabela para o usuário corrente
      })
      .join("");                                                         // junta todas as linhas em uma única string

    usersTbody.innerHTML = linhas;                                       // injeta as linhas montadas no corpo da tabela
  } catch (err) {                                                        // em caso de erro na requisição
    console.error(err);                                                  // registra o erro no console para depuração
    usersTbody.innerHTML =
      '<tr><td colspan="6" class="table-empty">Erro ao carregar usuários.</td></tr>'; // exibe mensagem de erro na tabela

    if (usersFeedbackEl) {                                               // se o campo de feedback existir
      usersFeedbackEl.textContent =
        "Erro ao carregar usuários. Tente novamente em instantes.";      // mostra mensagem de erro abaixo da tabela
      usersFeedbackEl.className = "form-feedback form-error";            // aplica estilo de erro
    }
  }
}

/**
 * Abre o modal de gestão de usuários.
 */
function abrirModalUsuarios() {                                         // abre o modal de gestão de usuários
  if (!usersModalOverlay) {                                             // se o overlay não existir
    return;                                                             // encerra sem fazer nada
  }
  usersModalOverlay.classList.remove("hidden");                         // remove a classe hidden para exibir o modal
  carregarUsuarios();                                                   // carrega a lista de usuários assim que o modal é aberto
}

/**
 * Fecha o modal de gestão de usuários.
 */
function fecharModalUsuarios() {                                        // fecha o modal de gestão de usuários
  if (!usersModalOverlay) {                                             // se o overlay não existir
    return;                                                             // encerra sem fazer nada
  }
  usersModalOverlay.classList.add("hidden");                            // adiciona a classe hidden para esconder o modal
}

/**
 * Alterna o status ativo/inativo de um usuário.
 * @param {number} usuarioId - ID do usuário a ser atualizado.
 * @param {boolean} ativoAtual - Valor atual do campo ativo.
 */
async function alternarStatusUsuario(usuarioId, ativoAtual) {           // alterna o campo ativo de um usuário
  if (!usersFeedbackEl) {                                               // se o elemento de feedback não existir
    return;                                                             // encerra a função
  }

  const acao = ativoAtual ? "desativar" : "ativar";                     // define a ação textual com base no estado atual
  const confirmado = window.confirm(                                    // abre um diálogo de confirmação para o administrador
    `Tem certeza que deseja ${acao} este usuário?`                      // mensagem exibida no diálogo
  );
  if (!confirmado) {                                                    // se o administrador cancelar a ação
    return;                                                             // não prossegue com a alteração
  }

  usersFeedbackEl.textContent = "";                                     // limpa mensagens anteriores
  usersFeedbackEl.className = "form-feedback";                          // reseta classes de estilo

  try {                                                                 // inicia bloco try/catch para tratar erros da API
    const novoStatus = !ativoAtual;                                     // calcula o novo valor do campo ativo (oposto do atual)

    await apiPatchJson(`/usuarios/${usuarioId}/status`, {               // chama a API PATCH /usuarios/{id}/status
      ativo: novoStatus,                                                // envia o novo status no corpo da requisição
    });

    usersFeedbackEl.textContent = "Status do usuário atualizado.";      // mensagem de sucesso para o administrador
    usersFeedbackEl.className = "form-feedback form-success";           // aplica estilo de sucesso
    await carregarUsuarios();                                           // recarrega a lista para refletir o novo status
  } catch (err) {                                                       // em caso de erro na chamada
    console.error(err);                                                 // registra o erro no console
    usersFeedbackEl.textContent =
      "Erro ao atualizar o status do usuário.";                         // mensagem de erro exibida no modal
    usersFeedbackEl.className = "form-feedback form-error";             // aplica estilo de erro
  }
}

/**
 * Gera uma senha temporária para o usuário informado.
 * @param {number} usuarioId - ID do usuário que terá a senha resetada.
 */
async function resetarSenhaUsuario(usuarioId) {                         // reseta a senha do usuário gerando uma senha temporária
  if (!usersFeedbackEl) {                                               // se o elemento de feedback não existir
    return;                                                             // encerra a função
  }

  const confirmado = window.confirm(                                    // diálogo de confirmação para o administrador
    "Gerar uma nova senha temporária para este usuário? " +
      "A senha atual será substituída e ele precisará trocá-la no próximo login." // mensagem explicando o impacto da ação
  );
  if (!confirmado) {                                                    // se o administrador desistir da operação
    return;                                                             // não faz nada
  }

  usersFeedbackEl.textContent = "";                                     // limpa mensagens anteriores
  usersFeedbackEl.className = "form-feedback";                          // reseta classes de estilo

  try {                                                                 // bloco try/catch para chamar a API
    const resultado = await apiPost(                                    // chama o endpoint POST de reset de senha
      `/usuarios/${usuarioId}/resetar-senha`                            // monta a URL com o id do usuário
    );

    const senhaTemporaria = resultado.senha_temporaria || "";          // lê a senha temporária retornada pela API
    if (senhaTemporaria) {                                             // se a senha foi retornada corretamente
      usersFeedbackEl.textContent =
        `Senha temporária gerada: ${senhaTemporaria}`;                 // exibe a senha temporária para o administrador
      usersFeedbackEl.className = "form-feedback form-success";        // aplica estilo de sucesso
      window.alert("Senha temporária gerada: " + senhaTemporaria);
    } else {                                                           // se por algum motivo a senha não veio no payload
      usersFeedbackEl.textContent =
        "Senha temporária gerada, mas não foi possível exibi-la.";     // mensagem neutra informando sucesso parcial
      usersFeedbackEl.className = "form-feedback form-error";          // aplica estilo de aviso/erro leve
    }
  } catch (err) {                                                      // em caso de erro na requisição
    console.error(err);                                                // registra o erro no console
    usersFeedbackEl.textContent =
      "Erro ao resetar a senha do usuário.";                           // mensagem de erro exibida no modal
    usersFeedbackEl.className = "form-feedback form-error";            // aplica estilo de erro
  }
}

/**
 * Busca os dados completos de uma avaliação no backend
 * e preenche o formulário no modo edição.
 * @param {number} avaliacaoId - ID da avaliação a ser carregada.
 */
async function carregarAvaliacaoParaEdicao(avaliacaoId) {
  try {
    const dados = await apiGet(`/avaliacoes/${avaliacaoId}`); // chama GET /avaliacoes/{id} na API

    avaliacaoEmEdicaoId = dados.id;                          // guarda o id da avaliação em edição
    //tipo_formulario
    const tipoBruto = dados.tipo_formulario || "utp_fibra";          // lê o tipo de formulário vindo da API ou assume "utp_fibra" como padrão
    const tipoNormalizado = tipoBruto.toString().toLowerCase();      // normaliza para minúsculas (aceita valores legados como "redes"/"infra")

    if (tipoFormularioInput) {                                       // se o input hidden existir
      tipoFormularioInput.value = tipoNormalizado;                   // grava o tipo normalizado da avaliação no campo hidden
    }

    aplicarVisibilidadeTipoFormulario(tipoNormalizado);              // aplica a visibilidade dos blocos/abas de acordo com o tipo carregado
    //tipo_formulario

    // Ajusta o título/subtítulo para indicar que estamos editando
    if (formTituloEl) {
      formTituloEl.textContent = `${dados.objeto}`;          // ex.: "Editar Avaliação #3"
    }

    if (formSubtituloEl) {
      formSubtituloEl.textContent =
        "Altere os dados necessários e clique em “Salvar avaliação” para gravar as mudanças."; // instrução de edição
    }

    // Preenche os campos do formulário com os valores retornados
    const nomeCliente = dados.cliente_nome || "";                 // valor bruto do nome do cliente vindo da API

    if (clienteNomeInput) {                                       // se o select de cliente existir
      const opcoesFixas = [                                      // lista de clientes fixos configurados no select
        "Novo Nordisk",
        "FFEX",
        "Somai",
        "União Química",
        "CSN",
        "Alpargatas",
        "Eurofarma",
        "Cristália",
        "Santo Agostino",
        "Cervantes",
      ];

      let valorSelect = "";                                      // valor que será aplicado no select de cliente
      let textoOutro = "";                                       // texto que será aplicado no campo de "Outro"
      const prefixoOutro = "Outro: ";                            // prefixo usado ao salvar clientes livres

      if (!nomeCliente) {                                        // se vier vazio do backend
        valorSelect = "";                                        // mantemos o select sem seleção
        textoOutro = "";                                         // e o campo de "Outro" vazio
      } else if (opcoesFixas.includes(nomeCliente)) {            // se o nome for exatamente uma das opções fixas
        valorSelect = nomeCliente;                               // seleciona diretamente a opção no combo
        textoOutro = "";                                         // não há valor de "Outro"
      } else if (nomeCliente.startsWith(prefixoOutro)) {         // se começar com "Outro: "
        valorSelect = "outro";                                   // seleciona a opção "Outro" no combo
        textoOutro = nomeCliente.substring(prefixoOutro.length); // pega somente o texto após "Outro: "
      } else {                                                   // qualquer outro texto (registros antigos ou nomes não catalogados)
        valorSelect = "outro";                                   // trata como "Outro"
        textoOutro = nomeCliente;                                // preserva o texto original no campo "Outro"
      }

      clienteNomeInput.value = valorSelect;                      // aplica o valor calculado ao select

      if (clienteNomeOutroInput) {                               // se o input de "Outro" existir
        clienteNomeOutroInput.value = textoOutro;                // aplica o texto calculado ao campo "Outro"
      }

      atualizarVisibilidadeClienteOutro();                       // ajusta a visibilidade do campo "Outro" conforme seleção atual
      // Patch panel - visibilidade da linha de modelo e do campo "Outro"
      atualizarVisibilidadeModeloPatchPanel();        // ajusta a visibilidade da linha de modelo com base em q1_novo_patch_panel
      atualizarVisibilidadeModeloPatchPanelOutro();   // ajusta a visibilidade do campo "Outro" com base no valor de q1_modelo_patch_panel
    }
    dataAvaliacaoInput.value = dados.data_avaliacao || ""; // data no formato YYYY-MM-DD
    localInput.value = dados.local || ""; // local
    objetoInput.value = dados.objeto || ""; // objeto
    statusSelect.value = dados.status || "aberto"; // status, com fallback
    equipeSelect.value = dados.equipe || ""; // equipe responsável
    responsavelInput.value = dados.responsavel_avaliacao || ""; // responsável técnico
    contatoInput.value = dados.contato || ""; // contato do cliente
    emailClienteInput.value = dados.email_cliente || ""; // e-mail do cliente
    escopoTextarea.value = dados.escopo_texto || ""; // escopo / observações
    // Flags gerais
    // Flags gerais
    if (servicoForaMC) {                                                    // verifica se o <select> de serviço fora de Montes Claros existe
      booleanParaSelectSimNao(                                              // usa helper para preencher o <select> baseado em um booleano
        servicoForaMC,                                                      // referência ao <select id="servico-fora-montes-claros">
        dados.servico_fora_montes_claros                                    // valor booleano vindo da API (true/false ou null)
      );
    }
    if (servicoIntermediario) {                                             // verifica se o <select> de serviço intermediário/empreiteira existe
      booleanParaSelectSimNao(                                              // usa helper para preencher o <select> baseado em um booleano
        servicoIntermediario,                                               // referência ao <select id="servico-intermediario">
        dados.servico_intermediario                                         // valor booleano vindo da API (true/false ou null)
      );
    }

    // Quantitativo 01 – Patch Panel / Cabeamento
    if (q1Categoria) {
      q1Categoria.value = dados.q1_categoria_cab || "";          // preenche categoria do cabeamento
    }
    if (q1Blindado) {
      booleanParaSelectSimNao(q1Blindado, dados.q1_blindado);    // preenche select de cabeamento blindado
    }
    if (q1NovoPatch) {
      booleanParaSelectSimNao(
        q1NovoPatch,
        dados.q1_novo_patch_panel
      );                                                          // preenche select "Necessita novo patch panel?"
    }
    if (q1IncluirGuia) {
      booleanParaSelectSimNao(
        q1IncluirGuia,
        dados.q1_incluir_guia
      );                                                          // preenche select "Incluir guia de cabos?"
    }
    if (q1QtdGuiasCabos){
      q1QtdGuiasCabos.value = dados.q1_qtd_guias_cabos ?? "";        // preenche quantidade de guias de cabos
    }
    if (q1QtdPontosRede) {
      q1QtdPontosRede.value = dados.q1_qtd_pontos_rede || "";     // preenche quantidade de pontos de rede
    }
    if (q1QtdCabos) {
      q1QtdCabos.value = dados.q1_qtd_cabos || "";                // preenche quantidade de cabos
    }
    if (q1QtdPortasPP) {
      q1QtdPortasPP.value = dados.q1_qtd_portas_patch_panel || ""; // preenche quantidade de portas no patch panel
    }
    if (q1QtdPatchCords) {
      q1QtdPatchCords.value = dados.q1_qtd_patch_cords || "";     // preenche quantidade de patch cords
    }

    if (q1ModeloPatchPanel) {                                     // se o select de modelo de patch panel existir
      const modelo = dados.q1_modelo_patch_panel || "";           // valor bruto de modelo vindo da API
      const opcoesFixasModelo = [                                 // lista de opções fixas do combo de modelo
        "CommScope 24 portas",                                    // opção fixa 1
        "Furukawa 24 portas",                                     // opção fixa 2
        "Systimax 24 portas",                                     // opção fixa 3
      ];
      const prefixoOutroModelo = "Outro: ";                       // prefixo usado quando o valor foi salvo como "Outro: <texto>"

      let valorSelectModelo = "";                                 // variável que guardará o valor aplicado ao select
      let textoOutroModelo = "";                                  // variável que guardará o texto aplicado no campo "Outro"

      if (!modelo) {                                              // se não houver valor salvo no campo de modelo
        valorSelectModelo = "";                                   // deixa o select sem seleção
        textoOutroModelo = "";                                    // limpa também o campo de "Outro"
      } else if (opcoesFixasModelo.includes(modelo)) {            // se o valor for exatamente uma das opções fixas
        valorSelectModelo = modelo;                               // seleciona diretamente o valor no combo
        textoOutroModelo = "";                                    // não há texto adicional de "Outro"
      } else if (modelo.startsWith(prefixoOutroModelo)) {         // se o valor começar com o prefixo "Outro: "
        valorSelectModelo = "outro";                              // seleciona a opção "Outro" no combo
        textoOutroModelo = modelo.substring(                      // extrai apenas a parte após o prefixo
          prefixoOutroModelo.length                               // usa o tamanho do prefixo para cortar a string
        );
      } else {                                                    // qualquer outro valor (dados antigos ou texto livre)
        valorSelectModelo = "outro";                              // trata como se fosse "Outro"
        textoOutroModelo = modelo;                                // preserva o valor original no campo de texto
      }

      q1ModeloPatchPanel.value = valorSelectModelo;               // aplica o valor calculado ao select de modelo

      if (q1ModeloPatchPanelOutroInput) {                         // se o input "Outro" de modelo existir
        q1ModeloPatchPanelOutroInput.value = textoOutroModelo;    // aplica o texto correspondente ao input
      }
    }

    atualizarVisibilidadeModeloPatchPanel();                      // garante que a linha de modelo esteja coerente com o "novo patch panel?"
    atualizarVisibilidadeModeloPatchPanelOutro();                 // garante que o campo "Outro" de modelo esteja coerente com o select
    atualizarVisibilidadeQtdGuiasCabos();                            // ajusta a visibilidade da quantidade de guias de cabos de acordo com o valor carregado

    if (q1MarcaCab) {                                             // se o select de marca de cabeamento existir
      const marca = dados.q1_marca_cab || "";                     // lê o valor bruto de marca vindo da API
      const opcoesFixasMarca = [                                  // lista de marcas fixas disponíveis
        "CommScope",                                              // marca CommScope
        "Furukawa",                                               // marca Furukawa
      ];
      const prefixoOutroMarca = "Outro: ";                        // prefixo para valores salvos como "Outro: <texto>"

      let valorSelectMarca = "";                                  // variável que guardará o valor aplicado ao select de marca
      let textoOutroMarca = "";                                   // variável que guardará o texto do campo "Outro" de marca

      if (!marca) {                                               // se não houver valor de marca salvo
        valorSelectMarca = "";                                    // deixa o select sem seleção
        textoOutroMarca = "";                                     // limpa também o texto de "Outro"
      } else if (opcoesFixasMarca.includes(marca)) {              // se a marca for exatamente uma das marcas fixas
        valorSelectMarca = marca;                                 // seleciona essa marca no combo
        textoOutroMarca = "";                                     // não há texto adicional
      } else if (marca.startsWith(prefixoOutroMarca)) {           // se começar com "Outro: "
        valorSelectMarca = "outro";                               // seleciona a opção "Outro" no combo de marca
        textoOutroMarca = marca.substring(                        // extrai somente o texto após o prefixo
          prefixoOutroMarca.length                                // usa o tamanho do prefixo para cortar a string
        );
      } else {                                                    // qualquer outro valor (dados antigos ou marcas livres)
        valorSelectMarca = "outro";                               // trata como "Outro"
        textoOutroMarca = marca;                                  // preserva a marca original no campo de texto
      }

      q1MarcaCab.value = valorSelectMarca;                        // aplica o valor calculado ao select de marca

      if (q1MarcaCabOutroInput) {                                 // se o input de "Outro" de marca existir
        q1MarcaCabOutroInput.value = textoOutroMarca;             // aplica o texto correspondente ao campo "Outro"
      }

      if (typeof atualizarVisibilidadeMarcaCabOutro === "function") { // se a função específica de marca estiver definida
        atualizarVisibilidadeMarcaCabOutro();                     // atualiza a visibilidade do campo "Outro" de marca
      }
    }
    if (q1QtdGuiasCabos)
      q1QtdGuiasCabos.value = dados.q1_qtd_guias_cabos ?? "";                             // quantidade de guias de cabos
    if (q1PatchCordsModelo) {                                       // se o select de modelo dos patch cords existir
      const modelo = dados.q1_patch_cords_modelo || "";             // lê o valor bruto vindo da API (texto armazenado no banco)
      const opcoesFixasModeloPatch = [                              // lista de modelos padronizados para os patch cords
        "0,5 mt",                                                   // modelo de patch cord de 0,5 metro
        "1,5 mt",                                                   // modelo de patch cord de 1,5 metro
        "3,0 mt",                                                   // modelo de patch cord de 3,0 metros
        "5mt",                                                      // modelo de patch cord de 5 metros
        "10mt",                                                     // modelo de patch cord de 10 metros
        "15mt",                                                     // modelo de patch cord de 15 metros
      ];

      if (modelo && !opcoesFixasModeloPatch.includes(modelo)) {     // se houver valor salvo e ele não estiver na lista de opções fixas
        const optionLegado = document.createElement("option");      // cria dinamicamente uma nova option para representar o valor legado
        optionLegado.value = modelo;                                // define o value da option como o texto salvo no banco
        optionLegado.textContent = modelo;                          // define o texto visível da option igual ao valor salvo
        q1PatchCordsModelo.appendChild(optionLegado);               // adiciona essa option ao select, preservando o valor em registros antigos
      }

      q1PatchCordsModelo.value = modelo || "";                      // aplica o valor (fixo ou legado) ao select
    }

    if (q1PatchCordsCor) {                                          // se o select de cor dos patch cords existir
      const cor = dados.q1_patch_cords_cor || "";                   // lê a cor salva na API (texto)
      const opcoesFixasCorPatch = [                                 // lista de cores padronizadas
        "branco",                                                   // cor branca
        "amarelo",                                                  // cor amarela
        "cinza",                                                    // cor cinza
        "vermelho",                                                 // cor vermelha
        "azul",                                                     // cor azul
      ];

      if (cor && !opcoesFixasCorPatch.includes(cor)) {              // se houver cor salva e não for uma das opções padrão
        const optionLegadoCor = document.createElement("option");   // cria uma option dinâmica para essa cor
        optionLegadoCor.value = cor;                                // value da option recebe a cor salva
        optionLegadoCor.textContent = cor;                          // texto visível também mostra essa cor
        q1PatchCordsCor.appendChild(optionLegadoCor);               // adiciona a option ao select para preservar registros antigos
      }

      q1PatchCordsCor.value = cor || "";                            // aplica a cor (padrão ou legado) ao select
    }
    if (q1PatchPanelExistenteNome)
      q1PatchPanelExistenteNome.value = dados.q1_patch_panel_existente_nome || "";        // identificação do patch panel existente

    // Quantitativo 02 – Switch
    if (q2NovoSwitch) {
      booleanParaSelectSimNao(q2NovoSwitch, dados.q2_novo_switch);            // preenche select com "sim"/"nao" para novo switch
    }
    if (q2SwitchPoe) {
      booleanParaSelectSimNao(q2SwitchPoe, dados.q2_switch_poe);              // LEGADO - PoE
    }
    if (q2RedeIndustrial) {
      booleanParaSelectSimNao(q2RedeIndustrial, dados.q2_rede_industrial);    // LEGADO - rede industrial
    }
    if (q2QtdPontosRede) {
      q2QtdPontosRede.value = dados.q2_qtd_pontos_rede ?? "";                 // quantidade de pontos atendidos
    }
    if (q2QtdPortasSwitch) {
      q2QtdPortasSwitch.value = dados.q2_qtd_portas_switch ?? "";             // quantidade de portas do switch
    }
    if (q2FornecedorSwitch) {
      q2FornecedorSwitch.value = dados.q2_fornecedor_switch || "";            // fornecedor do switch ("nortetel"/"cliente" ou vazio)
    }
    atualizarVisibilidadeFornecedorSwitch();                          // ajusta a visibilidade do fornecedor com base nos dados carregados
    if (q2ModeloSwitch) {
      q2ModeloSwitch.value = dados.q2_modelo_switch || "";                    // modelo do switch
    }
    if (q2SwitchExistenteNome) {
      q2SwitchExistenteNome.value = dados.q2_switch_existente_nome || "";     // identificação do switch existente
    }
    if (q2SwitchFotoUrl) {
      q2SwitchFotoUrl.value = dados.q2_switch_foto_url || "";                 // URL da foto do switch (campo legado principal)
    }
    preencherListaFotosSwitchQ2APartirDeValorUnico(dados.q2_switch_foto_url); // atualiza a tabela de fotos de Q2 com base nesse valor
    if (q2ObsSwitch) {
      q2ObsSwitch.value = dados.q2_observacoes || "";                         // observações sobre switches
    }

    // Quantitativo 03 – Cabeamento Óptico
    if (q3TipoFibra) {
      q3TipoFibra.value = dados.q3_tipo_fibra || "";                          // tipo de fibra
    }
    if (q3QtdFibrasPorCabo) {
      q3QtdFibrasPorCabo.value = dados.q3_qtd_fibras_por_cabo ?? "";          // fibras por cabo
    }
    if (q3TipoConector) {
      q3TipoConector.value = dados.q3_tipo_conector || "";                    // tipo de conector
    }
    if (q3ModeloDio) {                                                               // se o campo de modelo do DIO existir
      q3ModeloDio.value = dados.q3_modelo_dio || "";                                // preenche com o valor vindo da API ou deixa vazio
    }

    if (q3NovoDio) {                                                                 // se o select "Necessário novo DIO?" existir
      booleanParaSelectSimNao(q3NovoDio, dados.q3_novo_dio);                         // usa diretamente o booleano q3_novo_dio do backend para marcar "sim" ou "nao" no select
    }

    atualizarVisibilidadeModeloDio();                                                // ajusta a visibilidade do modelo conforme o valor carregado

    if (q3CaixaTerminacao) {
      booleanParaSelectSimNao(q3CaixaTerminacao, dados.q3_caixa_terminacao);  // preenche select "caixa de terminação?"
    }
    if (q3TipoCaboOptico) {
      q3TipoCaboOptico.value = dados.q3_tipo_cabo_optico || "";               // tipo de cabo óptico
    }
    if (q3CaixaEmenda) {
      booleanParaSelectSimNao(q3CaixaEmenda, dados.q3_caixa_emenda);          // preenche select "caixa de emenda?"
    }
    if (q3QtdCabos) {
      q3QtdCabos.value = dados.q3_qtd_cabos ?? "";                            // quantidade de cabos ópticos
    }
    if (q3TamanhoTotal) {
      q3TamanhoTotal.value = dados.q3_tamanho_total_m ?? "";                  // metragem total
    }
    if (q3QtdFibras) {
      q3QtdFibras.value = dados.q3_qtd_fibras ?? "";                          // quantidade total de fibras
    }
    if (q3QtdPortasDio) {
      q3QtdPortasDio.value = dados.q3_qtd_portas_dio ?? "";                   // quantidade de portas do DIO
    }
    if (q3QtdCordoesOpticos) {
      q3QtdCordoesOpticos.value = dados.q3_qtd_cordoes_opticos ?? "";         // quantidade de cordões ópticos
    }
    if (q3MarcaCabOptico) {
      q3MarcaCabOptico.value = dados.q3_marca_cab_optico || "";               // marca do cabo óptico
    }
    if (q3ModeloCordaoOptico) {
      q3ModeloCordaoOptico.value = dados.q3_modelo_cordao_optico || "";       // modelo do cordão óptico
    }

    if (q3Obs) {
      q3Obs.value = dados.q3_observacoes || "";
    }

    if (q3MarcaCabOptico) {                                                      // se o select de marca do cabo óptico existir
      const marcaOptica = dados.q3_marca_cab_optico || "";                       // lê o valor bruto da API (pode ser fixo ou "Outro: <texto>")
      const opcoesFixasMarcaOptica = [                                           // lista de marcas padronizadas para cabo óptico
        "Furukawa",                                                              // marca Furukawa
        "CommScope",                                                             // marca CommScope
      ];
      const prefixoOutroMarcaOptica = "Outro: ";                                 // prefixo usado quando o valor foi salvo como "Outro: <texto>"

      let valorSelectMarcaOptica = "";                                           // valor que será aplicado ao select
      let textoOutroMarcaOptica = "";                                            // texto que será aplicado ao campo "Outro"

      if (!marcaOptica) {                                                        // se não houver valor salvo
        valorSelectMarcaOptica = "";                                             // deixa o select sem seleção
        textoOutroMarcaOptica = "";                                              // e o campo de "Outro" vazio
      } else if (opcoesFixasMarcaOptica.includes(marcaOptica)) {                // se for exatamente uma das marcas fixas
        valorSelectMarcaOptica = marcaOptica;                                    // seleciona essa marca
        textoOutroMarcaOptica = "";                                              // não há texto de "Outro"
      } else if (marcaOptica.startsWith(prefixoOutroMarcaOptica)) {             // se começar com "Outro: "
        valorSelectMarcaOptica = "outro";                                        // seleciona a opção "Outro"
        textoOutroMarcaOptica = marcaOptica.substring(                           // extrai apenas o texto após o prefixo
          prefixoOutroMarcaOptica.length                                         // usa o tamanho do prefixo para cortar a string
        );
      } else {                                                                   // qualquer outro valor livre (dados antigos/legados)
        valorSelectMarcaOptica = "outro";                                        // trata como "Outro"
        textoOutroMarcaOptica = marcaOptica;                                     // preserva o valor original no campo de texto
      }

      q3MarcaCabOptico.value = valorSelectMarcaOptica;                           // aplica o valor calculado ao select

      if (q3MarcaCabOpticoOutroInput) {                                          // se o input de "Outro" existir
        q3MarcaCabOpticoOutroInput.value = textoOutroMarcaOptica;               // aplica o texto correspondente
      }

      atualizarVisibilidadeMarcaCaboOpticoOutro();                               // ajusta a visibilidade do campo "Outro" conforme o valor carregado
    }


    // Quantitativo 04 – Equipamentos
    if (q4Camera) {
      booleanParaSelectSimNao(q4Camera, dados.q4_camera);                      // preenche select da flag "Câmera?"
    }
    if (q4NvrDvr) {
      booleanParaSelectSimNao(q4NvrDvr, dados.q4_nvr_dvr);                     // preenche select da flag "NVR/DVR?"
    }
    if (q4AccessPoint) {
      booleanParaSelectSimNao(q4AccessPoint, dados.q4_access_point);           // LEGADO – flag "Access Point?"
    }
    if (q4Conversor) {
      booleanParaSelectSimNao(q4Conversor, dados.q4_conversor_midia);          // flag "Conversor de mídia?"
    }
    if (q4Gbic) {
      booleanParaSelectSimNao(q4Gbic, dados.q4_gbic);                          // flag "GBIC?"
    }
    if (q4Switch) {
      booleanParaSelectSimNao(q4Switch, dados.q4_switch);                      // LEGADO – flag "Switch?"
    }

    if (q4CameraNova) {
      booleanParaSelectSimNao(q4CameraNova, dados.q4_camera_nova);             // preenche select "Câmera nova/realocação?"
      q4CameraNova.value = "";
    }
    if (q4CameraFornecedor) {
      q4CameraFornecedor.value = dados.q4_camera_fornecedor || "";             // fornecedor da câmera
    }
    if (q4CameraModelo) {
      q4CameraModelo.value = dados.q4_camera_modelo || "";                     // modelo da câmera
    }
    if (q4CameraQtd) {
      q4CameraQtd.value = dados.q4_camera_qtd ?? "";                           // quantidade de câmeras
    }
    if (q4NvrDvrModelo) {
      q4NvrDvrModelo.value = dados.q4_nvr_dvr_modelo || "";                    // modelo do NVR/DVR
    }
    atualizarVisibilidadeCamera();
    atualizarVisibilidadeNvrdvr();
    if (q4ConversorMidiaModelo) {
      q4ConversorMidiaModelo.value = dados.q4_conversor_midia_modelo || "";    // modelo do conversor de mídia
    }
    if (q4GbicModelo) {
      q4GbicModelo.value = dados.q4_gbic_modelo || "";                         // modelo do GBIC
    }

    // Quantitativo 05 – Infraestrutura
    if (q5NovaEletrocalha) {
      booleanParaSelectSimNao(q5NovaEletrocalha, dados.q5_nova_eletrocalha);      // preenche select de nova eletrocalha
    }
    if (q5NovoEletroduto) {
      booleanParaSelectSimNao(q5NovoEletroduto, dados.q5_novo_eletroduto);        // preenche select de novo eletroduto
    }
    if (q5NovoRack) {
      booleanParaSelectSimNao(q5NovoRack, dados.q5_novo_rack);                    // preenche select de novo rack
    }
    if (q5InstalacaoEletrica) {
      booleanParaSelectSimNao(q5InstalacaoEletrica, dados.q5_instalacao_eletrica);// preenche select de instalação elétrica
    }
    if (q5Nobreak) {
      booleanParaSelectSimNao(q5Nobreak, dados.q5_nobreak);                        // preenche select de nobreak
    }
    if (q5Serralheria) {
      booleanParaSelectSimNao(q5Serralheria, dados.q5_serralheria);                // preenche select de serralheria
    }

    if (q5EletrocalhaModelo) {
      q5EletrocalhaModelo.value = dados.q5_eletrocalha_modelo || "";               // modelo da eletrocalha
    }
    if (q5EletrocalhaQtd) {
      q5EletrocalhaQtd.value = dados.q5_eletrocalha_qtd ?? "";                     // quantidade de eletrocalhas
    }
    if (q5EletrodutoModelo) {
      q5EletrodutoModelo.value = dados.q5_eletroduto_modelo || "";                 // modelo do eletroduto
    }
    if (q5EletrodutoQtd) {
      q5EletrodutoQtd.value = dados.q5_eletroduto_qtd ?? "";                       // quantidade de eletrodutos
    }
    if (q5RackModelo) {
      q5RackModelo.value = dados.q5_rack_modelo || "";                             // modelo do rack
    }
    if (q5RackQtd) {
      q5RackQtd.value = dados.q5_rack_qtd ?? "";                                   // quantidade de racks
    }
    if (q5NobreakModelo) {
      q5NobreakModelo.value = dados.q5_nobreak_modelo || "";                       // modelo do nobreak
    }
    if (q5NobreakQtd) {
      q5NobreakQtd.value = dados.q5_nobreak_qtd ?? "";                             // quantidade de nobreaks
    }
    if (q5SerralheriaDescricao) {
      q5SerralheriaDescricao.value = dados.q5_serralheria_descricao || "";         // descrição da serralheria
    }
    if (q5InstalacaoEletricaObs) {
      q5InstalacaoEletricaObs.value = dados.q5_instalacao_eletrica_obs || "";      // observações da instalação elétrica
    }

    // Imagens
    if (imgRef1) {
      imgRef1.value = dados.localizacao_imagem1_url || "";                         // URL da primeira imagem
    }
    if (imgRef2) {
      imgRef2.value = dados.localizacao_imagem2_url || "";                         // URL da segunda imagem
    }

    // Pré-requisitos
    if (preTrabalhoAltura) {                                                    // verifica se o <select> de serviço fora de Montes Claros existe
      booleanParaSelectSimNao(                                              // usa helper para preencher o <select> baseado em um booleano
        preTrabalhoAltura,                                                      // referência ao <select id="servico-fora-montes-claros">
        dados.pre_trabalho_altura                                    // valor booleano vindo da API (true/false ou null)
      );
    }
    prePlataforma.value = "";
    if (prePlataforma) {                                                    // verifica se o <select> de serviço fora de Montes Claros existe
      booleanParaSelectSimNao(                                              // usa helper para preencher o <select> baseado em um booleano
        prePlataforma,                                                      // referência ao <select id="servico-fora-montes-claros">
        dados.pre_plataforma                                    // valor booleano vindo da API (true/false ou null)
      );
    }
    prePlataformaModelo.value = dados.pre_plataforma_modelo || "";
    prePlataformaDias.value = dados.pre_plataforma_dias || "";
    atualizarVisibilidadeModeloPlataforma();
    preForaHorario.checked = dados.pre_fora_horario_comercial ?? false;
    if (preForaHorario) {                                                    // verifica se o <select> de serviço fora de Montes Claros existe
      booleanParaSelectSimNao(                                              // usa helper para preencher o <select> baseado em um booleano
        preForaHorario,                                                      // referência ao <select id="servico-fora-montes-claros">
        dados.pre_fora_horario_comercial                                    // valor booleano vindo da API (true/false ou null)
      );
    }
    preVeiculoNortetel.checked = dados.pre_veiculo_nortetel ?? false;
    if (preVeiculoNortetel) {                                                    // verifica se o <select> de serviço fora de Montes Claros existe
      booleanParaSelectSimNao(                                              // usa helper para preencher o <select> baseado em um booleano
        preVeiculoNortetel,                                                      // referência ao <select id="servico-fora-montes-claros">
        dados.pre_veiculo_nortetel                                    // valor booleano vindo da API (true/false ou null)
      );
    }
    preContainer.checked = dados.pre_container_materiais ?? false;
    if (preContainer) {                                                    // verifica se o <select> de serviço fora de Montes Claros existe
      booleanParaSelectSimNao(                                              // usa helper para preencher o <select> baseado em um booleano
        preContainer,                                                      // referência ao <select id="servico-fora-montes-claros">
        dados.pre_container_materiais                                    // valor booleano vindo da API (true/false ou null)
      );
    }

    // Horas - dias normais (Tabela 4)
    if (encarregadoDiasInput) encarregadoDiasInput.value = dados.encarregado_dias ?? "";                       // preenche dias de encarregado vindos da API
    if (instaladorDiasInput) instaladorDiasInput.value = dados.instalador_dias ?? "";                         // preenche dias de instalador
    if (auxiliarDiasInput) auxiliarDiasInput.value = dados.auxiliar_dias ?? "";                               // preenche dias de auxiliar
    if (tecnicoInstalacaoDiasInput) tecnicoInstalacaoDiasInput.value = dados.tecnico_de_instalacao_dias ?? ""; // preenche dias do técnico de instalação
    if (tecnicoSegurancaDiasInput) tecnicoSegurancaDiasInput.value = dados.tecnico_em_seguranca_dias ?? "";    // preenche dias do técnico em segurança

    // Horas extras por função
    if (encarregadoHoraExtraInput) encarregadoHoraExtraInput.value = dados.encarregado_hora_extra ?? "";                 // preenche horas extras do encarregado
    if (instaladorHoraExtraInput) instaladorHoraExtraInput.value = dados.instalador_hora_extra ?? "";                   // preenche horas extras do instalador
    if (auxiliarHoraExtraInput) auxiliarHoraExtraInput.value = dados.auxiliar_hora_extra ?? "";                         // preenche horas extras do auxiliar
    if (tecnicoInstalacaoHoraExtraInput) tecnicoInstalacaoHoraExtraInput.value = dados.tecnico_de_instalacao_hora_extra ?? ""; // preenche horas extras do técnico de instalação
    if (tecnicoSegurancaHoraExtraInput) tecnicoSegurancaHoraExtraInput.value = dados.tecnico_em_seguranca_hora_extra ?? "";     // preenche horas extras do técnico em segurança

    // Trabalho em domingos/feriados por função
    if (encarregadoDomingoInput) encarregadoDomingoInput.value = dados.encarregado_trabalho_domingo ?? "";                 // preenche domingos/feriados do encarregado
    if (instaladorDomingoInput) instaladorDomingoInput.value = dados.instalador_trabalho_domingo ?? "";                   // preenche domingos/feriados do instalador
    if (auxiliarDomingoInput) auxiliarDomingoInput.value = dados.auxiliar_trabalho_domingo ?? "";                         // preenche domingos/feriados do auxiliar
    if (tecnicoInstalacaoDomingoInput) tecnicoInstalacaoDomingoInput.value = dados.tecnico_de_instalacao_trabalho_domingo ?? ""; // preenche domingos/feriados do técnico de instalação
    if (tecnicoSegurancaDomingoInput) tecnicoSegurancaDomingoInput.value = dados.tecnico_em_seguranca_trabalho_domingo ?? "";   // preenche domingos/feriados do técnico em segurança

    // Prazos (cronograma e entregas)
    booleanParaSelectSimNao(cronogramaExecucaoSelect, dados.cronograma_execucao);        // converte o booleano da API para "sim"/"nao" no select de cronograma
    if (diasInstalacaoInput) diasInstalacaoInput.value = dados.dias_instalacao ?? "";    // preenche os dias previstos de instalação
    booleanParaSelectSimNao(asBuiltSelect, dados.as_built);                              // preenche o select de As Built
    if (diasEntregaRelatorioInput) diasEntregaRelatorioInput.value = dados.dias_entrega_relatorio ?? ""; // preenche o prazo de entrega do relatório
    booleanParaSelectSimNao(artSelect, dados.art);                                       // preenche o select de ART

    // Alimentação
    if (almocoQtdInput) almocoQtdInput.value = dados.almoco_qtd ?? "";   // preenche quantidade de almoços
    if (lancheQtdInput) lancheQtdInput.value = dados.lanche_qtd ?? "";   // preenche quantidade de lanches
    
    await carregarListaMateriaisInfraDoBackend(
      avaliacaoId
    ); // busca no backend a lista de materiais de infraestrutura da avaliação e preenche a tabela dinâmica correspondente

    await carregarListaFotosSwitchQ2DoBackend(
      avaliacaoId
    ); // busca no backend as fotos da seção Q2 (switch) e preenche a tabela dinâmica de fotos

    // Feedback visual informando que estamos em modo edição
    avaliacaoFeedbackEl.textContent =
      "Você está editando uma avaliação existente. Após alterar os campos, clique em “Salvar avaliação”."; // aviso de edição
    avaliacaoFeedbackEl.className = "form-feedback form-success"; // usa estilo de sucesso suave
  } catch (err) {
    console.error(err); // loga erro no console

    avaliacaoFeedbackEl.textContent =
      "Não foi possível carregar os dados da avaliação selecionada."; // mensagem de erro na interface
    avaliacaoFeedbackEl.className = "form-feedback form-error"; // aplica estilo de erro
  }
}

/**
 * Deixa o formulário de avaliação no modo padrão de "Nova Avaliação".
 * Limpa o id em edição e ajusta título/subtítulo.
 */
function resetarFormularioParaNovaAvaliacao() {
  avaliacaoEmEdicaoId = null; // zera o id em edição: próximo submit será um POST (criação)
  rascunhoEmEdicaoId = null;  // zera também o id do rascunho vinculado, iniciando uma nova avaliação "do zero"

  if (rascunhoIdInput) { // se o campo oculto existir
    rascunhoIdInput.value = ""; // limpa o id de rascunho ao iniciar uma nova avaliação
  }

  if (formTituloEl) {
    formTituloEl.textContent = "Nova Avaliação"; // título padrão exibido na tela
  }

  if (formSubtituloEl) {
    formSubtituloEl.textContent =
      "Preencha os dados abaixo para registrar uma nova avaliação técnica."; // texto padrão
  }

  // Flags gerais
  if (servicoForaMC) servicoForaMC.value = "";             // desmarca a opção "serviço fora de Montes Claros"
  if (servicoIntermediario) servicoIntermediario.value = ""; // desmarca a opção de serviço intermediário

  // Campo de cliente (select + "Outro")
  if (clienteNomeInput) {                                       // se o select de cliente existir
    clienteNomeInput.value = "";                                // limpa a seleção de cliente
  }
  if (clienteNomeOutroInput) {                                  // se o input de "Outro" existir
    clienteNomeOutroInput.value = "";                           // limpa qualquer texto digitado
  }
  if (clienteOutroWrapper) {                                    // se o wrapper do campo "Outro" existir
    clienteOutroWrapper.classList.add("invisible-keep-space");                // garante que o campo "Outro" fique oculto no reset
  }

  // Quantitativo 01 – Patch Panel / Cabeamento                         // comentário da seção de reset
  if (q1Categoria) q1Categoria.value = "";                              // limpa categoria do cabeamento
  if (q1Blindado) q1Blindado.value = "";                                // reseta select de cabeamento blindado
  if (q1NovoPatch) q1NovoPatch.value = "";                              // reseta select "Necessita novo patch panel?"
  if (q1IncluirGuia) q1IncluirGuia.value = "";                          // reseta select "Incluir guia de cabos?"
  if (q1QtdGuiasCabos) q1QtdGuiasCabos.value = "";                 // limpa quantidade de guias de cabos
  if (q1QtdGuiasCabosWrapper) {                                    // se o wrapper existir
    q1QtdGuiasCabosWrapper.classList.add("invisible-keep-space");                // garante que o campo fique oculto após o reset
  }
  if (q1QtdPontosRede) q1QtdPontosRede.value = "";                      // limpa quantidade de pontos de rede
  if (q1QtdCabos) q1QtdCabos.value = "";                                // limpa quantidade de cabos
  if (q1QtdPortasPP) q1QtdPortasPP.value = "";                          // limpa quantidade de portas no patch panel
  if (q1QtdPatchCords) q1QtdPatchCords.value = "";                      // limpa quantidade de patch cords
  if (q1PatchCordsModelo) q1PatchCordsModelo.value = "";           // limpa modelo dos patch cords
  if (q1PatchCordsCor) q1PatchCordsCor.value = "";                 // limpa cor dos patch cords
  if (q1MarcaCab) q1MarcaCab.value = "";                                // limpa o select de marca do cabeamento
  if (q1MarcaCabOutroInput) q1MarcaCabOutroInput.value = "";            // limpa o texto do campo "Outro" de marca
  if (q1MarcaCabOutroWrapper) {                                         // se o wrapper do campo "Outro" de marca existir
    q1MarcaCabOutroWrapper.classList.add("invisible-keep-space");                     // garante que o campo "Outro" de marca fique oculto no reset
  }
  if (q1ModeloPatchPanel) q1ModeloPatchPanel.value = "";           // reseta o select de modelo do patch panel
  if (q1ModeloPatchPanelOutroInput) q1ModeloPatchPanelOutroInput.value = ""; // limpa o texto de "Outro" do modelo
  if (q1ModeloPatchPanelWrapper) q1ModeloPatchPanelWrapper.classList.add("invisible-keep-space");  // esconde a linha e modelo de patch panel
  if (q1ModeloPatchPanelOutroWrapper) {                            // se o wrapper de "Outro" existir
    q1ModeloPatchPanelOutroWrapper.classList.add("invisible-keep-space");        // garante que o campo de "Outro" esteja oculto
  }
  
  // Quantitativo 02 – Switch
  //if (q2NovoSwitch) q2NovoSwitch.checked = false;
  if (q2NovoSwitch) q2NovoSwitch.value = "";                      // reseta "Necessita novo switch?"
  if (q2FornecedorSwitch) q2FornecedorSwitch.value = "";          // limpa seleção de fornecedor do switch
  if (q2FornecedorSwitchWrapper) {                                // se o wrapper de fornecedor existir
    q2FornecedorSwitchWrapper.classList.add("invisible-keep-space");            // garante que o campo de fornecedor fique oculto após o reset
  }
  if (q2SwitchPoe) q2SwitchPoe.checked = false;
  if (q2RedeIndustrial) q2RedeIndustrial.checked = false;
  if (q2QtdPontosRede) q2QtdPontosRede.value = "";
  if (q2QtdPortasSwitch) q2QtdPortasSwitch.value = "";
  if (q2ObsSwitch) q2ObsSwitch.value = "";

  // Quantitativo 03 – Fibra Óptica
  if (q3TipoFibra) q3TipoFibra.value = "";
  if (q3QtdFibrasPorCabo) q3QtdFibrasPorCabo.value = "";
  if (q3TipoConector) q3TipoConector.value = "";
  if (q3NovoDio) q3NovoDio.value = "";                                             // limpa o select "Necessário novo DIO?"
  if (q3ModeloDio) q3ModeloDio.value = "";                                         // limpa o modelo do DIO
  if (q3ModeloDioWrapper) {                                                        // se o wrapper existir
    q3ModeloDioWrapper.classList.add("invisible-keep-space");                                    // garante que o campo de modelo fique oculto após o reset
  }
  if (q3CaixaTerminacao) q3CaixaTerminacao.checked = false;
  if (q3TipoCaboOptico) q3TipoCaboOptico.value = "";
  if (q3CaixaEmenda) q3CaixaEmenda.checked = false;
  if (q3QtdCabos) q3QtdCabos.value = "";
  if (q3TamanhoTotal) q3TamanhoTotal.value = "";
  if (q3QtdFibras) q3QtdFibras.value = "";
  if (q3QtdPortasDio) q3QtdPortasDio.value = "";
  if (q3QtdCordoesOpticos) q3QtdCordoesOpticos.value = "";
  if (q3Obs) q3Obs.value = "";
  if (q3MarcaCabOptico) q3MarcaCabOptico.value = "";                           // limpa a seleção de marca do cabo óptico
  if (q3MarcaCabOpticoOutroInput) q3MarcaCabOpticoOutroInput.value = "";       // limpa o texto do campo "Outro" de marca óptica
  if (q3MarcaCabOpticoOutroWrapper) {                                          // se o wrapper do campo "Outro" existir
    q3MarcaCabOpticoOutroWrapper.classList.add("invisible-keep-space");                      // garante que o campo "Outro" fique oculto após o reset
  }

  // Quantitativo 04 – Equipamentos
  if (q4Camera) q4Camera.value = "";                                     // reseta select de flag "Câmera?"
  if (q4NvrDvr) q4NvrDvr.value = "";                                     // reseta select de flag "NVR/DVR?"
  if (q4AccessPoint) q4AccessPoint.value = "";                           // reseta select de Access Point (LEGADO)
  if (q4Conversor) q4Conversor.value = "";                               // reseta select de conversor de mídia
  if (q4Gbic) q4Gbic.value = "";                                         // reseta select de GBIC
  if (q4Switch) q4Switch.value = "";                                     // reseta select de switch (LEGADO)

  if (q4CameraNova) q4CameraNova.value = "";                             // reseta select "Câmera nova/realocação?"
  if (q4CameraNovaWrapper) q4CameraNovaWrapper.classList.add("invisible-keep-space");
  if (q4CameraFornecedor) q4CameraFornecedor.value = "";                 // reseta fornecedor da câmera
  if (q4CameraModelo) q4CameraModelo.value = "";                         // limpa modelo da câmera
  if (q4CameraModeloWrapper) q4CameraModeloWrapper.classList.add("invisible-keep-space");
  if (q4CameraQtd) q4CameraQtd.value = "";                               // limpa quantidade de câmeras
  if (q4CameraQtdWrapper) q4CameraQtdWrapper.classList.add("invisible-keep-space");
  if (q4NvrDvrModelo) q4NvrDvrModelo.value = "";                         // limpa modelo do NVR/DVR
  if(q4NvrDvrModeloWrapper) q4NvrDvrModeloWrapper.classList.add("invisible-keep-space");
  if (q4ConversorMidiaModelo) q4ConversorMidiaModelo.value = "";         // limpa modelo do conversor de mídia
  if (q4GbicModelo) q4GbicModelo.value = "";                             // limpa modelo do GBIC

  // Quantitativo 05 – Infraestrutura
  if (q5NovaEletrocalha) q5NovaEletrocalha.value = "";                // reseta select de nova eletrocalha
  if (q5NovoEletroduto) q5NovoEletroduto.value = "";                  // reseta select de novo eletroduto
  if (q5NovoRack) q5NovoRack.value = "";                              // reseta select de novo rack
  if (q5InstalacaoEletrica) q5InstalacaoEletrica.value = "";          // reseta select de instalação elétrica
  if (q5Nobreak) q5Nobreak.value = "";                                // reseta select de nobreak
  if (q5Serralheria) q5Serralheria.value = "";                        // reseta select de serralheria

  if (q5EletrocalhaModelo) q5EletrocalhaModelo.value = "";            // limpa modelo da eletrocalha
  if (q5EletrocalhaQtd) q5EletrocalhaQtd.value = "";                  // limpa quantidade de eletrocalhas
  if (q5EletrodutoModelo) q5EletrodutoModelo.value = "";              // limpa modelo do eletroduto
  if (q5EletrodutoQtd) q5EletrodutoQtd.value = "";                    // limpa quantidade de eletrodutos
  if (q5RackModelo) q5RackModelo.value = "";                          // limpa modelo do rack
  if (q5RackQtd) q5RackQtd.value = "";                                // limpa quantidade de racks
  if (q5NobreakModelo) q5NobreakModelo.value = "";                    // limpa modelo do nobreak
  if (q5NobreakQtd) q5NobreakQtd.value = "";                          // limpa quantidade de nobreaks
  if (q5SerralheriaDescricao) q5SerralheriaDescricao.value = "";      // limpa descrição da serralheria
  if (q5InstalacaoEletricaObs) q5InstalacaoEletricaObs.value = "";    // limpa observações da instalação elétrica

  if (infraListaMateriaisTbody) {                    // verifica se o corpo da tabela de materiais de infraestrutura existe
    limparTabelaMateriaisInfra();                    // limpa a lista de materiais, deixando apenas uma linha vazia pronta para uso
  }
  
  // Imagens
  if (imgRef1) imgRef1.value = "";
  if (imgRef2) imgRef2.value = "";

  // Pré-requisitos
  if (preTrabalhoAltura) preTrabalhoAltura.value = "";
  if (prePlataforma) prePlataforma.value = "";
  if (prePlataformaModelo) {
    prePlataformaModelo.classList.add("invisible-keep-space");
  }
  if (prePlataformaDias) prePlataformaDias.value = "";
  if (preForaHorario) preForaHorario.value = "";
  if (preVeiculoNortetel) preVeiculoNortetel.value = "";
  if (preContainer) preContainer.value = "";

  // Horas - dias normais (Tabela 4)
  if (encarregadoDiasInput) encarregadoDiasInput.value = "";                 // limpa dias de encarregado
  if (instaladorDiasInput) instaladorDiasInput.value = "";                   // limpa dias de instalador
  if (auxiliarDiasInput) auxiliarDiasInput.value = "";                       // limpa dias de auxiliar
  if (tecnicoInstalacaoDiasInput) tecnicoInstalacaoDiasInput.value = "";     // limpa dias do técnico de instalação
  if (tecnicoSegurancaDiasInput) tecnicoSegurancaDiasInput.value = "";       // limpa dias do técnico em segurança

  // Horas extras por função
  if (encarregadoHoraExtraInput) encarregadoHoraExtraInput.value = "";                 // limpa horas extras do encarregado
  if (instaladorHoraExtraInput) instaladorHoraExtraInput.value = "";                   // limpa horas extras do instalador
  if (auxiliarHoraExtraInput) auxiliarHoraExtraInput.value = "";                       // limpa horas extras do auxiliar
  if (tecnicoInstalacaoHoraExtraInput) tecnicoInstalacaoHoraExtraInput.value = "";     // limpa horas extras do técnico de instalação
  if (tecnicoSegurancaHoraExtraInput) tecnicoSegurancaHoraExtraInput.value = "";       // limpa horas extras do técnico em segurança

  // Trabalho em domingos/feriados por função
  if (encarregadoDomingoInput) encarregadoDomingoInput.value = "";                 // limpa domingos/feriados do encarregado
  if (instaladorDomingoInput) instaladorDomingoInput.value = "";                   // limpa domingos/feriados do instalador
  if (auxiliarDomingoInput) auxiliarDomingoInput.value = "";                       // limpa domingos/feriados do auxiliar
  if (tecnicoInstalacaoDomingoInput) tecnicoInstalacaoDomingoInput.value = "";     // limpa domingos/feriados do técnico de instalação
  if (tecnicoSegurancaDomingoInput) tecnicoSegurancaDomingoInput.value = "";       // limpa domingos/feriados do técnico em segurança

  // Prazos
  if (cronogramaExecucaoSelect) cronogramaExecucaoSelect.value = "";           // reseta o select de cronograma
  if (diasInstalacaoInput) diasInstalacaoInput.value = "";                     // limpa dias de instalação
  if (asBuiltSelect) asBuiltSelect.value = "";                                  // reseta o select de As Built
  if (diasEntregaRelatorioInput) diasEntregaRelatorioInput.value = "";         // limpa prazo de entrega do relatório
  if (artSelect) artSelect.value = "";                                          // reseta o select de ART

  // Alimentação
  if (almocoQtdInput) almocoQtdInput.value = "";                                // limpa quantidade de almoços
  if (lancheQtdInput) lancheQtdInput.value = "";                                // limpa quantidade de lanches

}

// Converte um <select> com opções "sim" / "nao" em um boolean ou null
function selectSimNaoParaBoolean(selectEl) {                     // recebe a referência do elemento select
  if (!selectEl) return null;                                    // se o elemento não existir, devolve null (mais seguro)
  const valor = selectEl.value;                                  // lê o valor selecionado no select

  if (valor === "sim") return true;                              // se for "sim", devolve true
  if (valor === "nao") return false;                             // se for "nao", devolve false
  return null;                                                   // se estiver vazio ou outro valor, devolve null
}

// Preenche um <select> "sim" / "nao" a partir de um boolean (true/false/null)
function booleanParaSelectSimNao(selectEl, valor) {              // recebe o select e o valor booleano vindo da API
  if (!selectEl) return;                                         // se o elemento não existir, não faz nada
  if (valor === true) {                                          // se o valor for true...
    selectEl.value = "sim";                                      // ...seleciona "sim"
  } else if (valor === false) {                                  // se o valor for false...
    selectEl.value = "nao";                                      // ...seleciona "nao"
  } else {                                                       // se for null/undefined
    selectEl.value = "";                                         // deixa o select sem seleção
  }
}

// Função genérica para atualizar a visibilidade de campos "Outro"        // comentário explicando a finalidade da função
// baseada em um <select> que possui uma opção com valor "outro"          // esclarece a regra de negócio usada para mostrar/esconder
function atualizarVisibilidadeCampoOutro(                                  // declara a função genérica que será reutilizada
  selectElement,                                                           // parâmetro: elemento <select> que controla a escolha
  wrapperElement,                                                          // parâmetro: wrapper (.form-group/.form-row) do campo "Outro"
  inputOutroElement                                                        // parâmetro: input de texto associado à opção "outro"
) {
  if (!selectElement || !wrapperElement) return;                           // se não existir select ou wrapper, sai sem fazer nada

  const valorSelecionado = selectElement.value;                            // obtém o valor atualmente selecionado no <select>

  if (valorSelecionado === "outro") {                                      // se o valor selecionado for exatamente "outro"
    wrapperElement.classList.remove("hidden");                             // remove a classe "hidden" para exibir o campo "Outro"
  } else {                                                                 // para qualquer outro valor (inclusive vazio)
    wrapperElement.classList.add("hidden");                                // adiciona a classe "hidden" para esconder o campo "Outro"

    if (inputOutroElement) {                                               // se o input de texto de "Outro" foi informado
      inputOutroElement.value = "";                                        // limpa o texto digitado anteriormente para evitar lixo
    }                                                                      // fim do if inputOutroElement
  }                                                                        // fim do if/else de valorSelecionado
}                                                                          // fim da função atualizarVisibilidadeCampoOutro

// Atualiza a visibilidade do campo
function atualizarVisibilidadeNvrdvr() {                           // declara a função que controla o campo de fornecedor
  if (!q4NvrDvr || !q4NvrDvrModeloWrapper) return;                   // se não houver o select de novo switch ou o wrapper, sai sem fazer nada

  const valor = q4NvrDvr.value;                                // lê o valor atual do select "Necessita novo switch?"

  if (valor === "sim") {                                           // se o usuário marcou "Sim"
    q4NvrDvrModeloWrapper.classList.remove("invisible-keep-space");                    // mostra o campo "Fornecedor do switch"
  } else {                                                                   // se marcou "Não" ou deixou vazio
    q4NvrDvrModeloWrapper.classList.add("invisible-keep-space");                       // esconde o campo "Fornecedor do switch"
    if (q4NvrDvrModelo) {                                                // se o select de fornecedor existir
      q4NvrDvrModelo.value = "";                                         // limpa a seleção de fornecedor ao esconder o campo
    }
  }
}

function atualizarVisibilidadeCamera(){

  if (!q4Camera || !q4CameraNovaWrapper || !q4CameraModeloWrapper || !q4CameraQtdWrapper) return;                   // se não houver o select de novo switch ou o wrapper, sai sem fazer nada

  const valor = q4Camera.value;                                // lê o valor atual do select "Necessita novo switch?"

  if (valor === "sim") {                                           // se o usuário marcou "Sim"
    q4CameraModeloWrapper.classList.remove("invisible-keep-space");                    // mostra o campo "Fornecedor do switch"
    q4CameraQtdWrapper.classList.remove("invisible-keep-space");                    // mostra o campo "Fornecedor do switch"
    q4CameraNovaWrapper.classList.add("invisible-keep-space")
    if (q4CameraNova){
      q4CameraNova.value = "";
    }
  } else {                                                                   // se marcou "Não" ou deixou vazio
    q4CameraNovaWrapper.classList.remove("invisible-keep-space")
    q4CameraModeloWrapper.classList.add("invisible-keep-space");                       // esconde o campo "Fornecedor do switch"
    q4CameraQtdWrapper.classList.add("invisible-keep-space");
    if (q4CameraModeloWrapper) {                                                // se o select de fornecedor existir
      q4CameraModelo.value = "";                                         // limpa a seleção de fornecedor ao esconder o campo
    }
    if (q4CameraQtdWrapper) {                                                // se o select de fornecedor existir
      q4CameraQtd.value = "";                                         // limpa a seleção de fornecedor ao esconder o campo
    }
        
  }
}

function atualizarVisibilidadeFornecedorSwitch() {                           // declara a função que controla o campo de fornecedor
  if (!q2NovoSwitch || !q2FornecedorSwitchWrapper) return;                   // se não houver o select de novo switch ou o wrapper, sai sem fazer nada

  const valorNovoSwitch = q2NovoSwitch.value;                                // lê o valor atual do select "Necessita novo switch?"

  if (valorNovoSwitch === "sim") {                                           // se o usuário marcou "Sim"
    q2FornecedorSwitchWrapper.classList.remove("invisible-keep-space");                    // mostra o campo "Fornecedor do switch"
  } else {                                                                   // se marcou "Não" ou deixou vazio
    q2FornecedorSwitchWrapper.classList.add("invisible-keep-space");                       // esconde o campo "Fornecedor do switch"
    if (q2FornecedorSwitch) {                                                // se o select de fornecedor existir
      q2FornecedorSwitch.value = "";                                         // limpa a seleção de fornecedor ao esconder o campo
    }
  }
}

// Atualiza a visibilidade do campo "Outro" do cliente usando a função genérica // comentário descrevendo a função específica
function atualizarVisibilidadeClienteOutro() {                             // declara a função específica para o cliente
  // atualizarVisibilidadeCampoOutro(                                         // chama a função genérica de visibilidade
  //   clienteNomeInput,                                                      // passa o <select> de cliente como primeiro parâmetro
  //   clienteOutroWrapper,                                                   // passa o wrapper do campo "Outro" de cliente
  //   clienteNomeOutroInput                                                  // passa o input de texto para "Outro" (nome do cliente)
  // );                                                                    // fim da chamada à função genérica
  if (!clienteNomeInput || !clienteOutroWrapper) return;                                 // se não houver select ou wrapper, sai sem fazer nada

  const valorNovoCliente = clienteNomeInput.value;                                          // lê o valor selecionado em "Necessário novo DIO?"

  if (valorNovoCliente === "outro") {                                                  // se o usuário marcou "Sim"
    clienteOutroWrapper.classList.remove("invisible-keep-space");                               // mostra o campo "Modelo do DIO"
  } else {                                                                       // se marcou "Não" ou deixou em branco
    clienteOutroWrapper.classList.add("invisible-keep-space");                                  // esconde o campo de modelo
    if (clienteNomeOutroInput) {                                                           // se o input de modelo existir
      clienteNomeOutroInput.value = "";                                                    // limpa qualquer texto digitado
    }
  }

}                                                                          // fim da função atualizarVisibilidadeClienteOutro

// Atualiza a visibilidade do campo "Qtd. de guias de cabos"                     // comentário explicando a função
function atualizarVisibilidadeQtdGuiasCabos() {                                  // declara a função responsável por mostrar/esconder a quantidade
  if (!q1IncluirGuia || !q1QtdGuiasCabosWrapper) return;                         // se não houver select ou wrapper, sai sem fazer nada

  const valorIncluir = q1IncluirGuia.value;                                      // lê o valor atual do select "Incluir guia de cabos?"

  if (valorIncluir === "sim") {                                                  // se o usuário marcou "Sim"
    q1QtdGuiasCabosWrapper.classList.remove("invisible-keep-space");                           // mostra o bloco de quantidade de guias de cabos
  } else {                                                                       // se marcou "Não" ou deixou vazio
    q1QtdGuiasCabosWrapper.classList.add("invisible-keep-space");                              // esconde o bloco de quantidade de guias de cabos
    if (q1QtdGuiasCabos) {                                                       // se o input numérico existir
      q1QtdGuiasCabos.value = "";                                                // limpa o valor digitado, para não enviar lixo para a API
    }
  }
}

// Atualiza a visibilidade da linha de modelo de patch panel quando o usuário escolhe se precisa de novo patch panel
function atualizarVisibilidadeModeloPatchPanel() {               // declara a função responsável por mostrar/esconder a linha de modelo do patch panel
  if (!q1ModeloPatchPanelWrapper || !q1NovoPatch) return;            // se não existir a linha de modelo ou o select "Necessita novo patch panel?", sai sem fazer nada

  const valor = q1NovoPatch.value;                               // lê o valor atual do select "Necessita novo patch panel?"

  if (valor === "sim") {                                         // se o usuário marcou que precisa de novo patch panel
    q1ModeloPatchPanelWrapper.classList.remove("invisible-keep-space");            // mostra a linha com o select de modelo de patch panel
  } else {                                                       // se marcou "não" ou deixou em branco
    q1ModeloPatchPanelWrapper.classList.add("invisible-keep-space");               // esconde a linha de modelo de patch panel
    if (q1ModeloPatchPanel) q1ModeloPatchPanel.value = "";       // limpa o select de modelo, se existir
    if (q1ModeloPatchPanelOutroInput) {                          // se existir o input de "Outro" para o modelo
      q1ModeloPatchPanelOutroInput.value = "";                   // limpa o texto digitado anteriormente
    }
    if (q1ModeloPatchPanelOutroWrapper) {                        // se existir o wrapper do campo "Outro"
      q1ModeloPatchPanelOutroWrapper.classList.add("invisible-keep-space");    // garante que o campo "Outro" fique oculto
    }
  }
}                                                                // fim da função atualizarVisibilidadeModeloPatchPanel

function atualizarVisibilidadeModeloPlataforma() {
  if (!prePlataforma || !prePlataformaModelo) return;

  const valor = prePlataforma.value;                       

  if (valor === "sim") {                                 
    prePlataformaModelo.classList.remove("invisible-keep-space");
  } else {                                                      
    prePlataformaModelo.classList.add("invisible-keep-space");
    if (prePlataformaModelo) prePlataformaModelo.value = "";       
  }
}    

// Atualiza a visibilidade do campo "Outro" do modelo de patch panel
function atualizarVisibilidadeModeloPatchPanelOutro() {          // declara a função responsável por mostrar/esconder o campo "Outro" do modelo
  if (!q1ModeloPatchPanel || !q1ModeloPatchPanelOutroWrapper) return; // se não houver o select de modelo ou o wrapper do campo "Outro", sai

  const valorModelo = q1ModeloPatchPanel.value;                  // lê o valor atualmente selecionado no select de modelo
  if (valorModelo === "outro") {                                 // se o usuário escolheu a opção "Outro"
    q1ModeloPatchPanelOutroWrapper.classList.remove("invisible-keep-space");   // mostra o grupo de campo de texto para descrever o modelo
  } else {                                                       // se escolheu qualquer outra opção
    q1ModeloPatchPanelOutroWrapper.classList.add("invisible-keep-space");      // esconde o campo "Outro"
    if (q1ModeloPatchPanelOutroInput) {                          // se o input de "Outro" existir
      q1ModeloPatchPanelOutroInput.value = "";                   // limpa o texto digitado anteriormente
    }
  }
}                                                                // fim da função atualizarVisibilidadeModeloPatchPanelOutro                                                                    // fim da função atualizarVisibilidadeModeloPatchPanelOutro

// Atualiza a visibilidade do campo "Outro" para a marca do cabeamento UTP  // comentário explicando o objetivo da função
function atualizarVisibilidadeMarcaCabOutro() {                            // declara a função específica para marca do cabeamento                                                                      // fim da chamada à função genérica
  if (!q1MarcaCab || !q1MarcaCabOutroWrapper) return; // se não houver o select de modelo ou o wrapper do campo "Outro", sai

  const valor = q1MarcaCab.value;                  // lê o valor atualmente selecionado no select de modelo
  if (valor === "outro") {                                 // se o usuário escolheu a opção "Outro"
    q1MarcaCabOutroWrapper.classList.remove("invisible-keep-space");   // mostra o grupo de campo de texto para descrever o modelo
  } else {                                                       // se escolheu qualquer outra opção
    q1MarcaCabOutroWrapper.classList.add("invisible-keep-space");      // esconde o campo "Outro"
    if (q1MarcaCabOutroInput) {                          // se o input de "Outro" existir
      q1MarcaCabOutroInput.value = "";                   // limpa o texto digitado anteriormente
    }
  }
}                                                                          // fim da função atualizarVisibilidadeMarcaCabOutro

// Atualiza a visibilidade do campo "Outro" para a marca do cabo óptico      // explica a finalidade da função
function atualizarVisibilidadeMarcaCaboOpticoOutro() {                       // declara a função específica para marca de cabo óptico                                                                    // fim da chamada à função genérica

  if (!q3MarcaCabOptico || !q3MarcaCabOpticoOutroWrapper) return;                                 // se não houver select ou wrapper, sai sem fazer nada

  const valor = q3MarcaCabOptico.value;                                          // lê o valor selecionado em "Necessário novo DIO?"

  if (valor === "outro") {                                                  // se o usuário marcou "Sim"
    q3MarcaCabOpticoOutroWrapper.classList.remove("invisible-keep-space");                               // mostra o campo "Modelo do DIO"
  } else {                                                                       // se marcou "Não" ou deixou em branco
    q3MarcaCabOpticoOutroWrapper.classList.add("invisible-keep-space");                                  // esconde o campo de modelo
    if (q3MarcaCabOpticoOutroInput) {                                                           // se o input de modelo existir
      q3MarcaCabOpticoOutroInput.value = "";                                                    // limpa qualquer texto digitado
    }
  }

}

// Atualiza a visibilidade do campo "Modelo do DIO"                               // explica a função
function atualizarVisibilidadeModeloDio() {                                      // declara a função responsável pelo modelo do DIO
  if (!q3NovoDio || !q3ModeloDioWrapper) return;                                 // se não houver select ou wrapper, sai sem fazer nada

  const valorNovoDio = q3NovoDio.value;                                          // lê o valor selecionado em "Necessário novo DIO?"

  if (valorNovoDio === "sim") {                                                  // se o usuário marcou "Sim"
    q3ModeloDioWrapper.classList.remove("invisible-keep-space");                               // mostra o campo "Modelo do DIO"
  } else {                                                                       // se marcou "Não" ou deixou em branco
    q3ModeloDioWrapper.classList.add("invisible-keep-space");                                  // esconde o campo de modelo
    if (q3ModeloDio) {                                                           // se o input de modelo existir
      q3ModeloDio.value = "";                                                    // limpa qualquer texto digitado
    }
  }
}

// Converte o valor de um <input type="number"> em inteiro ou null
function intOrNullFromInput(inputEl) {                      // recebe o elemento de input numérico
  if (!inputEl) return null;                                // se não existir (ID errado, por ex.), devolve null
  const raw = (inputEl.value || "").trim();                 // lê o valor do input como string e remove espaços

  if (raw === "") return null;                              // se estiver vazio, devolve null (para o backend virar None)

  const parsed = parseInt(raw, 10);                         // tenta converter para inteiro na base 10
  if (Number.isNaN(parsed)) {                               // se a conversão falhar...
    return null;                                            // devolve null (em vez de mandar lixo para a API)
  }

  return parsed;                                            // se deu certo, devolve o número inteiro
}

// Converte o valor de um <input type="number"> em float ou null
function floatOrNullFromInput(inputEl) {                    // recebe o input que deve virar número decimal
  if (!inputEl) return null;                                // se não existir, devolve null
  const raw = (inputEl.value || "").trim();                 // lê string do input

  if (raw === "") return null;                              // campo vazio => null

  const parsed = parseFloat(raw.replace(",", "."));         // converte para float (troca vírgula por ponto, se o navegador permitir)
  if (Number.isNaN(parsed)) {                               // se não for um número válido...
    return null;                                            // devolve null
  }

  return parsed;                                            // devolve o número decimal válido
}
//tipo_formulario
/**
 * Aplica visibilidade das seções de formulário e estado visual das abas
 * com base no tipo de formulário selecionado.
 *
 * Tipos principais esperados:
 * - "utp_fibra"  → formulário de UTP e Fibra Óptica
 * - "cameras"    → formulário de Câmeras
 *
 * Também aceita valores legados:
 * - "redes"         → tratado como "utp_fibra"
 * - "infraestrutura" / "infra" → tratados como "cameras"
 */
function aplicarVisibilidadeTipoFormulario(tipo) {                        // recebe uma string indicando o tipo de formulário
  const tipoNormalizado = (tipo || "")                                    // garante que tipo seja uma string
    .toString()                                                           // converte para string, caso venha como outro tipo
    .toLowerCase();                                                       // normaliza para minúsculas

  const ehUTPFibra =
    tipoNormalizado === "utp_fibra" ||                                    // tipo novo padrão para UTP/Fibra
    tipoNormalizado === "utp-fibra" ||                                    // variação com hífen
    tipoNormalizado === "utp" ||                                          // forma abreviada
    tipoNormalizado === "redes";                                          // valor legado "redes"

  const ehCameras =
    tipoNormalizado === "cameras" ||                                      // tipo novo padrão para Câmeras
    tipoNormalizado === "câmeras" ||                                      // variação com acento
    tipoNormalizado === "infraestrutura" ||                               // valor legado "infraestrutura"
    tipoNormalizado === "infra";                                          // abreviação legada "infra"

  // Atualiza estado visual das abas (botões)
  if (tabButtons && tabButtons.length > 0) {                              // garante que exista ao menos uma aba no DOM
    tabButtons.forEach((btn) => {                                         // percorre cada botão de aba
      const btnTipo = (btn.dataset.tipo || "")                            // lê o atributo data-tipo da aba
        .toString()                                                       // garante string
        .toLowerCase();                                                   // normaliza para minúsculas

      const ehAbaUTPFibra =
        btnTipo === "utp_fibra" || btnTipo === "utp-fibra" || btnTipo === "utp"; // mapeia variações para UTP/Fibra
      const ehAbaCameras =
        btnTipo === "cameras" || btnTipo === "câmeras" || btnTipo === "infraestrutura" || btnTipo === "infra"; // variações para Câmeras

      const deveFicarAtiva =
        (ehAbaUTPFibra && ehUTPFibra) ||                                  // aba UTP/Fibra ativa quando tipo é UTP/Fibra
        (ehAbaCameras && ehCameras);                                      // aba Câmeras ativa quando tipo é Câmeras

      if (deveFicarAtiva) {                                               // se esta aba for a correspondente ao tipo atual
        btn.classList.add("active");                                      // marca visualmente como ativa
      } else {                                                            // caso contrário
        btn.classList.remove("active");                                   // remove o estado ativo
      }
    });
  }

  // Se não identificou claramente o tipo, mostra tudo
  if (!ehUTPFibra && !ehCameras) {                                        // se não conseguimos classificar o tipo
    if (blocosTipoRedes) {                                                // e existirem blocos de UTP/Fibra
      blocosTipoRedes.forEach((bloco) => bloco.classList.remove("hidden"));// garante que todos apareçam
    }
    if (blocosTipoCamera) {                                                // se existirem blocos de Câmeras/Infra
      blocosTipoCamera.forEach((bloco) => bloco.classList.remove("hidden"));// também garante visibilidade
    }
    return;                                                               // encerra a função porque não há mais nada a aplicar
  }

  // Exibe ou oculta blocos do tipo UTP/Fibra (legado "Redes")
  if (blocosTipoRedes) {                                                  // se a NodeList de blocos UTP/Fibra existir
    blocosTipoRedes.forEach((bloco) => {                                  // percorre cada bloco
      if (ehUTPFibra) {                                                   // se o tipo atual for UTP/Fibra
        bloco.classList.remove("hidden");                                 // garante que o bloco fique visível
      } else {                                                            // se o tipo atual não for UTP/Fibra
        bloco.classList.add("hidden");                                    // esconde o bloco adicionando a classe hidden
      }
    });
  }

  // Exibe ou oculta blocos do tipo Câmeras (legado "Infraestrutura")
  if (blocosTipoCamera) {                                                  // se a NodeList de blocos Câmeras existir
    blocosTipoCamera.forEach((bloco) => {                                  // percorre cada bloco
      if (ehCameras) {                                                    // se o tipo atual for Câmeras
        bloco.classList.remove("hidden");                                 // mostra os blocos de Câmeras
      } else {                                                            // se não for tipo Câmeras
        bloco.classList.add("hidden");                                    // esconde os blocos adicionando a classe hidden
      }
    });
  }
}

//tipo_formulario

/**
 * Coleta o estado atual do formulário de avaliação e monta um objeto de rascunho.
 * O objetivo é conseguir restaurar depois exatamente o que o usuário digitou.
 */
function coletarEstadoFormularioComoRascunho() {
  if (!formAvaliacao) { // se o formulário não existir na página
    return null; // não há o que coletar, devolve null
  }

  const campos = formAvaliacao.querySelectorAll("input, select, textarea"); // seleciona todos os campos de entrada do formulário
  const valores = {}; // objeto que guardará os valores indexados pelo id de cada campo

  campos.forEach((campo) => { // percorre cada campo encontrado na NodeList
    if (!campo.id) { // se o campo não tiver um id definido
      return; // ignora este campo, pois não teremos como mapeá-lo depois
    }

    if (campo.type === "checkbox") { // se o campo for um checkbox
      valores[campo.id] = campo.checked; // armazena um booleano indicando se o checkbox está marcado
      return; // segue para o próximo campo da lista
    }

    valores[campo.id] = campo.value; // para inputs de texto, selects e textareas, salva o valor textual do campo

  });

  if (formularioRascunhoEstaVazio(valores)) {                    // verifica se, pelos valores coletados, o formulário está vazio
    return null;                                                 // se estiver vazio, não faz sentido criar/atualizar rascunho, devolve null
  }
    console.log(
    "[RASCUNHO][DEBUG] Valores coletados do formulário para rascunho:",
    valores
  );                                                       // mostra no console o objeto completo de valores antes da verificação de vazio

  if (formularioRascunhoEstaVazio(valores)) {              // usa o helper para verificar se o formulário está efetivamente vazio
    console.log(
      "[RASCUNHO][DEBUG] Formulário considerado vazio. Não será criado/atualizado rascunho."
    );                                                     // registra no console que nenhum rascunho será gerado
    return null;                                           // devolve null para indicar que não há rascunho a ser salvo
  }

  const tipoFormularioAtual = tipoFormularioInput // pega o input hidden que guarda o tipo de formulário
    ? (tipoFormularioInput.value || "utp_fibra") // usa o valor atual ou "utp_fibra" como padrão se estiver vazio
    : "utp_fibra"; // se por algum motivo o hidden não existir, assume "utp_fibra" como valor padrão

  let rotuloCliente = "Cliente não informado"; // rótulo padrão caso nenhum cliente esteja preenchido

  const listaMateriaisInfra = coletarListaMateriaisInfraDoFormulario(); // coleta a lista de materiais de infraestrutura a partir da tabela dinâmica do formulário

  if (clienteNomeInput) { // se o select de cliente existir
    const valorSelect = clienteNomeInput.value || ""; // lê o valor selecionado no combo de cliente

    if (valorSelect === "outro") { // se o usuário escolheu a opção "Outro"
      const textoOutro =
        clienteNomeOutroInput && clienteNomeOutroInput.value // verifica se o input de "Outro" existe e tem valor
          ? clienteNomeOutroInput.value.trim() // remove espaços extras do texto digitado
          : ""; // caso não tenha valor, usa string vazia

      if (textoOutro) { // se o usuário realmente digitou algo no campo "Outro"
        rotuloCliente = textoOutro; // usa o texto digitado como rótulo amigável do rascunho
      }
    } else if (valorSelect) { // se alguma opção fixa foi selecionada no combo
      rotuloCliente = valorSelect; // usa diretamente o valor do select como rótulo
    }
  }

  // window.alert("id: " + rascunhoEmEdicaoId + " ; " 
  //   + "tipo_formulario: " + tipoFormularioAtual + " ; "
  //   + "rotulo: " + rotuloCliente + " ; "
  //   + "form_values: " + valores + " ; "
  //   + "avaliacao_id: " + avaliacaoEmEdicaoId + " ; ");
  // Descobre qual id de rascunho deve ser usado.
  // Primeiro tentamos usar a variável global rascunhoEmEdicaoId.
  // Se por algum motivo ela estiver vazia, usamos o dataset do formulário,
  // que é atualizado sempre que um rascunho é carregado ou salvo.
  // let idRascunhoAtual = rascunhoEmEdicaoId || null; // usa o valor atual da variável global, se existir

  // if ((!idRascunhoAtual || idRascunhoAtual === "null") && formAvaliacao && formAvaliacao.dataset) { // se não houver id válido na variável global, tenta buscar no dataset do formulário
  //   const idDoDataset = formAvaliacao.dataset.rascunhoId || ""; // lê o atributo data-rascunho-id armazenado no formulário
  //   if (idDoDataset) { // se existir algum valor preenchido no dataset
  //     idRascunhoAtual = idDoDataset; // passa a usar este valor como id do rascunho atual
  //   }
  // }

  // Descobre o id do rascunho atual.
  // 1) Tenta ler do input hidden rascunho-id (fonte principal).
  // 2) Se estiver vazio, cai para a variável global rascunhoEmEdicaoId.
  // 3) Se ainda assim não houver id, gera um novo id "draft-<timestamp>".
  let idRascunhoAtual = null; // começa sem id definido

  if (rascunhoIdInput && rascunhoIdInput.value) { // se o input hidden existir e tiver algum valor
    idRascunhoAtual = rascunhoIdInput.value; // usa o valor do campo oculto como id do rascunho
  } else if (rascunhoEmEdicaoId) { // caso contrário, se a variável global tiver algum valor
    idRascunhoAtual = rascunhoEmEdicaoId; // usa o valor global como fallback
  }

  // Se ainda não houver um id definido, significa que este é um rascunho novo.
  // Nesse caso, geramos um id estável agora, para que a partir deste salvamento em diante
  // o mesmo id seja reaproveitado (tanto no storage quanto no formulário).
  if (!idRascunhoAtual) { // se ainda não temos id (primeiro salvamento do rascunho)
    idRascunhoAtual = "draft-" + Date.now(); // cria um id simples e único baseado no timestamp atual

    // Atualiza também as fontes de verdade para os próximos salvamentos:
    rascunhoEmEdicaoId = idRascunhoAtual; // guarda o id na variável global
    if (rascunhoIdInput) { // se o input hidden existir na página
      rascunhoIdInput.value = idRascunhoAtual; // grava o id recém-gerado no campo oculto
    }
    if (formAvaliacao && formAvaliacao.dataset) { // se o formulário suportar dataset
      formAvaliacao.dataset.rascunhoId = idRascunhoAtual; // sincroniza também no dataset, se você estiver usando
    }
  }

  // (opcional, pra debug) — aqui você pode ver o id REAL que vai ser usado:
  // window.alert(
  //   "idRascunhoAtual: " +
  //     idRascunhoAtual +
  //     " ; rascunhoEmEdicaoId: " +
  //     rascunhoEmEdicaoId
  // ); // alerta para ajudar no debug da origem do id

  const base = {
    id: idRascunhoAtual, // usa o id descoberto (hidden ou global) para o rascunho
    tipo_formulario: tipoFormularioAtual, // salva o tipo de formulário (UTP/Fibra ou Câmeras) para futura restauração
    rotulo: rotuloCliente, // rótulo amigável para exibir na lista de rascunhos
    form_values: valores, // objeto contendo todos os valores dos campos do formulário (mapeados por id)
    lista_materiais_infra: listaMateriaisInfra, // armazena a lista de materiais de infraestrutura coletada da tabela dinâmica
    avaliacao_id: avaliacaoEmEdicaoId, // se estivermos editando uma avaliação existente, associa o id da avaliação
  }; // fecha o objeto base de rascunho


  return base; // devolve o objeto de rascunho montado
}

/**
 * Salva o estado atual do formulário como rascunho local no navegador.
 * Usa os helpers de localStorage criados na Etapa 1.
 */
function salvarRascunhoAtual() {
  if (!formAvaliacao) { // se o formulário não existir na tela
    return; // não há rascunho a ser salvo, encerra a função
  }

  const base = coletarEstadoFormularioComoRascunho(); // monta o objeto de rascunho a partir dos campos atuais

  console.log(
    "[RASCUNHO][DEBUG] salvarRascunhoAtual - base retornada:",
    base
  );                                                       // mostra no console qual objeto de rascunho foi montado (ou null)
  
  if (!base) { // se por algum motivo não foi possível montar o rascunho
    console.log(
      "[RASCUNHO][DEBUG] salvarRascunhoAtual - base nula. Nenhum rascunho será salvo (provavelmente formulário vazio).")    
    if (avaliacaoFeedbackEl) { // garante que o elemento de feedback exista antes de usar
      avaliacaoFeedbackEl.textContent =
        "Preencha pelo menos um campo antes de salvar o rascunho."; // orienta o usuário de que é necessário preencher algo para salvar rascunho
      avaliacaoFeedbackEl.className = "form-feedback form-error"; // aplica estilo de erro na área de feedbackfunction salvarRascunhoAtual() {
    }
    return; // encerra a função, pois não há rascunho válido
  }

  try {
    const rascunhoSalvo = salvarOuAtualizarRascunhoLocal(base); // chama o helper que cria/atualiza o rascunho no localStorage
    
    console.log(
      "[RASCUNHO][DEBUG] salvarRascunhoAtual - rascunho salvo/atualizado:",
      rascunhoSalvo
    );                                                     // registra no console o conteúdo completo do rascunho persistido
    
    rascunhoEmEdicaoId = rascunhoSalvo.id; // atualiza a variável global com o id do rascunho recém-salvo

    if (rascunhoIdInput) { // se o input hidden existir
      rascunhoIdInput.value = rascunhoSalvo.id; // grava o id do rascunho salvo no campo oculto
    }
    
    if (formAvaliacao && formAvaliacao.dataset) { // se o formulário existir e suportar dataset
      formAvaliacao.dataset.rascunhoId = rascunhoSalvo.id; // sincroniza o id do rascunho atual no dataset do formulário
    }

    if (avaliacaoFeedbackEl) { // se o elemento de feedback estiver disponível
      avaliacaoFeedbackEl.textContent =
        "Rascunho salvo localmente neste dispositivo."; // mensagem de sucesso para o usuário
      avaliacaoFeedbackEl.className = "form-feedback form-success"; // aplica o estilo de sucesso na área de feedback
    }
    //formAvaliacao.reset();
  } catch (error) {
    console.error("Erro ao salvar rascunho local:", error); // registra o erro no console para facilitar debug

    if (avaliacaoFeedbackEl) { // se o elemento de feedback existir
      avaliacaoFeedbackEl.textContent =
        "Erro ao salvar rascunho local. Verifique o espaço disponível no navegador."; // mensagem mais específica de erro de salvamento
      avaliacaoFeedbackEl.className = "form-feedback form-error"; // aplica estilo de erro na área de feedback
    }
  }
}

/**
 * Salva o formulário como rascunho local de forma silenciosa,
 * sem alterar mensagens de feedback na interface.
 * Esta função é usada pelo salvamento automático (autosave).
 */
function salvarRascunhoAutomatico() {
  if (!formAvaliacao) { // se o formulário não existir no DOM
    return; // não há o que salvar, encerra a função imediatamente
  }

  const base = coletarEstadoFormularioComoRascunho(); // monta o objeto de rascunho com os valores atuais dos campos

  console.log(
    "[RASCUNHO][DEBUG] salvarRascunhoAutomatico - base retornada:",
    base
  );                                                       // exibe no console o objeto de rascunho montado (ou null) durante o autosave
  
  if (!base) {                                             // se por algum motivo não foi possível montar o objeto de rascunho (formulário vazio, por exemplo)
    console.log(
      "[RASCUNHO][DEBUG] salvarRascunhoAutomatico - base nula. Autosave não irá criar/atualizar rascunho."
    );                                                     // registra no console que o autosave foi abortado por não haver conteúdo
    return;                                                // não tenta salvar nada e apenas encerra
  }

  try {
    const rascunhoSalvo = salvarOuAtualizarRascunhoLocal(base); // chama o helper que cria/atualiza o rascunho no localStorage

    console.log(
      "[RASCUNHO][DEBUG] salvarRascunhoAutomatico - rascunho salvo/atualizado:",
      rascunhoSalvo
    );                                                     // mostra no console o rascunho persistido automaticamente

    rascunhoEmEdicaoId = rascunhoSalvo.id; // garante que a variável global mantenha o id do rascunho mais recente

    if (rascunhoIdInput) { // se o input hidden existir
      rascunhoIdInput.value = rascunhoSalvo.id; // mantém o id sincronizado no campo oculto
    }

    if (formAvaliacao && formAvaliacao.dataset) { // se o formulário existir na página
      formAvaliacao.dataset.rascunhoId = rascunhoSalvo.id; // atualiza também o dataset com o id do rascunho salvo automaticamente
    }    

    // Nesta função não mostramos nenhuma mensagem na tela,
    // pois ela pode ser chamada com muita frequência (autosave).
  } catch (error) {
    console.error("Erro ao salvar rascunho automático:", error); // registra o erro no console para facilitar debug, mas não altera o UI
  }
}

/**
 * Agenda o salvamento automático do rascunho alguns milissegundos após a última digitação.
 * Usa um "debounce" simples: sempre cancela o timer anterior antes de criar um novo.
 */
function agendarAutoSalvarRascunho() {
  if (!formAvaliacao) { // se o formulário não existir
    return; // não há o que salvar automaticamente
  }

  if (autoSaveTimeoutId !== null) { // se já existir um timer de autosave pendente
    clearTimeout(autoSaveTimeoutId); // cancela o timer anterior para evitar múltiplos salvamentos desnecessários
    autoSaveTimeoutId = null; // reseta a referência do timer
  }

  autoSaveTimeoutId = window.setTimeout(() => { // cria um novo timer para o salvamento automático
    salvarRascunhoAutomatico(); // quando o tempo expirar, salva o rascunho de forma silenciosa
    // Opcionalmente, poderíamos atualizar a lista de rascunhos aqui:
    // renderizarListaRascunhos();
  }, AUTO_SAVE_DELAY_MS); // usa o atraso configurado em AUTO_SAVE_DELAY_MS (por padrão, 2 segundos)
}

/**
 * Formata uma string de data ISO (ex.: "2025-12-09T13:45:00Z")
 * para o formato curto "dd/mm/aaaa HH:MM".
 */
function formatarDataHoraCurta(isoString) {
  if (!isoString) { // se não houver valor informado
    return "-"; // devolve um traço, indicando ausência de informação
  }

  const data = new Date(isoString); // tenta criar um objeto Date a partir da string ISO

  if (Number.isNaN(data.getTime())) { // se a data não for válida
    return isoString; // devolve o texto original para não perder a informação
  }

  const dia = String(data.getDate()).padStart(2, "0"); // extrai o dia do mês e preenche com zero à esquerda
  const mes = String(data.getMonth() + 1).padStart(2, "0"); // extrai o mês (0-11), soma 1 e preenche com zero à esquerda
  const ano = data.getFullYear(); // extrai o ano com 4 dígitos
  const hora = String(data.getHours()).padStart(2, "0"); // extrai a hora (0-23) e preenche com zero à esquerda
  const minuto = String(data.getMinutes()).padStart(2, "0"); // extrai os minutos e preenche com zero à esquerda

  return `${dia}/${mes}/${ano} ${hora}:${minuto}`; // monta a string final no formato desejado
}

/**
 * Preenche o formulário de avaliação a partir de um objeto de rascunho já carregado.
 * Este rascunho contém:
 *  - tipo_formulario
 *  - rotulo
 *  - form_values: mapa id-do-campo => valor (value/checked) capturado na Etapa 2
 *  - avaliacao_id (opcional)
 */
function carregarRascunhoNoFormulario(rascunho) {
  if (!formAvaliacao || !rascunho) { // se o formulário não existir ou o rascunho for inválido
    return; // não há nada a fazer
  }

  // Limpamos o formulário para evitar lixo de uma edição anterior
  resetarFormularioParaNovaAvaliacao(); // usa a função existente para voltar ao estado "Nova Avaliação"

  // Vincula o formulário ao rascunho atual
  rascunhoEmEdicaoId = rascunho.id || null; // guarda o id do rascunho atualmente carregado
  avaliacaoEmEdicaoId = rascunho.avaliacao_id || null; // se este rascunho estiver associado a uma avaliação específica, guarda o id

  if (rascunhoIdInput) { // se o campo oculto existir
    rascunhoIdInput.value = rascunho.id || ""; // grava o id do rascunho carregado no campo hidden
  }

  if (formAvaliacao && formAvaliacao.dataset) { // se o formulário de avaliação existir
    formAvaliacao.dataset.rascunhoId = rascunho.id || ""; // grava o id do rascunho carregado no dataset do formulário
  }

  const tipo = rascunho.tipo_formulario || "utp_fibra"; // garante um tipo de formulário válido (UTP/Fibra como padrão)

  if (tipoFormularioInput) { // se o input hidden de tipo existir
    tipoFormularioInput.value = tipo; // atualiza o valor armazenado no hidden
  }

  aplicarVisibilidadeTipoFormulario(tipo); // atualiza abas e blocos do formulário (UTP/Fibra x Câmeras)

  // Ajusta título e subtítulo para deixar claro que é um rascunho
  if (formTituloEl) { // se o título do formulário estiver disponível
    if (avaliacaoEmEdicaoId) { // se existir um id de avaliação associado
      formTituloEl.textContent = "Edição de avaliação (rascunho local)"; // título indicando edição com rascunho
    } else {
      formTituloEl.textContent = "Nova Avaliação (rascunho local)"; // título indicando nova avaliação a partir de rascunho
    }
  }

  if (formSubtituloEl) { // se o subtítulo do formulário existir
    formSubtituloEl.textContent =
      "Este rascunho está salvo apenas neste dispositivo e ainda não foi enviado ao servidor."; // texto explicando a natureza local do rascunho
  }

  const valores = rascunho.form_values || {}; // obtém o mapa de valores dos campos (id => valor) salvo no rascunho

  const listaMateriaisInfra =
    Array.isArray(rascunho.lista_materiais_infra) // verifica se o rascunho possui uma lista de materiais de infraestrutura e se ela é um array válido
      ? rascunho.lista_materiais_infra // se for um array, usa diretamente a lista salva
      : []; // caso contrário (rascunhos antigos), utiliza um array vazio para manter a compatibilidade

  preencherListaMateriaisInfraAPartirDeDados(listaMateriaisInfra); // recria as linhas da tabela de materiais de infraestrutura a partir da lista vinda do rascunho

  Object.keys(valores).forEach((campoId) => { // percorre cada id de campo salvo no rascunho
    const campo = document.getElementById(campoId); // tenta localizar o elemento correspondente no DOM
    if (!campo) { // se o elemento não existir (campo removido ou renomeado)
      return; // simplesmente ignora esse campo
    }

    const valor = valores[campoId]; // obtém o valor salvo para este campo

    if (campo.type === "checkbox") { // se o campo for um checkbox
      campo.checked = !!valor; // marca ou desmarca o checkbox com base em um booleano
    } else {
      campo.value = valor != null ? valor : ""; // para outros tipos de campo, define o value (ou string vazia se null/undefined)
    }
  });

  // Depois de aplicar os valores brutos nos campos,
  // reaplicamos as lógicas de visibilidade que normalmente são disparadas
  // pelos eventos "change" dos selects/inputs.
  if (typeof atualizarVisibilidadeClienteOutro === "function") { // se a função específica do cliente existir
    atualizarVisibilidadeClienteOutro(); // garante que o campo "Cliente (Outro)" apareça/esconda conforme o valor atual do select
  }
  if (typeof atualizarVisibilidadeMarcaCabOutro === "function") { // se a função de marca de cabeamento UTP existir
    atualizarVisibilidadeMarcaCabOutro(); // ajusta visibilidade do campo "Outro" de marca de cabeamento UTP
  }
  if (typeof atualizarVisibilidadeMarcaCaboOpticoOutro === "function") { // se a função de marca de cabo óptico existir
    atualizarVisibilidadeMarcaCaboOpticoOutro(); // ajusta visibilidade do campo "Outro" de marca de cabo óptico
  }
  if (typeof atualizarVisibilidadeModeloPatchPanel === "function") { // se a função de modelo de patch panel existir
    atualizarVisibilidadeModeloPatchPanel(); // atualiza a visibilidade/estado relacionado ao modelo de patch panel
  }
  if (typeof atualizarVisibilidadeModeloPatchPanelOutro === "function") { // se a função de "modelo patch panel - Outro" existir
    atualizarVisibilidadeModeloPatchPanelOutro(); // atualiza a visibilidade do campo "Outro" para modelo de patch panel
  }
  if (typeof atualizarVisibilidadeModeloDio === "function") { // se a função de modelo de DIO existir
    atualizarVisibilidadeModeloDio(); // ajusta visibilidade do modelo de DIO conforme seleção atual
  }
  if (typeof atualizarVisibilidadeCamera === "function") { // se a função de visibilidade de câmera existir
    atualizarVisibilidadeCamera(); // ajusta visibilidades na seção de câmeras (novo x realocação, etc.)
  }
  if (typeof atualizarVisibilidadeNvrdvr === "function") { // se a função de visibilidade de NVR/DVR existir
    atualizarVisibilidadeNvrdvr(); // ajusta campos de NVR/DVR de acordo com o estado atual
  }
  if (typeof atualizarVisibilidadeFornecedorSwitch === "function") { // se a função de fornecedor de switch existir
    atualizarVisibilidadeFornecedorSwitch(); // ajusta campos relacionados ao fornecedor/modelo de switch
  }
  if (typeof atualizarVisibilidadeModeloPlataforma === "function") { // se a função de modelo de plataforma existir
    atualizarVisibilidadeModeloPlataforma(); // reaplica visibilidade nas opções de plataforma de pré-requisitos
  }
  if (typeof atualizarVisibilidadeQtdGuiasCabos === "function") { // se a função de quantidade de guias/cabos existir
    atualizarVisibilidadeQtdGuiasCabos(); // recalcula visibilidade de campos dependentes de quantidade de guias/cabos
  }

  if (avaliacaoFeedbackEl) { // se a área de feedback do formulário existir
    avaliacaoFeedbackEl.textContent =
      "Rascunho carregado no formulário (ainda não salvo no servidor)."; // mensagem informativa para o usuário
    avaliacaoFeedbackEl.className = "form-feedback form-success"; // usa estilo de sucesso para destacar a ação concluída
  }
}

/**
 * Localiza um rascunho pelo id no localStorage e chama `carregarRascunhoNoFormulario`.
 */
function carregarRascunhoNoFormularioPorId(idRascunho) {
  if (!idRascunho) { // se não for passado um id válido
    return; // não tenta carregar nada
  }

  const todos = lerRascunhosDoStorage(); // lê todos os rascunhos salvos no navegador

  console.log("DEBUG rascunhos:", todos, "id clicado:", idRascunho); // debug opcional para inspecionar ids no console do navegador

  const encontrado = todos.find((item) => {
    // compara como string para evitar problemas de tipo (número vs texto, draft-123 vs 123, etc.)
    return String(item.id) === String(idRascunho); // garante comparação sempre em formato de texto
  }); // procura o rascunho com o id correspondente no array vindo do localStorage



  if (!encontrado) { // se não encontrar o rascunho
    if (avaliacaoFeedbackEl) { // se a área de feedback existir
      avaliacaoFeedbackEl.textContent =
        "Rascunho não encontrado. Ele pode ter sido excluído."; // mensagem explicando o problema
      avaliacaoFeedbackEl.className = "form-feedback form-error"; // estilo de erro para chamar atenção
    }
    return; // encerra a função
  }

  carregarRascunhoNoFormulario(encontrado); // delega o preenchimento do formulário para a função específica
}

/**
 * Remove do localStorage rascunhos considerados "vazios":
 * - form_values sem nenhum campo relevante preenchido
 * - e sem lista de materiais de infraestrutura preenchida.
 */
function removerRascunhosVaziosDoStorage() {
  const todos = lerRascunhosDoStorage();                             // lê a lista completa de rascunhos do storage bruto
  if (!Array.isArray(todos) || todos.length === 0) {                 // se não houver rascunhos ou o formato estiver incorreto
    return;                                                          // não há nada para limpar, encerra a função
  }

  const filtrados = todos.filter((item) => {                         // monta uma nova lista apenas com rascunhos que queremos manter
    if (!item || typeof item !== "object") {                         // se o item não for um objeto válido
      return false;                                                  // descarta esse item do storage
    }

    const formValues = item.form_values || {};                       // obtém o mapa de valores do formulário salvo no rascunho (ou objeto vazio)
    const vazioForm = formularioRascunhoEstaVazio(formValues);       // verifica se esses valores caracterizam um formulário vazio

    const temMateriais =
      Array.isArray(item.lista_materiais_infra) &&                   // confere se o rascunho possui uma lista de materiais de infraestrutura
      item.lista_materiais_infra.length > 0;                         // e se essa lista contém pelo menos um item

    if (vazioForm && !temMateriais) {                                // se o formulário estiver vazio e não houver materiais
      return false;                                                  // este rascunho é considerado "fantasma" e será removido
    }

    return true;                                                     // caso contrário, mantemos o rascunho na lista filtrada
  });

  if (filtrados.length !== todos.length) {                           // se houve alguma alteração na quantidade de rascunhos
    gravarRascunhosNoStorage(filtrados);                             // grava a nova lista filtrada de volta no localStorage
  }
}

/**
 * Renderiza na tabela HTML a lista de rascunhos locais do usuário atual.
 */
function renderizarListaRascunhos() {
  if (!rascunhosTbody) { // se a tabela de rascunhos não existir no DOM
    return; // não há onde desenhar a lista
  }

  removerRascunhosVaziosDoStorage();

  const rascunhos = obterRascunhosDoUsuarioAtual(); // obtém todos os rascunhos associados ao usuário atual (ou sem user_id)
  rascunhosTbody.innerHTML = ""; // limpa o conteúdo atual da tabela para redesenhar do zero

  if (!rascunhos || rascunhos.length === 0) { // se não houver nenhum rascunho para exibir
    const linhaVazia = document.createElement("tr"); // cria uma nova linha de tabela
    const celula = document.createElement("td"); // cria uma célula única
    celula.colSpan = 4; // faz a célula ocupar todas as colunas da tabela
    celula.className = "table-empty"; // aplica a classe de estilo de linha vazia
    celula.textContent = "Nenhum rascunho salvo neste dispositivo."; // mensagem informando que não há rascunhos
    linhaVazia.appendChild(celula); // adiciona a célula à linha
    rascunhosTbody.appendChild(linhaVazia); // adiciona a linha à tabela
    atualizarBadgeRascunhosAPartirDoStorage(0);
    return; // encerra a função, pois já tratamos o caso sem rascunhos
  }

  const ordenados = [...rascunhos].sort((a, b) => { // cria uma cópia da lista e ordena por data de atualização
    const aTime = Date.parse(a.atualizado_em || a.criado_em || "") || 0; // tenta converter o timestamp do rascunho A em número
    const bTime = Date.parse(b.atualizado_em || b.criado_em || "") || 0; // tenta converter o timestamp do rascunho B em número
    return bTime - aTime; // ordena do mais recente para o mais antigo
  });

  ordenados.forEach((rascunho) => { // percorre cada rascunho já ordenado
    const linha = document.createElement("tr"); // cria uma nova linha de tabela para o rascunho atual

    const celulaRotulo = document.createElement("td"); // célula que exibirá o cliente/rótulo
    celulaRotulo.textContent = rascunho.rotulo || "Rascunho sem rótulo"; // usa o rótulo salvo ou um texto padrão

    const celulaTipo = document.createElement("td"); // célula que exibirá o tipo de formulário
    const tipo = (rascunho.tipo_formulario || "utp_fibra").toString().toLowerCase(); // normaliza o tipo em minúsculas
    celulaTipo.textContent =
      tipo === "cameras" || tipo === "câmeras" // verifica se o tipo corresponde a Câmeras
        ? "Câmeras" // texto exibido para rascunho de câmeras
        : "UTP / Fibra"; // texto exibido para rascunho de UTP/Fibra (padrão)

    const celulaData = document.createElement("td"); // célula que exibirá a data de atualização
    celulaData.textContent = formatarDataHoraCurta(
      rascunho.atualizado_em || rascunho.criado_em
    ); // formata o timestamp para exibição amigável

    const celulaAcoes = document.createElement("td"); // célula que conterá os botões de ação

    const botaoCarregar = document.createElement("button"); // cria o botão "Carregar"
    botaoCarregar.type = "button"; // define o tipo como botão simples
    botaoCarregar.className = "btn btn-ghost btn-small"; // aplica estilos de botão leve e tamanho pequeno
    botaoCarregar.textContent = "Carregar"; // texto exibido no botão
    //botaoCarregar.dataset.action = "carregar-rascunho"; // data-atributo indicando a ação que o botão representa
    //botaoCarregar.dataset.rascunhoId = rascunho.id; // data-atributo com o id do rascunho correspondente
    botaoCarregar.addEventListener("click", () => { // registra um listener de clique diretamente neste botão
      carregarRascunhoNoFormulario(rascunho); // ao clicar, carrega este rascunho (objeto desta linha) no formulário
    }); // não usamos data-attributes aqui para evitar qualquer ambiguidade de id

    const botaoExcluir = document.createElement("button"); // cria o botão "Excluir"
    botaoExcluir.type = "button"; // define o tipo como botão simples
    botaoExcluir.className = "btn btn-secondary btn-small"; // aplica estilos de botão secundário e pequeno
    botaoExcluir.textContent = "Excluir"; // texto exibido no botão
    botaoExcluir.dataset.action = "excluir-rascunho"; // data-atributo indicando que a ação é excluir o rascunho
    botaoExcluir.dataset.rascunhoId = rascunho.id; // associa o mesmo id de rascunho ao botão

    celulaAcoes.appendChild(botaoCarregar); // adiciona o botão "Carregar" à célula de ações
    celulaAcoes.appendChild(botaoExcluir); // adiciona o botão "Excluir" à célula de ações

    linha.appendChild(celulaRotulo); // adiciona a célula de rótulo à linha
    linha.appendChild(celulaTipo); // adiciona a célula de tipo à linha
    linha.appendChild(celulaData); // adiciona a célula de data à linha
    linha.appendChild(celulaAcoes); // adiciona a célula de ações à linha

    rascunhosTbody.appendChild(linha); // finalmente adiciona a linha completa à tabela de rascunhos
  });

  atualizarBadgeRascunhosAPartirDoStorage();
  
}

/**
 * Lê os dados do formulário de avaliação e envia para o backend.
 * - Se não houver avaliacaoEmEdicaoId, faz POST /avaliacoes (criação).
 * - Se houver avaliacaoEmEdicaoId, faz PUT /avaliacoes/{id} (edição).
 */
async function salvarAvaliacao(event) {

  event.preventDefault(); // evita o reload padrão da página

  avaliacaoFeedbackEl.textContent = ""; // limpa textos de feedback anteriores
  avaliacaoFeedbackEl.className = "form-feedback"; // reseta as classes de estado (erro/sucesso)

  // Lê os valores do formulário
  let clienteNome = "";                                            // variável que armazenará o nome final do cliente
  if (clienteNomeInput) {                                          // garante que o select de cliente exista
    const valorSelect = clienteNomeInput.value;                    // lê o valor selecionado no combo de clientes

    if (!valorSelect) {                                            // se nenhuma opção foi selecionada
      avaliacaoFeedbackEl.textContent =
        "Selecione o cliente antes de salvar a avaliação.";        // mensagem de erro orientando o usuário
      avaliacaoFeedbackEl.className = "form-feedback form-error";  // aplica estilo de erro na mensagem
      return;                                                      // interrompe o envio do formulário
    }

    if (valorSelect === "outro") {                                 // se a opção selecionada for "Outro"
      const textoOutro =                                          // lê o texto digitado no campo de "Outro"
        (clienteNomeOutroInput && clienteNomeOutroInput.value
          ? clienteNomeOutroInput.value.trim()
          : "");

      if (!textoOutro) {                                          // se o campo "Outro" estiver vazio
        avaliacaoFeedbackEl.textContent =
          "Informe o nome do cliente no campo 'Outro'.";           // pede para preencher o texto do cliente
        avaliacaoFeedbackEl.className = "form-feedback form-error"; // aplica estilo de erro
        return;                                                    // interrompe o envio
      }

      clienteNome = `Outro: ${textoOutro}`;                        // monta o valor final no formato "Outro: <texto>"
    } else {                                                       // se não for "Outro"
      clienteNome = valorSelect;                                   // usa diretamente o valor da opção selecionada
    }
  }

  const dataAvaliacao = dataAvaliacaoInput.value; // data no formato YYYY-MM-DD vinda do input date
  const local = localInput.value.trim(); // local da avaliação
  const objeto = objetoInput.value.trim(); // objeto da avaliação
  const status = statusSelect.value || "aberto"; // status, com fallback para "aberto"
  const equipe = equipeSelect.value || null; // equipe responsável (ou null se não selecionado)
  const responsavel = responsavelInput.value.trim() || null; // responsável pela avaliação
  const contato = contatoInput.value.trim() || null; // contato do cliente
  const emailCliente = emailClienteInput.value.trim() || null; // e-mail do cliente
  const escopoTexto = escopoTextarea.value.trim() || null; // escopo / observações
  //tipo_formulario
  const tipoFormulario = tipoFormularioInput                   // lê o tipo de formulário do input hidden, se existir
    ? (tipoFormularioInput.value || "utp_fibra")               // usa o valor atual ou assume "utp_fibra" como padrão se estiver vazio
    : "utp_fibra";                                             // em ambientes antigos sem o hidden, considera "utp_fibra" como padrão
  //tipo_formulario
  // Validações mínimas de campos obrigatórios
  if (!clienteNome) {
    avaliacaoFeedbackEl.textContent = "Informe o nome do cliente."; // mensagem de erro específica
    avaliacaoFeedbackEl.classList.add("form-error"); // aplica estilo de erro
    return; // interrompe o fluxo sem chamar a API
  }

  if (!dataAvaliacao) {
    avaliacaoFeedbackEl.textContent = "Informe a data da avaliação."; // mensagem de erro específica
    avaliacaoFeedbackEl.classList.add("form-error"); // aplica estilo de erro
    return; // interrompe o fluxo sem chamar a API
  }

  let listaMateriaisInfraParaApi = []; // inicializa o array que será enviado ao backend com a lista de materiais de infraestrutura
  let listaFotosSwitchQ2ParaApi = [];  // inicializa o array que armazenará as fotos do switch (Q2) preparadas para o backend (URLs + descrições)
  
  // Monta o payload que será enviado para a API
  // OBS: serve tanto para criação quanto para atualização.
  const payload = {
    cliente_nome: clienteNome, // nome do cliente
    data_avaliacao: dataAvaliacao, // data no formato YYYY-MM-DD
    local, // local da avaliação
    objeto, // objeto da avaliação
    status, // status da avaliação
    equipe, // equipe responsável
    responsavel_avaliacao: responsavel, // responsável pela avaliação
    contato, // contato do cliente
    email_cliente: emailCliente, // e-mail do cliente
    escopo_texto: escopoTexto, // escopo / observações
    //tipo_formulario
    tipo_formulario: tipoFormulario,    // tipo de formulário selecionado (utp/cameras/etc)
    //tipo_formulario
  };
  // Flags gerais
  payload.servico_fora_montes_claros =                                           // campo booleano indicando se o serviço é fora de Montes Claros
    servicoForaMC ? selectSimNaoParaBoolean(servicoForaMC) : null;              // converte o valor "sim"/"nao" do <select> para booleano (ou null se não houver seleção)

  payload.servico_intermediario =                                                // campo booleano indicando se o serviço é para intermediário/empreiteira
    servicoIntermediario ? selectSimNaoParaBoolean(servicoIntermediario) : null; // converte o valor "sim"/"nao" do <select> para booleano (ou null se não houver seleção)

  // Quantitativo 01 – Patch Panel / Cabeamento
  payload.q1_categoria_cab =
    q1Categoria && q1Categoria.value ? q1Categoria.value : null;  // categoria do cabeamento (CAT5e/CAT6/CAT6A)

  payload.q1_blindado = q1Blindado
    ? selectSimNaoParaBoolean(q1Blindado)                        // converte "sim"/"nao" para boolean (cabeamento blindado?)
    : null;

  payload.q1_novo_patch_panel = q1NovoPatch
    ? selectSimNaoParaBoolean(q1NovoPatch)                       // converte "sim"/"nao" para boolean (necessita novo patch panel?)
    : null;

  payload.q1_incluir_guia = q1IncluirGuia
    ? selectSimNaoParaBoolean(q1IncluirGuia)                     // converte "sim"/"nao" para boolean (incluir guia de cabos?)
    : null;

  payload.q1_qtd_pontos_rede = intOrNullFromInput(q1QtdPontosRede); // quantidade de pontos de rede
  payload.q1_qtd_cabos = intOrNullFromInput(q1QtdCabos);             // quantidade de cabos
  payload.q1_qtd_portas_patch_panel = intOrNullFromInput(
    q1QtdPortasPP
  );                                                              // quantidade de portas no patch panel
  payload.q1_qtd_patch_cords = intOrNullFromInput(
    q1QtdPatchCords
  );                                                              // quantidade de patch cords

  let modeloPatchPanelFinal = null;                              // variável para armazenar o valor final de modelo de patch panel

if (q1ModeloPatchPanel) {                                       // se o select de modelo de patch panel existir
    const valorModelo = q1ModeloPatchPanel.value;                 // lê o valor atualmente selecionado no combo

  if (valorModelo === "outro") {                                // se a opção escolhida for "Outro (especificar)"
      const textoOutro =                                        // variável para armazenar o texto digitado no campo "Outro"
        q1ModeloPatchPanelOutroInput &&                         // garante que o input de "Outro" exista
        q1ModeloPatchPanelOutroInput.value                      // pega o valor bruto do input
          ? q1ModeloPatchPanelOutroInput.value.trim()           // remove espaços extras no início/fim, se houver texto
          : "";                                                 // se não houver nada digitado, usa string vazia

      if (textoOutro) {                                         // se o usuário tiver digitado algum texto no campo "Outro"
        modeloPatchPanelFinal = `Outro: ${textoOutro}`;         // monta a string no formato "Outro: <texto digitado>"
      } else {                                                  // se o campo "Outro" estiver vazio
        modeloPatchPanelFinal = null;                           // não envia modelo de patch panel (valor null no payload)
      }
    } else if (valorModelo) {                                   // se o valor do select não for vazio nem "outro"
      modeloPatchPanelFinal = valorModelo;                      // usa diretamente o valor selecionado (CommScope/Furukawa/Systimax)
    } else {                                                    // se o select estiver vazio
      modeloPatchPanelFinal = null;                             // não envia modelo (null) para o backend
    }
  }

  payload.q1_modelo_patch_panel = modeloPatchPanelFinal;        // grava no payload o valor final calculado (fixo ou "Outro: <texto>")

  let marcaCabFinal = null;                                    // variável que armazenará o valor final da marca de cabeamento

  if (q1MarcaCab) {                                            // se o select de marca existir
    const valorSelectMarca = q1MarcaCab.value;                 // obtém o valor selecionado no combo (CommScope/Furukawa/outro)

    if (!valorSelectMarca) {                                   // se nada foi selecionado
      marcaCabFinal = null;                                    // não envia valor (campo em branco)
    } else if (valorSelectMarca === "outro") {                 // se a opção selecionada for "Outro"
      const textoOutro =                                       // pega o texto digitado no campo "Outro" de marca
        q1MarcaCabOutroInput && q1MarcaCabOutroInput.value     // se o input existir, lê o valor
          ? q1MarcaCabOutroInput.value.trim()                  // remove espaços extras do início/fim
          : "";                                                // se não houver input ou texto, considera string vazia

      marcaCabFinal = textoOutro                               // define valor final em função do texto
        ? `Outro: ${textoOutro}`                               // se tiver texto, usa o formato "Outro: <texto>"
        : null;                                                // se não tiver texto, não envia valor
    } else {                                                   // se for uma opção fixa (CommScope ou Furukawa)
      marcaCabFinal = valorSelectMarca;                        // usa o valor selecionado diretamente
    }                                                          // fim do if aninhado para valorSelectMarca
  }                                                            // fim do if q1MarcaCab

  payload.q1_marca_cab = marcaCabFinal;                        // atribui o valor final calculado ao payload

  payload.q1_qtd_guias_cabos = intOrNullFromInput(             // converte o valor digitado em número inteiro ou null
    q1QtdGuiasCabos                                             // elemento de input de quantidade de guias de cabos
  );                                                            // fecha chamada da função de conversão

  payload.q1_patch_cords_modelo =                              // campo com o modelo/descrição dos patch cords
    q1PatchCordsModelo && q1PatchCordsModelo.value.trim()      // verifica se o input existe e se há texto preenchido
      ? q1PatchCordsModelo.value.trim()                        // se houver texto, usa o valor sem espaços nas pontas
      : null;                                                  // se não houver, envia null (campo vazio)

  payload.q1_patch_cords_cor =                                 // campo com a cor dos patch cords
    q1PatchCordsCor && q1PatchCordsCor.value.trim()            // verifica se o input de cor existe e se há texto
      ? q1PatchCordsCor.value.trim()                           // se houver, usa o texto da cor sem espaços extras
      : null;                                                  // se não houver, envia null

  payload.q1_patch_panel_existente_nome =                      // campo com identificação do patch panel já existente
    q1PatchPanelExistenteNome &&                               // verifica se o input de identificação existe
    q1PatchPanelExistenteNome.value.trim()                     // e se há algum texto digitado
      ? q1PatchPanelExistenteNome.value.trim()                 // se houver, usa o texto sem espaços nas pontas
      : null;                                                  // se não houver texto, envia null

  // Quantitativo 02 – Switch
  payload.q2_novo_switch = q2NovoSwitch
    ? selectSimNaoParaBoolean(q2NovoSwitch)                              // converte "sim"/"nao" em boolean para novo switch
    : null;
  // payload.q2_switch_poe = q2SwitchPoe
  //   ? selectSimNaoParaBoolean(q2SwitchPoe)                               // LEGADO - converte "sim"/"nao" em boolean para PoE
  //   : null;
  // payload.q2_rede_industrial = q2RedeIndustrial
  //   ? selectSimNaoParaBoolean(q2RedeIndustrial)                          // LEGADO - converte "sim"/"nao" em boolean para rede industrial
  //   : null;
  // payload.q2_qtd_pontos_rede = intOrNullFromInput(q2QtdPontosRede);      // quantidade de pontos atendidos via switch
  // payload.q2_qtd_portas_switch = intOrNullFromInput(q2QtdPortasSwitch);  // quantidade de portas do switch

  payload.q2_fornecedor_switch =
    q2FornecedorSwitch && q2FornecedorSwitch.value
      ? q2FornecedorSwitch.value                                         // "nortetel" ou "cliente"
      : null;

  payload.q2_modelo_switch =
    q2ModeloSwitch && q2ModeloSwitch.value.trim()
      ? q2ModeloSwitch.value.trim()                                      // modelo/descrição do switch
      : null;

  const listaFotosSwitch = coletarListaFotosSwitchQ2DoFormulario();        // coleta a lista de fotos (URLs) preenchida na tabela de Q2

  let primeiraFotoSwitchUrl = null;                                      // variável para armazenar a primeira URL de foto encontrada
  if (listaFotosSwitch && listaFotosSwitch.length > 0) {                 // se houver pelo menos uma foto na lista
    primeiraFotoSwitchUrl = listaFotosSwitch[0].url;                     // usa a URL da primeira foto como referência principal
  }

  if (q2SwitchFotoUrl) {                                                 // se o campo legado escondido existir no DOM
    q2SwitchFotoUrl.value =                                             // atualiza o valor desse campo legado
      primeiraFotoSwitchUrl ||                                          // prioriza a URL da primeira foto da lista
      (q2SwitchFotoUrl.value && q2SwitchFotoUrl.value.trim()) ||        // senão, mantém o que já estiver preenchido
      "";                                                               // ou zera se nada estiver definido
  }

  payload.q2_switch_foto_url =
    q2SwitchFotoUrl && q2SwitchFotoUrl.value.trim()
      ? q2SwitchFotoUrl.value.trim()                                     // URL principal da foto do switch (campo legado / compat)
      : null;

  // payload.q2_switch_existente_nome =
  //   q2SwitchExistenteNome && q2SwitchExistenteNome.value.trim()
  //     ? q2SwitchExistenteNome.value.trim()                               // identificação do switch existente
  //     : null;

  payload.q2_observacoes =
    q2ObsSwitch && q2ObsSwitch.value.trim()
      ? q2ObsSwitch.value.trim()                                         // observações sobre switches
      : null;

  // Quantitativo 03 – Cabeamento Óptico
  payload.q3_tipo_fibra = q3TipoFibra ? q3TipoFibra.value || null : null;    // tipo de fibra (SM/OMx)
  payload.q3_qtd_fibras_por_cabo = intOrNullFromInput(q3QtdFibrasPorCabo);  // número de fibras por cabo
  payload.q3_tipo_conector = q3TipoConector ? q3TipoConector.value || null : null; // tipo de conector (LC/SC etc.)

  payload.q3_novo_dio = q3NovoDio
    ? selectSimNaoParaBoolean(q3NovoDio)                                    // converte "sim"/"nao" em boolean para novo DIO
    : null;
  payload.q3_caixa_terminacao = q3CaixaTerminacao
    ? selectSimNaoParaBoolean(q3CaixaTerminacao)                            // converte "sim"/"nao" em boolean para caixa de terminação
    : null;
  payload.q3_tipo_cabo_optico = q3TipoCaboOptico
    ? q3TipoCaboOptico.value || null                                       // tipo de cabo óptico
    : null;
  payload.q3_caixa_emenda = q3CaixaEmenda
    ? selectSimNaoParaBoolean(q3CaixaEmenda)                                // converte "sim"/"nao" em boolean para caixa de emenda
    : null;

  payload.q3_qtd_cabos = intOrNullFromInput(q3QtdCabos);                    // quantidade de cabos ópticos
  payload.q3_tamanho_total_m = floatOrNullFromInput(q3TamanhoTotal);        // metragem total em metros
  payload.q3_qtd_fibras = intOrNullFromInput(q3QtdFibras);                  // quantidade total de fibras
  payload.q3_qtd_portas_dio = intOrNullFromInput(q3QtdPortasDio);           // quantidade de portas no DIO
  payload.q3_qtd_cordoes_opticos = intOrNullFromInput(q3QtdCordoesOpticos); // quantidade de cordões ópticos

  let marcaCaboOpticoFinal = null;                                             // variável que guardará o valor final da marca óptica

  if (q3MarcaCabOptico) {                                                      // se o select de marca óptica existir
    const valorSelectMarcaOptica = q3MarcaCabOptico.value;                     // lê o valor selecionado no combo

    if (!valorSelectMarcaOptica) {                                             // se nada foi selecionado
      marcaCaboOpticoFinal = null;                                             // não envia valor
    } else if (valorSelectMarcaOptica === "outro") {                           // se a opção for "Outro"
      const textoOutroMarcaOptica =                                           // pega o texto do campo "Outro"
        q3MarcaCabOpticoOutroInput && q3MarcaCabOpticoOutroInput.value
          ? q3MarcaCabOpticoOutroInput.value.trim()
          : "";

      marcaCaboOpticoFinal = textoOutroMarcaOptica                             // se tiver texto
        ? `Outro: ${textoOutroMarcaOptica}`                                    // envia no formato "Outro: <texto>"
        : null;                                                                // se não tiver texto, envia null
    } else {                                                                   // se for uma das opções fixas
      marcaCaboOpticoFinal = valorSelectMarcaOptica;                           // usa o valor selecionado diretamente
    }
  }

  payload.q3_marca_cab_optico = marcaCaboOpticoFinal;                          // atribui o valor final ao payload

  payload.q3_modelo_dio =
    q3ModeloDio && q3ModeloDio.value.trim()
      ? q3ModeloDio.value.trim()                                            // modelo do DIO
      : null;

  payload.q3_modelo_cordao_optico =
    q3ModeloCordaoOptico && q3ModeloCordaoOptico.value.trim()
      ? q3ModeloCordaoOptico.value.trim()                                   // modelo do cordão óptico
      : null;

  payload.q3_observacoes =
    q3Obs && q3Obs.value.trim()
      ? q3Obs.value.trim()                                                  // observações sobre a rede óptica
      : null;

  // Quantitativo 04 – Equipamentos (flags principais)
  payload.q4_camera = q4Camera
    ? selectSimNaoParaBoolean(q4Camera)                               // converte "sim"/"nao" em boolean para flag de câmera
    : null;
  payload.q4_nvr_dvr = q4NvrDvr
    ? selectSimNaoParaBoolean(q4NvrDvr)                               // converte "sim"/"nao" em boolean para flag de NVR/DVR
    : null;
  payload.q4_access_point = q4AccessPoint
    ? selectSimNaoParaBoolean(q4AccessPoint)                          // LEGADO – flag de Access Point
    : null;
  payload.q4_conversor_midia = q4Conversor
    ? selectSimNaoParaBoolean(q4Conversor)                            // flag para conversor de mídia
    : null;
  payload.q4_gbic = q4Gbic
    ? selectSimNaoParaBoolean(q4Gbic)                                 // flag para GBIC
    : null;
  payload.q4_switch = q4Switch
    ? selectSimNaoParaBoolean(q4Switch)                               // LEGADO – flag para switch como equipamento
    : null;

  // Quantitativo 04 – Equipamentos (detalhes de câmeras / NVR / conversor / GBIC)
  payload.q4_camera_nova = q4CameraNova
    ? selectSimNaoParaBoolean(q4CameraNova)                           // converte "sim"/"nao" em boolean para "câmera nova/realocação?"
    : null;

  payload.q4_camera_fornecedor =
    q4CameraFornecedor && q4CameraFornecedor.value
      ? q4CameraFornecedor.value                                      // "nortetel" ou "cliente"
      : null;

  payload.q4_camera_modelo =
    q4CameraModelo && q4CameraModelo.value.trim()
      ? q4CameraModelo.value.trim()                                   // modelo da câmera
      : null;

  payload.q4_camera_qtd = intOrNullFromInput(q4CameraQtd);            // quantidade de câmeras

  payload.q4_nvr_dvr_modelo =
    q4NvrDvrModelo && q4NvrDvrModelo.value.trim()
      ? q4NvrDvrModelo.value.trim()                                   // modelo do NVR/DVR
      : null;

  payload.q4_conversor_midia_modelo =
    q4ConversorMidiaModelo && q4ConversorMidiaModelo.value.trim()
      ? q4ConversorMidiaModelo.value.trim()                           // modelo do conversor de mídia
      : null;

  payload.q4_gbic_modelo =
    q4GbicModelo && q4GbicModelo.value.trim()
      ? q4GbicModelo.value.trim()                                     // modelo do GBIC
      : null;

  // Quantitativo 05 – Infraestrutura (flags)
  payload.q5_nova_eletrocalha = q5NovaEletrocalha
    ? selectSimNaoParaBoolean(q5NovaEletrocalha)                       // converte "sim"/"nao" em boolean p/ nova eletrocalha
    : null;
  payload.q5_novo_eletroduto = q5NovoEletroduto
    ? selectSimNaoParaBoolean(q5NovoEletroduto)                        // converte "sim"/"nao" em boolean p/ novo eletroduto
    : null;
  payload.q5_novo_rack = q5NovoRack
    ? selectSimNaoParaBoolean(q5NovoRack)                              // converte "sim"/"nao" em boolean p/ novo rack
    : null;
  payload.q5_instalacao_eletrica = q5InstalacaoEletrica
    ? selectSimNaoParaBoolean(q5InstalacaoEletrica)                    // converte "sim"/"nao" em boolean p/ instalação elétrica
    : null;
  payload.q5_nobreak = q5Nobreak
    ? selectSimNaoParaBoolean(q5Nobreak)                               // converte "sim"/"nao" em boolean p/ nobreak
    : null;
  payload.q5_serralheria = q5Serralheria
    ? selectSimNaoParaBoolean(q5Serralheria)                           // converte "sim"/"nao" em boolean p/ serralheria
    : null;

  // Quantitativo 05 – Infraestrutura (detalhes)
  payload.q5_eletrocalha_modelo =
    q5EletrocalhaModelo && q5EletrocalhaModelo.value.trim()
      ? q5EletrocalhaModelo.value.trim()                               // modelo da eletrocalha (texto)
      : null;
  payload.q5_eletrocalha_qtd = intOrNullFromInput(q5EletrocalhaQtd);   // quantidade de eletrocalhas

  payload.q5_eletroduto_modelo =
    q5EletrodutoModelo && q5EletrodutoModelo.value.trim()
      ? q5EletrodutoModelo.value.trim()                                // modelo do eletroduto
      : null;
  payload.q5_eletroduto_qtd = intOrNullFromInput(q5EletrodutoQtd);     // quantidade de eletrodutos

  payload.q5_rack_modelo =
    q5RackModelo && q5RackModelo.value.trim()
      ? q5RackModelo.value.trim()                                      // modelo do rack
      : null;
  payload.q5_rack_qtd = intOrNullFromInput(q5RackQtd);                 // quantidade de racks

  payload.q5_nobreak_modelo =
    q5NobreakModelo && q5NobreakModelo.value.trim()
      ? q5NobreakModelo.value.trim()                                   // modelo do nobreak
      : null;
  payload.q5_nobreak_qtd = intOrNullFromInput(q5NobreakQtd);           // quantidade de nobreaks

  payload.q5_serralheria_descricao =
    q5SerralheriaDescricao && q5SerralheriaDescricao.value.trim()
      ? q5SerralheriaDescricao.value.trim()                            // descrição da serralheria
      : null;

  payload.q5_instalacao_eletrica_obs =
    q5InstalacaoEletricaObs && q5InstalacaoEletricaObs.value.trim()
      ? q5InstalacaoEletricaObs.value.trim()                           // observações de instalação elétrica
      : null;

  // Imagens
  payload.localizacao_imagem1_url = imgRef1 ? imgRef1.value || null : null; // primeira imagem (pode ser null)
  payload.localizacao_imagem2_url = imgRef2 ? imgRef2.value || null : null; // segunda imagem (pode ser null)

  // Pré-requisitos
  payload.pre_trabalho_altura = preTrabalhoAltura ? selectSimNaoParaBoolean(preTrabalhoAltura) : null;
  payload.pre_plataforma = prePlataforma ? selectSimNaoParaBoolean(prePlataforma) : null;
  payload.pre_plataforma_modelo = prePlataformaModelo.value;
  payload.pre_plataforma_dias = intOrNullFromInput(prePlataformaDias); // converte dias de uso da plataforma para número ou null
  payload.pre_fora_horario_comercial = preForaHorario ? selectSimNaoParaBoolean(preForaHorario) : null;
  payload.pre_veiculo_nortetel = preVeiculoNortetel ? selectSimNaoParaBoolean(preVeiculoNortetel) : null;
  payload.pre_container_materiais = preContainer ? selectSimNaoParaBoolean(preContainer) : null;

  // Horas - dias normais (Tabela 4)
  payload.encarregado_dias = encarregadoDiasInput ? (encarregadoDiasInput.value || null) : null;                 // dias de encarregado
  payload.instalador_dias = instaladorDiasInput ? (instaladorDiasInput.value || null) : null;                   // dias de instalador
  payload.auxiliar_dias = auxiliarDiasInput ? (auxiliarDiasInput.value || null) : null;                         // dias de auxiliar
  payload.tecnico_de_instalacao_dias = tecnicoInstalacaoDiasInput ? (tecnicoInstalacaoDiasInput.value || null) : null; // dias do técnico de instalação
  payload.tecnico_em_seguranca_dias = tecnicoSegurancaDiasInput ? (tecnicoSegurancaDiasInput.value || null) : null;   // dias do técnico em segurança

  // Horas extras por função
  payload.encarregado_hora_extra = encarregadoHoraExtraInput ? (encarregadoHoraExtraInput.value || null) : null;                 // horas extras do encarregado
  payload.instalador_hora_extra = instaladorHoraExtraInput ? (instaladorHoraExtraInput.value || null) : null;                   // horas extras do instalador
  payload.auxiliar_hora_extra = auxiliarHoraExtraInput ? (auxiliarHoraExtraInput.value || null) : null;                         // horas extras do auxiliar
  payload.tecnico_de_instalacao_hora_extra = tecnicoInstalacaoHoraExtraInput ? (tecnicoInstalacaoHoraExtraInput.value || null) : null; // horas extras do técnico de instalação
  payload.tecnico_em_seguranca_hora_extra = tecnicoSegurancaHoraExtraInput ? (tecnicoSegurancaHoraExtraInput.value || null) : null;   // horas extras do técnico em segurança

  // Trabalho em domingos/feriados por função
  payload.encarregado_trabalho_domingo = encarregadoDomingoInput ? (encarregadoDomingoInput.value || null) : null;                 // domingos/feriados do encarregado
  payload.instalador_trabalho_domingo = instaladorDomingoInput ? (instaladorDomingoInput.value || null) : null;                   // domingos/feriados do instalador
  payload.auxiliar_trabalho_domingo = auxiliarDomingoInput ? (auxiliarDomingoInput.value || null) : null;                         // domingos/feriados do auxiliar
  payload.tecnico_de_instalacao_trabalho_domingo = tecnicoInstalacaoDomingoInput ? (tecnicoInstalacaoDomingoInput.value || null) : null; // domingos/feriados do técnico de instalação
  payload.tecnico_em_seguranca_trabalho_domingo = tecnicoSegurancaDomingoInput ? (tecnicoSegurancaDomingoInput.value || null) : null;   // domingos/feriados do técnico em segurança

  // Prazos
  payload.cronograma_execucao = selectSimNaoParaBoolean(cronogramaExecucaoSelect);           // converte "sim"/"nao" do select em boolean
  payload.dias_instalacao = diasInstalacaoInput ? (diasInstalacaoInput.value || null) : null; // número de dias de instalação
  payload.as_built = selectSimNaoParaBoolean(asBuiltSelect);                                 // converte select de As Built em boolean
  payload.dias_entrega_relatorio = diasEntregaRelatorioInput ? (diasEntregaRelatorioInput.value || null) : null; // prazo em dias para relatório
  payload.art = selectSimNaoParaBoolean(artSelect);                                          // converte select de ART em boolean

  // Alimentação
  payload.almoco_qtd = almocoQtdInput
    ? almocoQtdInput.value || null
    : null; // quantidade de almoços (mantém a mesma lógica, apenas ajustada em mais linhas)
  payload.lanche_qtd = lancheQtdInput
    ? lancheQtdInput.value || null
    : null; // quantidade de lanches (idem)

  const itensMateriaisInfra = coletarListaMateriaisInfraDoFormulario(); // obtém a lista de materiais de infraestrutura preenchida na tabela dinâmica

  listaMateriaisInfraParaApi = []; // zera explicitamente o array que será enviado ao backend para evitar resíduos de chamadas anteriores

  if (itensMateriaisInfra && itensMateriaisInfra.length > 0) { // se existir pelo menos um item na lista de materiais
    for (let i = 0; i < itensMateriaisInfra.length; i++) { // percorre a lista de materiais usando um índice numérico
      const item = itensMateriaisInfra[i]; // obtém o item atual da lista com base no índice

      const equipamento =
        item && item.equipamento
          ? item.equipamento.toString().trim()
          : ""; // normaliza o texto do campo "Equipamento / material" (ou usa string vazia se não existir)

      const modelo =
        item && item.modelo
          ? item.modelo.toString().trim()
          : ""; // normaliza o texto do modelo indicado para o material, se houver

      const quantidadeStr =
        item && item.quantidade !== undefined && item.quantidade !== null
          ? item.quantidade.toString().trim()
          : ""; // garante que a quantidade seja tratada como string, mesmo que tenha sido salva como número

      const fabricante =
        item && item.fabricante
          ? item.fabricante.toString().trim()
          : ""; // normaliza o texto do fabricante, se informado

      if (!equipamento) { // se a linha tiver alguma coisa preenchida mas não tiver o equipamento/material informado
        avaliacaoFeedbackEl.textContent =
          'Preencha o campo "Equipamento / material" em todas as linhas da lista de materiais.'; // mensagem de erro indicando o campo faltante
        avaliacaoFeedbackEl.classList.add("form-error"); // aplica classe visual de erro ao feedback
        return; // interrompe o fluxo de salvamento antes de chamar a API
      }

      let quantidadeInt = null; // inicializa variável que guardará a quantidade convertida para número inteiro
      if (quantidadeStr !== "") { // se o usuário digitou alguma coisa no campo de quantidade
        const parsed = parseInt(quantidadeStr, 10); // tenta converter o texto em número inteiro na base decimal
        if (Number.isNaN(parsed) || parsed <= 0) { // se a conversão falhar ou for menor/igual a zero, a quantidade é inválida
          avaliacaoFeedbackEl.textContent =
            "Informe uma quantidade numérica válida (maior que zero) em todas as linhas da lista de materiais."; // mensagem de erro de validação de quantidade
          avaliacaoFeedbackEl.classList.add("form-error"); // aplica classe de erro
          return; // interrompe o fluxo de salvamento
        }
        quantidadeInt = parsed; // se tudo estiver ok, armazena o valor convertido como inteiro
      } else { // se o campo de quantidade estiver vazio
        avaliacaoFeedbackEl.textContent =
          "Informe a quantidade em todas as linhas preenchidas da lista de materiais."; // exige que a quantidade seja informada para linhas parcialmente preenchidas
        avaliacaoFeedbackEl.classList.add("form-error"); // aplica estilo visual de erro
        return; // interrompe o fluxo de salvamento
      }

      listaMateriaisInfraParaApi.push({
        equipamento: equipamento, // salva o nome do equipamento/material já normalizado
        modelo: modelo || null, // salva o modelo ou null caso o campo esteja em branco
        quantidade: quantidadeInt, // salva a quantidade já validada em formato inteiro
        fabricante: fabricante || null, // salva o fabricante ou null se o campo estiver em branco
      }); // adiciona o item convertido ao array final que será sincronizado com o backend
    }
      

    // Monta a lista de fotos do switch (Q2) que será enviada ao backend
    const itensFotosSwitchQ2 = coletarListaFotosSwitchQ2DoFormulario(); // usa a tabela dinâmica de fotos para coletar URLs e descrições preenchidas

    listaFotosSwitchQ2ParaApi = Array.isArray(itensFotosSwitchQ2)
      ? itensFotosSwitchQ2 // se o helper retornou um array, usamos diretamente
      : [];                // caso contrário, garantimos que a variável será sempre um array (evita erros em chamadas posteriores)

  }

  if (salvarAvaliacaoButton) { // se o botão "Salvar avaliação" existir
    salvarAvaliacaoButton.disabled = true; // desabilita o botão para evitar múltiplos envios simultâneos
    salvarAvaliacaoButton.dataset.originalText =
      salvarAvaliacaoButton.textContent; // salva o texto atual do botão em um data-atributo para poder restaurar depois
    salvarAvaliacaoButton.textContent = "Salvando..."; // troca o texto do botão para indicar que o sistema está salvando
  }

  try {
    let avaliacaoSalva = null;              // inicializa variável que armazenará a resposta do backend ao criar ou atualizar a avaliação (inclusive o id)
    let mensagemSucessoAvaliacao = "";      // variável que guardará a mensagem de sucesso apropriada (criação ou edição) para exibir somente após todo o processo terminar

    if (!avaliacaoEmEdicaoId) { // se não há avaliação em edição, vamos criar uma nova

      avaliacaoSalva = await apiPostJson(
        "/avaliacoes",
        payload
      ); // envia o payload para o backend criando um novo registro e captura a resposta (incluindo o id da avaliação)

      mensagemSucessoAvaliacao =
        "Avaliação salva com sucesso."; // guarda a mensagem de sucesso apropriada para criação, mas sem exibir ainda

    } else { // se existe uma avaliação em edição
      // Se houver id em edição, fazemos um PUT (edição)
      avaliacaoSalva = await apiPutJson(
        `/avaliacoes/${avaliacaoEmEdicaoId}`,
        payload
      ); // envia o payload para atualizar a avaliação existente e captura a resposta (incluindo o id da avaliação)

      mensagemSucessoAvaliacao =
        "Avaliação atualizada com sucesso."; // guarda a mensagem de sucesso específica para edição, sem exibir imediatamente
    }

    const avaliacaoIdParaMateriais =
      avaliacaoSalva && typeof avaliacaoSalva.id === "number" // verifica se a resposta do backend traz um id numérico válido
        ? avaliacaoSalva.id // em caso positivo, usa o id retornado pelo backend (principalmente em criação)
        : avaliacaoEmEdicaoId; // se não houver id na resposta, usa o id que já estava em edição (cenário de atualização)

    if (avaliacaoIdParaMateriais) { // se foi possível determinar um id de avaliação para associar os materiais
      await salvarListaMateriaisInfraNoBackend(
        avaliacaoIdParaMateriais, // id da avaliação cujos materiais devem ser sincronizados
        listaMateriaisInfraParaApi // lista de materiais que já foi validada e preparada para o backend
      ); // executa a estratégia "apagar tudo e recriar" para a lista de materiais desta avaliação
    }

    if (avaliacaoIdParaMateriais) { // se temos um id válido de avaliação, também sincronizamos as fotos do switch (Q2)
      await salvarListaFotosSwitchQ2NoBackend(
        avaliacaoIdParaMateriais, // id da avaliação cujas fotos serão sincronizadas
        listaFotosSwitchQ2ParaApi // lista de fotos (URLs + descrições) preparada anteriormente a partir da tabela de Q2
      ); // aplica a mesma estratégia "apagar tudo e recriar" para as fotos da seção Q2
    }

    if (mensagemSucessoAvaliacao) {                              // verifica se alguma mensagem de sucesso foi definida durante o fluxo
      avaliacaoFeedbackEl.textContent = mensagemSucessoAvaliacao; // aplica o texto de sucesso no elemento de feedback
      avaliacaoFeedbackEl.classList.remove("form-error");         // remove qualquer classe de erro que possa estar aplicada de tentativas anteriores
      avaliacaoFeedbackEl.classList.add("form-success");          // adiciona a classe de sucesso para estilizar positivamente a mensagem
    }

    if (rascunhoEmEdicaoId) { // se existe um rascunho vinculado ao formulário atual

      excluirRascunhoLocalPorId(rascunhoEmEdicaoId); // remove do localStorage o rascunho correspondente
      rascunhoEmEdicaoId = null; // zera a referência global ao rascunho em edição, pois os dados já foram salvos no servidor
      renderizarListaRascunhos(); // atualiza a tabela de "Rascunhos locais" para refletir a remoção
    }

    formAvaliacao.reset(); // limpa todos os campos do formulário após salvar
    resetarFormularioParaNovaAvaliacao(); // volta o formulário para o modo "Nova Avaliação" (reseta estados internos)
    await carregarAvaliacoes(); // recarrega a lista de avaliações para refletir o novo registro/edição

  } catch (err) {
    console.error(err); // registra o erro no console para inspeção no navegador

    // Mensagens diferentes dependendo se era criação ou edição
    if (!avaliacaoEmEdicaoId) { // se não havia id em edição, o erro foi ao criar
      avaliacaoFeedbackEl.textContent =
        "Erro ao salvar avaliação. Verifique os dados e tente novamente."; // mensagem de erro para criação
    } else { // se havia id em edição, o erro foi ao atualizar
      avaliacaoFeedbackEl.textContent =
        "Erro ao atualizar avaliação. Verifique os dados e tente novamente."; // mensagem de erro para edição
    }

    avaliacaoFeedbackEl.classList.add("form-error"); // aplica classe de estilo de erro
  } finally {
    if (salvarAvaliacaoButton) { // garante que o botão será reabilitado após a tentativa de salvar
      salvarAvaliacaoButton.disabled = false; // reabilita o botão de salvar para próximas interações
      salvarAvaliacaoButton.textContent =
        salvarAvaliacaoButton.dataset.originalText ||
        "Salvar avaliação"; // restaura o texto original ou usa um texto padrão
    }
  }
}

// ----------------------------------------------------------------------
// Inicialização da página e registro de eventos
// ----------------------------------------------------------------------

/**
 * Registra todos os listeners necessários (submit de formulários,
 * clique em botões, etc.).
 */
function registrarEventos() {
  // Evento de submit do formulário de login
  if (loginForm) { // se o formulário de login existir na página
      loginForm.addEventListener("submit", async (event) => { // registra um listener assíncrono para o envio do formulário
        event.preventDefault(); // evita o recarregamento padrão da página

        // Lê usuário e senha digitados
        const username = loginUsernameInput.value.trim(); // obtém o texto do campo de usuário, removendo espaços extras nas pontas
        const password = loginPasswordInput.value.trim(); // obtém o texto do campo de senha, também removendo espaços extras

        // Validações simples
        if (!username || !password) { // se usuário ou senha estiverem vazios
          loginErrorEl.textContent = "Informe usuário e senha."; // exibe mensagem de erro de validação na tela de login
          return; // interrompe o fluxo sem chamar a API
        }

        if (loginSubmitButton) { // se o botão de submit de login foi encontrado no DOM
          loginSubmitButton.disabled = true; // desabilita o botão para evitar múltiplos cliques seguidos
          loginSubmitButton.dataset.originalText =
            loginSubmitButton.textContent; // guarda o texto original do botão em um data-atributo para restaurar depois
          loginSubmitButton.textContent = "Entrando..."; // muda o texto do botão para indicar que o login está em processamento
        }

        try { // bloco try para garantir que o botão será reabilitado independente de sucesso ou erro
          await realizarLogin(username, password); // chama a função que faz a requisição de login e aguarda a resposta
        } finally { // sempre executado ao final da operação, com erro ou sucesso
          if (loginSubmitButton) { // se o botão ainda existir
            loginSubmitButton.disabled = false; // reabilita o botão de login
            loginSubmitButton.textContent =
              loginSubmitButton.dataset.originalText || "Entrar"; // restaura o texto original ou usa um texto padrão
          }
        }
      });
    }

  if (q2NovoSwitch) {                                              // se o select "Necessita novo switch?" existir
    atualizarVisibilidadeFornecedorSwitch();                       // aplica o estado inicial do campo "Fornecedor do switch"
    q2NovoSwitch.addEventListener("change", () => {                // registra um listener para quando o usuário mudar o valor
      atualizarVisibilidadeFornecedorSwitch();                     // a cada mudança, atualiza a visibilidade do campo de fornecedor
    });
  }

  if(q4Camera){
    atualizarVisibilidadeCamera();
    q4Camera.addEventListener("change", () =>{
      atualizarVisibilidadeCamera();
    });
  }

  if(q4NvrDvr){
    atualizarVisibilidadeNvrdvr();
    q4NvrDvr.addEventListener("change", () =>{
      atualizarVisibilidadeNvrdvr();
    });
  }
  
  // Evento de clique no botão de logout (sair)
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      realizarLogout();
    });
  }

  // Evento de clique no botão de recarregar lista de avaliações
  if (recarregarButton) {
    recarregarButton.addEventListener("click", () => {
      carregarAvaliacoes();
    });
  }

    // Evento de clique no botão "Usuários" (somente para administradores)
  if (openUsersButton) {                                              // verifica se o botão de gestão de usuários existe
    openUsersButton.addEventListener("click", () => {                 // registra o handler de clique
      abrirModalUsuarios();                                           // abre o modal de gestão de usuários
    });
  }

  // Evento de clique no botão de fechar o modal de usuários
  if (closeUsersButton) {                                             // verifica se o botão de fechar existe
    closeUsersButton.addEventListener("click", () => {                // registra o handler de clique
      fecharModalUsuarios();                                          // fecha o modal de gestão de usuários
    });
  }

  // Evento de submit do formulário de avaliação
  if (formAvaliacao) {                                            // verifica se o formulário de avaliação existe
    formAvaliacao.addEventListener("submit", salvarAvaliacao);    // registra o handler de submit para salvar a avaliação

    formAvaliacao.addEventListener("input", () => {               // registra um listener genérico para qualquer alteração nos campos do formulário
      agendarAutoSalvarRascunho();                                // sempre que o usuário digitar ou alterar algo, agenda o salvamento automático do rascunho
    });
  }

  if (salvarAvaliacaoButton) {                                    // verifica se o botão de salvar avaliação existe
    salvarAvaliacaoButton.addEventListener("click", (event) => {  // registra o handler de clique no botão "Salvar avaliação"
      event.preventDefault();                                     // evita o comportamento padrão de submit do formulário
      salvarAvaliacao(event);                                     // chama a função de salvar avaliação manualmente
    });
  }

  if (salvarRascunhoButton) {                                     // verifica se o botão de salvar rascunho existe no DOM
    salvarRascunhoButton.addEventListener("click", (event) => {   // registra o handler de clique no botão "Salvar rascunho"
      event.preventDefault();                                     // impede que o clique dispare um submit do formulário
      salvarRascunhoAtual();                                      // chama a função que salva o formulário como rascunho local
      renderizarListaRascunhos();                                 // atualiza a tabela de rascunhos após o salvamento
    });
  }

  if (rascunhosTbody) {                                           // garante que o corpo da tabela de rascunhos exista
    rascunhosTbody.addEventListener("click", (event) => {         // registra um único listener de clique (delegado) para a tabela
      const botao = event.target.closest("button[data-rascunho-id]"); // tenta encontrar o botão mais próximo com o data-rascunho-id
      if (!botao) {                                               // se o clique não ocorreu em um botão com esse atributo
        return;                                                   // não faz nada e encerra o handler
      }

      const idRascunho = botao.dataset.rascunhoId;                // lê o id do rascunho a partir do data-atributo do botão
      const acao = botao.dataset.action;                          // lê a ação solicitada (no momento, usamos apenas "excluir-rascunho")

      if (!idRascunho || acao !== "excluir-rascunho") {           // se não houver id válido ou a ação não for de exclusão
        return;                                                   // não executa nenhuma ação para este clique
      }

      excluirRascunhoLocalPorId(idRascunho);                      // remove o rascunho do armazenamento local

      if (rascunhoEmEdicaoId === idRascunho) {                    // se o rascunho excluído era o que estava vinculado ao formulário
        rascunhoEmEdicaoId = null;                                // zera o vínculo de rascunho atual
      }

      renderizarListaRascunhos();                                 // redesenha a lista de rascunhos para refletir a exclusão
    });
  }

  if (recarregarRascunhosButton) {                                // se o botão de recarregar rascunhos existir
    recarregarRascunhosButton.addEventListener("click", () => {   // registra o handler de clique nesse botão
      renderizarListaRascunhos();                                 // simplesmente re-renderiza a lista de rascunhos a partir do storage
    });
  }

  if (limparRascunhosButton) {                             
    limparRascunhosButton.addEventListener("click", () => {
        //const valorBruto = window.localStorage.getItem(DRAFTS_STORAGE_KEY); // lê a string JSON armazenada sob a chave de rascunhos
        window.localStorage.clear(); //limpar para debug
        renderizarListaRascunhos();                                 // simplesmente re-renderiza a lista de rascunhos a partir do storage
        atualizarBadgeRascunhos(0);                       // depois de limpar, zera o contador na badge
    });
  }

  // Salvamento automático silencioso quando o usuário tenta sair da página
  window.addEventListener("beforeunload", () => {                 // registra um listener para o evento de saída/recarga da página
    try {
      salvarRascunhoAutomatico();                                 // tenta salvar o estado atual do formulário como rascunho local
    } catch (error) {
      // Em caso de erro, apenas registra no console; não deve bloquear a saída da página.
      console.error("Erro no salvamento automático de rascunho ao sair da página:", error); // loga o erro para diagnóstico
    }
  });

  if (clienteNomeInput) {                                         // se o select de cliente existir

    atualizarVisibilidadeClienteOutro();                          // aplica o estado inicial da visibilidade do campo "Outro"
    clienteNomeInput.addEventListener("change", () => {           // registra evento de mudança no select de cliente
      atualizarVisibilidadeClienteOutro();                        // ao mudar o valor, atualiza a visibilidade do campo "Outro"
    });
  }

  if (q1NovoPatch) {                                              // se o select "Necessita novo patch panel?" existir
    atualizarVisibilidadeModeloPatchPanel();                      // aplica o estado inicial da visibilidade do bloco de modelo
    q1NovoPatch.addEventListener("change", () => {                // registra evento de mudança nesse select
      atualizarVisibilidadeModeloPatchPanel();                    // ao mudar o valor, atualiza a visibilidade do bloco de modelo
    });
  }

  if (q1ModeloPatchPanel) {                                       // se o select de modelo de patch panel existir
    atualizarVisibilidadeModeloPatchPanelOutro();                 // ajusta a visibilidade do campo "Outro" de modelo
    q1ModeloPatchPanel.addEventListener("change", () => {         // registra evento de mudança no select de modelo
      atualizarVisibilidadeModeloPatchPanelOutro();               // ao mudar o valor, ajusta o campo "Outro" de modelo
    });
  }

  if (q1MarcaCab) {                                               // se o select de marca de cabeamento existir
    atualizarVisibilidadeMarcaCabOutro();                         // aplica o estado inicial de visibilidade do campo "Outro"
    q1MarcaCab.addEventListener("change", () => {                 // registra um listener para mudanças no select de marca
      atualizarVisibilidadeMarcaCabOutro();                       // ao mudar o valor, atualiza a visibilidade do campo "Outro"
    });                                                           // fim do addEventListener
  }                                                               // fim do if q1MarcaCab

  if (q1IncluirGuia) {                                              // se o select "Incluir guia de cabos?" existir
    atualizarVisibilidadeQtdGuiasCabos();                           // aplica o estado inicial ao carregar a página
    q1IncluirGuia.addEventListener("change", () => {                // registra um listener para mudanças no select
      atualizarVisibilidadeQtdGuiasCabos();                         // sempre que mudar, atualiza a visibilidade do campo de quantidade
    });
  }

  if (q3NovoDio) {                                                                 // se o select "Necessário novo DIO?" existir
    atualizarVisibilidadeModeloDio();                                              // aplica o estado inicial (útil na edição)
    q3NovoDio.addEventListener("change", () => {                                   // registra listener para mudanças no select
      atualizarVisibilidadeModeloDio();                                            // a cada mudança, atualiza a visibilidade do campo de modelo
    });
  }

    // Evento de clique no botão "Nova avaliação"
  if (novaAvaliacaoButton) {                                    // confere se o botão existe na página
    novaAvaliacaoButton.addEventListener("click", () => {       // registra o handler de clique
      if (formAvaliacao) {                                      // se o formulário estiver presente
        formAvaliacao.reset();                                  // limpa todos os campos do formulário
      }

      avaliacaoFeedbackEl.textContent = "";                     // limpa qualquer mensagem de feedback anterior
      avaliacaoFeedbackEl.className = "form-feedback";          // reseta as classes de erro/sucesso

      resetarFormularioParaNovaAvaliacao();                     // volta o estado interno para "Nova Avaliação"
      //tipo_formulario
      if (tipoFormularioInput) {                                      // se o campo hidden de tipo existir
        const tipoAtual = tipoFormularioInput.value || "utp_fibra";   // reaproveita o tipo atual ou assume "utp_fibra" como padrão
        aplicarVisibilidadeTipoFormulario(tipoAtual);                 // garante que os blocos exibidos correspondam ao tipo atual
      }
      //tipo_formulario
    });
    //tipo_formulario
    // Eventos de clique nas abas de tipo de formulário (Redes / Infraestrutura)
    if (tabButtons && tabButtons.length > 0) {                        // se existirem abas de tipo de formulário
      tabButtons.forEach((btn) => {                                  // percorre cada botão de aba
        btn.addEventListener("click", () => {                        // registra o handler de clique em cada aba
          const tipo = (btn.dataset.tipo || "utp_fibra")             // lê o atributo data-tipo da aba clicada
            .toString()                                              // garante que seja string
            .toLowerCase();                                          // normaliza para minúsculas

          if (tipoFormularioInput) {                                 // se o input hidden de tipo existir
            tipoFormularioInput.value = tipo;                        // atualiza o hidden com o tipo escolhido
          }

          aplicarVisibilidadeTipoFormulario(tipo);                   // aplica a visibilidade das seções conforme o tipo
        });
      });
    }

    // Define um tipo padrão e aplica visibilidade inicial ao carregar a tela
    if (tipoFormularioInput && !tipoFormularioInput.value) {               // se houver input hidden e ele ainda estiver vazio
      tipoFormularioInput.value = "utp_fibra";                             // define "utp_fibra" como tipo padrão
    }
    if (tipoFormularioInput) {                                             // se o input hidden existir
      aplicarVisibilidadeTipoFormulario(tipoFormularioInput.value);       // aplica a visibilidade inicial conforme o valor atual
    }
    //tipo_formulario

  }
  
  if (q3MarcaCabOptico) {                                                      // se o select de marca de cabo óptico existir
    atualizarVisibilidadeMarcaCaboOpticoOutro();                               // aplica o estado inicial da visibilidade do campo "Outro"
    q3MarcaCabOptico.addEventListener("change", () => {                        // registra um listener para mudança de valor
      atualizarVisibilidadeMarcaCaboOpticoOutro();                             // ao mudar a seleção, atualiza a visibilidade do campo "Outro"
    });
  }

  // Evento de submit do formulário de troca de senha (modal)
  if (passwordForm) {
    passwordForm.addEventListener("submit", enviarTrocaSenha);
  }

    // Evento de submit do formulário de gestão de usuários (apenas admins enxergam o card)
  if (userForm) {                                              // verifica se o formulário existe no DOM
    userForm.addEventListener("submit", salvarUsuario);        // associa o envio do formulário à função que cria usuários
  }

}

/**
 * Função chamada quando o DOM termina de carregar.
 * Verifica se já existe token salvo; se sim, tenta restaurar sessão.
 * Caso contrário, mostra a tela de login.
 */
async function inicializarApp() {
  // Registra listeners de eventos
  registrarEventos();

  inicializarListaMateriaisInfra(); // prepara a tabela de lista de materiais de infraestrutura (linhas iniciais e botão "Nova linha")
  inicializarListaFotosSwitchQ2();  // prepara a tabela dinâmica de fotos do switch (Q2), criando a linha inicial e handlers

  // Tenta carregar token salvo no navegador
  const tokenSalvo = getStoredToken();

  // Verifica se este navegador já teve uma sessão autenticada em algum momento
  const jaTeveSessao =
    typeof localStorage !== "undefined" && // confere se o localStorage está disponível no ambiente
    localStorage.getItem(SESSION_MARKER_KEY) === "1"; // lê a chave de marcador de sessão e compara com "1"

  if (!tokenSalvo) {
    // Se não houver token salvo, verificamos se o navegador já teve sessão antes
    if (jaTeveSessao && loginErrorEl) {
      // Caso já tenha tido sessão, avisamos que a sessão expirou
      loginErrorEl.textContent =
        "Sua sessão expirou. Entre novamente para continuar."; // mensagem amigável de sessão expirada
    } else if (loginErrorEl) {
      // Se for o primeiro acesso (ou nunca marcou sessão), limpamos qualquer mensagem antiga
      loginErrorEl.textContent = ""; // garante que não haja erro “preso” de tentativas anteriores
    }

    // Em ambos os casos (com ou sem sessão anterior), mostramos a tela de login
    mostrarTelaLogin(); // exibe a tela de login como estado inicial
    return; // interrompe a inicialização, pois não temos usuário autenticado
  }

  // Se encontrou token, guardamos em memória
  setAuthToken(tokenSalvo);

  try {
    // Tentamos carregar dados do usuário com este token
    await carregarDadosUsuario();

    // Se deu certo, exibimos a tela principal
    mostrarTelaApp();

    // Carrega a lista de avaliações
    await carregarAvaliacoes();

    atualizarVisibilidadeGestaoUsuarios();                     // ajusta a área de gestão de usuários ao restaurar a sessão

    resetarFormularioParaNovaAvaliacao(); // ajusta título/subtítulo e estado ao restaurar sessão com token salvo
    renderizarListaRascunhos(); // carrega também os rascunhos locais salvos para o usuário atual

    // Caso o usuário ainda precise trocar a senha, abrimos o modal
    if (currentUser && currentUser.precisa_trocar_senha) {
      abrirModalSenha();
    }
  } catch (err) {
    // Se qualquer erro acontecer (inclusive de autenticação), voltamos para login
    console.error(err);
    handleAuthError();
  }
}

/**
 * Registra eventos para a lista de materiais de infraestrutura.
 * - Teclado: ao pressionar Enter na última linha, cria uma nova linha automaticamente.
 * - Clique: ao clicar na lixeira, remove a linha correspondente.
 */
function registrarEventosListaMateriaisInfra() {
  if (!infraListaMateriaisTbody) {                                       // verifica se o corpo da tabela de materiais existe no DOM
    return;                                                              // se não existir (por alguma razão), encerra a função sem registrar eventos
  }

  infraListaMateriaisTbody.addEventListener("keydown", (event) => {      // adiciona um listener de tecla pressionada no corpo da tabela (event delegation)
    const alvo = event.target;                                           // captura o elemento que recebeu o foco e disparou o evento

    if (!alvo || alvo.tagName !== "INPUT") {                             // se não houver alvo ou se o alvo não for um campo de input
      return;                                                            // não fazemos nada (ignora teclas em outros elementos)
    }

    if (event.key !== "Enter") {                                         // verifica se a tecla pressionada é diferente de Enter
      return;                                                            // se não for Enter, não queremos interferir, então encerramos aqui
    }

    const linhaAtual = alvo.closest(".infra-lista-materiais-linha");     // busca a linha (tr) mais próxima que representa a linha de materiais atual
    if (!linhaAtual) {                                                   // se não encontrar uma linha correspondente
      return;                                                            // não há o que fazer, encerra o handler
    }

    const linhas = infraListaMateriaisTbody.querySelectorAll(            // busca todas as linhas de materiais atualmente na tabela
      ".infra-lista-materiais-linha"
    );
    if (!linhas || linhas.length === 0) {                                // se, por algum motivo, não houver linhas
      return;                                                            // encerra sem tentar criar nova linha
    }

    const ultimaLinha = linhas[linhas.length - 1];                       // considera a última linha da lista como referência

    if (linhaAtual === ultimaLinha) {                                    // se a linha em que o usuário está é a última linha da tabela
      event.preventDefault();                                            // impede o comportamento padrão do Enter (como submit do formulário)
      criarLinhaListaMateriaisInfra();                                   // chama a função que cria e adiciona uma nova linha à tabela (com foco no primeiro campo)
    }                                                                    // se não for a última linha, nada é feito (deixa o Enter ter efeito padrão, se houver)
  });

  infraListaMateriaisTbody.addEventListener("click", (event) => {        // adiciona um listener de clique no corpo da tabela (event delegation para os botões de lixeira)
    const alvo = event.target;                                           // captura o elemento exato em que o usuário clicou

    if (!alvo) {                                                         // se por algum motivo não houver alvo
      return;                                                            // encerra o handler sem fazer nada
    }

    const botaoRemover = alvo.closest(".infra-remover-linha");           // procura o ancestral mais próximo que tenha a classe do botão de remover linha
    if (!botaoRemover) {                                                 // se o clique não tiver ocorrido em um botão de remoção (ou dentro dele)
      return;                                                            // não faz nada e encerra o handler
    }

    event.preventDefault();                                              // evita qualquer comportamento padrão associado ao botão

    const linha = botaoRemover.closest(".infra-lista-materiais-linha");  // obtém a linha da tabela (tr) associada ao botão clicado
    if (!linha) {                                                        // se não foi possível encontrar a linha
      return;                                                            // encerra sem tentar remover
    }

    removerLinhaListaMateriaisInfra(linha);                              // chama o helper que trata a remoção (ou limpeza) da linha na tabela
  });
}

// Garante que inicializamos somente após o DOM estar pronto
document.addEventListener("DOMContentLoaded", () => {
  inicializarApp();                         // inicia a aplicação (login, carregamento de avaliações, etc.)
  registrarEventosListaMateriaisInfra();    // registra os eventos de teclado da lista de materiais de infraestrutura (Enter na última linha cria nova linha)
  // ================== RASCUNHOS: TOGGLE DO ACCORDION ==================
  // Função de inicialização do comportamento de abre/fecha da seção de rascunhos
  (function initRascunhosToggle() {                            // IIFE para rodar assim que o script for carregado
    const rascunhosCard = document.querySelector('.card-list-rascunho'); // pega o card amarelo de rascunhos
    const toggleButton  = document.getElementById('btn-toggle-rascunhos'); // pega o botão que funciona como "aba"

    if (!rascunhosCard || !toggleButton) return;              // se por algum motivo não encontrar os elementos, sai silenciosamente

    toggleButton.addEventListener('click', () => {            // adiciona um ouvinte de clique no botão de toggle
      rascunhosCard.classList.toggle('rascunhos-collapsed');  // alterna a classe que colapsa/expande o painel
    });                                                       // fim da função de clique
  })();                                                       // executa imediatamente a função de inicialização

});

// ================== RASCUNHOS: BADGE DE QUANTIDADE ==================

// Atualiza o número exibido na badge ao lado do título
function atualizarBadgeRascunhos(qtdRascunhos) {                  // recebe a quantidade de rascunhos
  const badge = document.getElementById('rascunhos-count-badge'); // pega o span da badge pelo id

  if (!badge) return;                                             // se não existir (HTML não foi renderizado), não faz nada

  const numero = Number(qtdRascunhos) || 0;                       // garante que a quantidade seja um número (fallback para 0)

  badge.textContent = numero.toString();                          // escreve o valor na badge como texto
}

// Versão que lê direto do localStorage usando sua função existente
function atualizarBadgeRascunhosAPartirDoStorage() {              // função auxiliar para usar no fluxo atual
  try {                                                           // bloco try/catch para evitar quebrar a tela
    const todos = lerRascunhosDoStorage();                        // usa a função que você já tem para ler os rascunhos locais
    const qtd = Array.isArray(todos) ? todos.length : 0;          // se for array pega o length, senão assume 0
    atualizarBadgeRascunhos(qtd);                                 // chama a função que atualiza o texto da badge
  } catch (erro) {                                                // se der algum erro ao ler o storage
    console.error('Erro ao atualizar badge de rascunhos:', erro); // loga no console para debug
    atualizarBadgeRascunhos(0);                                   // garante que a badge não fique com lixo visual
  }
}

function criarLinhaListaFotosSwitchQ2({ deveFocar = true } = {}) {
  if (!q2SwitchFotosTbody) { // se o corpo da tabela de fotos não existir na página atual
    return null;             // encerra a função retornando null (não há onde inserir novas linhas)
  }

  const linhaModelo = q2SwitchFotosTbody.querySelector(".q2-switch-fotos-linha"); // captura uma linha modelo existente na tabela
  if (!linhaModelo) {        // se nenhuma linha modelo for encontrada (cenário improvável)
    return null;             // encerra a função sem criar nada
  }

  const novaLinha = linhaModelo.cloneNode(true); // clona a linha modelo, incluindo a estrutura de células, inputs e botão de remover

  const inputUrl = novaLinha.querySelector(".q2-switch-foto-url-input"); // localiza o campo de URL da nova linha
  const inputDescricao = novaLinha.querySelector(".q2-switch-foto-descricao-input"); // localiza o campo de descrição da nova linha

  if (inputUrl) {            // se o campo de URL existir na linha clonada
    inputUrl.value = "";     // limpa qualquer valor herdado da linha modelo
  }
  if (inputDescricao) {      // se o campo de descrição existir na linha clonada
    inputDescricao.value = ""; // limpa qualquer valor herdado da linha modelo
  }

  q2SwitchFotosTbody.appendChild(novaLinha); // insere a nova linha clonada no final da tabela de fotos

  if (deveFocar && inputUrl) { // se for solicitado para focar e o campo de URL estiver disponível
    inputUrl.focus();          // coloca o foco no campo de URL para o usuário digitar imediatamente
  }

  return novaLinha;          // retorna a referência da linha criada para usos futuros, se necessário
}

function inicializarListaFotosSwitchQ2() {
  if (!q2SwitchFotosTbody) { // se o corpo da tabela de fotos não existir, significa que o formulário não está na tela
    return;                  // encerra a função sem fazer nada
  }

  let linhaExistente = q2SwitchFotosTbody.querySelector(".q2-switch-fotos-linha"); // tenta localizar uma linha já definida no HTML
  if (!linhaExistente) {     // se nenhuma linha existente for encontrada
    linhaExistente = criarLinhaListaFotosSwitchQ2({ deveFocar: false }); // cria uma primeira linha vazia sem alterar o foco
  }

  q2SwitchFotosTbody.addEventListener("keydown", (event) => { // registra um listener de teclado no corpo da tabela de fotos
    if (event.key !== "Enter") { // só tratamos especificamente a tecla Enter
      return;                    // para qualquer outra tecla, não fazemos nada
    }

    const alvo = event.target;   // captura o elemento que recebeu o evento de teclado
    if (!alvo) {                 // se não houver alvo, algo está errado
      return;                    // encerra o handler
    }

    const linhaAtual = alvo.closest(".q2-switch-fotos-linha"); // encontra a linha de fotos associada ao campo em foco
    if (!linhaAtual) {          // se a linha não for encontrada
      return;                   // encerra o handler
    }

    const linhas = q2SwitchFotosTbody.querySelectorAll(".q2-switch-fotos-linha"); // obtém todas as linhas atuais da tabela
    if (!linhas || linhas.length === 0) { // se não houver nenhuma linha definida
      return;                   // não há o que fazer
    }

    const ultimaLinha = linhas[linhas.length - 1]; // identifica a última linha atualmente presente na tabela
    if (linhaAtual === ultimaLinha) {  // se o Enter foi pressionado na última linha
      event.preventDefault();          // impede o comportamento padrão (como submit do formulário)
      criarLinhaListaFotosSwitchQ2({ deveFocar: true }); // cria uma nova linha e posiciona o foco no campo de URL da nova linha
    }
  });

  q2SwitchFotosTbody.addEventListener("click", (event) => { // registra um listener de clique para tratar os botões de remover
    const alvo = event.target;   // captura o elemento clicado
    if (!alvo) {                 // se não houver alvo, encerra
      return;
    }

    const botaoRemover = alvo.closest(".q2-switch-foto-remover"); // verifica se o clique ocorreu em um botão de remoção
    if (!botaoRemover) {        // se não for o botão de remover
      return;                   // não fazemos nada
    }

    const linha = botaoRemover.closest(".q2-switch-fotos-linha"); // encontra a linha de fotos associada ao botão clicado
    if (!linha) {               // se não encontrar linha correspondente
      return;                   // encerra o handler
    }

    const linhas = q2SwitchFotosTbody.querySelectorAll(".q2-switch-fotos-linha"); // obtém todas as linhas de fotos atuais
    if (linhas.length > 1) {    // se existir mais de uma linha na tabela
      linha.remove();           // remove a linha clicada completamente
    } else {
      const inputUrl = linha.querySelector(".q2-switch-foto-url-input"); // captura o campo de URL da única linha
      const inputDescricao = linha.querySelector(".q2-switch-foto-descricao-input"); // captura o campo de descrição

      if (inputUrl) {           // se o campo de URL existir
        inputUrl.value = "";    // limpa o valor preenchido
      }
      if (inputDescricao) {     // se o campo de descrição existir
        inputDescricao.value = ""; // limpa o valor preenchido
      }
    }
  });

  if (q2SwitchAdicionarFotoButton) { // se o botão "Adicionar foto +" estiver presente no DOM
    q2SwitchAdicionarFotoButton.addEventListener("click", () => { // registra o listener de clique no botão
      try {
        // Antes de abrir câmera/galeria, tentamos salvar um rascunho automático
        // Isso não salva fotos, mas preserva todos os demais campos do formulário
        salvarRascunhoAutomatico();                               // força o autosave com o estado atual do formulário
      } catch (e) {
        console.error(
          "Falha ao salvar rascunho automático antes de abrir seletor de fotos:",
          e
        );                                                        // em caso de erro, apenas registramos no console e seguimos o fluxo
      }

      if (avaliacaoEmEdicaoId && q2SwitchFotoFileInput) {         // se estamos editando uma avaliação já salva e o input de arquivo existir
        q2SwitchFotoFileInput.value = "";                         // limpa qualquer seleção anterior para garantir novo envio
        q2SwitchFotoFileInput.click();                            // dispara o seletor de arquivos/câmera do navegador
      } else {
        criarLinhaListaFotosSwitchQ2({ deveFocar: true });        // se ainda não há avaliação salva, adiciona linha para preencher URL manualmente
      }
    });
  }


  if (q2SwitchFotoFileInput) {                                    // se o input de arquivo escondido estiver disponível no DOM
    q2SwitchFotoFileInput.addEventListener("change", async (event) => {
      const arquivos = Array.from(event.target.files || []);      // converte a lista de arquivos selecionados em um array "normal"

      if (!arquivos.length) {                                     // se o usuário cancelou a seleção ou não escolheu nada        return;                                                   // encerra o handler
      }

      if (!avaliacaoEmEdicaoId) {                                 // se por algum motivo não houver avaliação em edição
        alert(
          "Para anexar fotos diretamente pelo navegador/câmera, primeiro salve a avaliação e reabra em modo de edição."
        );                                                        // informa ao usuário que o upload automático depende de uma avaliação já criada
        q2SwitchFotoFileInput.value = "";                         // limpa a seleção do input de arquivo
        return;                                                   // encerra o handler sem tentar fazer upload
      }

      for (const arquivo of arquivos) {                           // percorre cada arquivo selecionado
        try {
          const fotoCriada = await enviarArquivoFotoSwitchQ2ParaBackend(
            arquivo
          );                                                      // envia o arquivo para o backend e recebe os dados da foto registrada

          if (fotoCriada && fotoCriada.arquivo_url) {             // se o backend retornou uma URL de arquivo válida
            preencherOuCriarLinhaFotosSwitchQ2ComUrl(
              fotoCriada.arquivo_url
            );                                                    // preenche ou cria uma linha na tabela com a URL retornada
          }
        } catch (err) {
          console.error("Erro ao enviar foto do switch (Q2):", err); // registra o erro detalhado no console
          alert(
            "Erro ao enviar uma das fotos. Verifique sua conexão e tente novamente."
          );                                                      // exibe uma mensagem de erro amigável ao usuário
          break;                                                  // interrompe o loop em caso de erro, para evitar múltiplos alertas
        }
      }

      q2SwitchFotoFileInput.value = "";                           // ao final, limpa o input para permitir novo envio com os mesmos arquivos se necessário
    });
  }
}


function coletarListaFotosSwitchQ2DoFormulario() {
  if (!q2SwitchFotosTbody) { // se a tabela de fotos não estiver presente na página
    return [];               // devolve um array vazio, indicando que não há fotos para coletar
  }

  const linhas = q2SwitchFotosTbody.querySelectorAll(".q2-switch-fotos-linha"); // seleciona todas as linhas de fotos da tabela
  if (!linhas || linhas.length === 0) { // se não houver linhas definidas
    return [];               // devolve array vazio
  }

  const lista = [];          // inicializa o array que acumulará as fotos válidas

  linhas.forEach((linha) => { // percorre cada linha encontrada
    const inputUrl = linha.querySelector(".q2-switch-foto-url-input"); // localiza o campo de URL na linha
    const inputDescricao = linha.querySelector(".q2-switch-foto-descricao-input"); // localiza o campo de descrição na linha

    const url =
      inputUrl && inputUrl.value && inputUrl.value.trim() // verifica se existe um valor preenchido para a URL
        ? inputUrl.value.trim()                           // normaliza a URL removendo espaços nas extremidades
        : "";                                             // caso contrário, considera string vazia

    const descricao =
      inputDescricao && inputDescricao.value && inputDescricao.value.trim() // verifica se existe descrição preenchida
        ? inputDescricao.value.trim()                                      // normaliza a descrição
        : "";                                                              // considera string vazia se não houver

    if (url) {                // somente linhas com URL preenchida são consideradas válidas
      lista.push({            // adiciona um objeto representando a foto à lista
        url,                  // URL da foto
        descricao: descricao || null, // descrição ou null, se a string estiver vazia
      });
    }
  });

  return lista;               // devolve o array de fotos coletadas a partir do formulário
}

function preencherOuCriarLinhaFotosSwitchQ2ComUrl(url) {
  if (!q2SwitchFotosTbody) {                             // se a tabela de fotos não estiver presente na página
    return;                                              // encerra sem fazer nada
  }

  const urlNormalizada =
    url && typeof url === "string" && url.trim()         // verifica se foi passada uma string não vazia
      ? url.trim()                                       // remove espaços das extremidades da URL
      : "";                                              // caso contrário, considera string vazia

  if (!urlNormalizada) {                                 // se após normalizar a URL ainda estiver vazia
    return;                                              // não faz sentido preencher/criar linha com valor vazio
  }

  const linhas = q2SwitchFotosTbody.querySelectorAll(
    ".q2-switch-fotos-linha"
  );                                                     // captura todas as linhas atuais da tabela de fotos

  let linhaAlvo = null;                                  // variável que guardará a linha escolhida para receber a URL

  if (linhas && linhas.length > 0) {                     // se existem linhas na tabela
    for (const linha of linhas) {                        // percorre cada linha existente
      const inputUrl = linha.querySelector(
        ".q2-switch-foto-url-input"
      );                                                 // pega o campo de URL desta linha

      if (
        inputUrl &&                                      // se o campo existir
        (!inputUrl.value || !inputUrl.value.trim())      // e estiver vazio (sem URL preenchida)
      ) {
        linhaAlvo = linha;                               // escolhe esta linha como candidata para receber a nova URL
        break;                                           // interrompe o loop após encontrar a primeira linha vazia
      }
    }
  }

  if (!linhaAlvo) {                                      // se não encontramos nenhuma linha vazia adequada
    linhaAlvo = criarLinhaListaFotosSwitchQ2({           // criamos uma nova linha baseada no modelo
      deveFocar: false,                                  // não alteramos foco ao criar essa linha
    });
  }

  if (!linhaAlvo) {                                      // se ainda assim não for possível obter uma linha válida
    return;                                              // encerramos a função silenciosamente
  }

  const inputUrlAlvo = linhaAlvo.querySelector(
    ".q2-switch-foto-url-input"
  );                                                     // recupera o campo de URL da linha escolhida

  if (inputUrlAlvo) {                                    // se o campo existir
    inputUrlAlvo.value = urlNormalizada;                 // preenche o campo com a URL normalizada
  }
}

function preencherListaFotosSwitchQ2APartirDeValorUnico(url) {
  if (!q2SwitchFotosTbody) {                             // se a tabela de fotos não existir na tela
    return;                                              // encerra sem fazer nada
  }

  q2SwitchFotosTbody.innerHTML = "";                     // limpa todas as linhas atuais da tabela

  if (url && typeof url === "string" && url.trim()) {    // se foi fornecida uma URL válida (não vazia)
    preencherOuCriarLinhaFotosSwitchQ2ComUrl(url);       // delega para o helper que preenche ou cria linha conforme a necessidade
  } else {
    criarLinhaListaFotosSwitchQ2({ deveFocar: false });  // se não houver URL válida, apenas recria uma linha vazia padrão
  }
}

/**
 * Cria uma nova linha na lista de materiais de infraestrutura,
 * clonando a linha modelo existente no tbody e limpando seus campos.
 *
 * Parâmetro opcional:
 * - deveFocar (boolean): quando true, o foco vai para o primeiro input da nova linha.
 *   Usado em ações do usuário (Enter / botão "Nova linha").
 */
function criarLinhaListaMateriaisInfra({ deveFocar = true } = {}) {
  if (!infraListaMateriaisTbody) { // verifica se o corpo da tabela de materiais está disponível no DOM
    return null;                   // se não existir (por algum motivo), encerra a função retornando null
  }

  const linhaModelo = infraListaMateriaisTbody.querySelector(".infra-lista-materiais-linha"); // busca a primeira linha com a classe usada como modelo
  if (!linhaModelo) { // se nenhuma linha modelo for encontrada
    return null;      // não há como clonar, então encerra a função retornando null
  }

  const novaLinha = linhaModelo.cloneNode(true); // clona a linha modelo, incluindo toda a estrutura interna (células e inputs)

  const inputs = novaLinha.querySelectorAll("input"); // seleciona todos os inputs dentro da nova linha
  inputs.forEach((input) => { // percorre cada input encontrado na nova linha
    input.value = "";         // zera o valor do campo para que a nova linha comece vazia
  });

  infraListaMateriaisTbody.appendChild(novaLinha); // adiciona a nova linha ao final do corpo da tabela

  if (deveFocar) {                                      // verifica se a chamada solicitou mover o foco para a nova linha
    const primeiroInput = novaLinha.querySelector("input"); // busca o primeiro input da nova linha
    if (primeiroInput) {                             // se o primeiro input existir
      primeiroInput.focus();                         // move o foco para esse input para facilitar a digitação contínua
    }
  }

  return novaLinha; // retorna a referência da nova linha criada (caso alguém queira usar no futuro)
}


/**
 * Limpa completamente a tabela de materiais de infraestrutura,
 * preservando uma única linha vazia (a linha modelo).
 */
function limparTabelaMateriaisInfra() {
  if (!infraListaMateriaisTbody) { // verifica se o corpo da tabela está disponível
    return;                        // se não estiver, não há o que limpar e a função é encerrada
  }

  const linhas = infraListaMateriaisTbody.querySelectorAll(".infra-lista-materiais-linha"); // obtém todas as linhas de materiais atuais
  if (!linhas || linhas.length === 0) {                         // se não houver nenhuma linha encontrada
    criarLinhaListaMateriaisInfra({ deveFocar: false });        // cria uma linha nova sem focar, apenas para garantir que exista pelo menos uma linha editável
    return;                                                     // encerra após criar a nova linha
  }

  const primeiraLinha = linhas[0]; // considera a primeira linha como linha base/modelo a ser preservada

  const inputsPrimeiraLinha = primeiraLinha.querySelectorAll("input"); // seleciona todos os inputs da primeira linha
  inputsPrimeiraLinha.forEach((input) => { // percorre cada input da primeira linha
    input.value = "";                     // limpa o valor para que a linha fique completamente vazia
  });

  for (let i = 1; i < linhas.length; i++) {                        // percorre as demais linhas (a partir do índice 1)
    infraListaMateriaisTbody.removeChild(linhas[i]);               // remove cada linha extra do corpo da tabela
  }
}

/**
 * Inicializa o comportamento da lista de materiais de infraestrutura:
 * - garante que exista pelo menos uma linha na tabela;
 * - conecta o botão "Nova linha" para adicionar novas linhas.
 */
function inicializarListaMateriaisInfra() {
  if (!infraListaMateriaisTbody) { // verifica se o corpo da tabela existe na página atual
    return;                        // se não existir, significa que o formulário não está presente, então encerra
  }

  const linhaExistente = infraListaMateriaisTbody.querySelector(".infra-lista-materiais-linha"); // tenta localizar uma linha já definida no HTML
  if (!linhaExistente) {                              // se nenhuma linha for encontrada (cenário improvável, mas tratado por segurança)
    criarLinhaListaMateriaisInfra({ deveFocar: false }); // cria uma primeira linha vazia sem alterar o foco da página
  }

  if (infraAdicionarLinhaButton) {                                                // verifica se o botão "Nova linha" está presente no DOM
    infraAdicionarLinhaButton.addEventListener("click", () => {                   // registra o listener de clique no botão
      criarLinhaListaMateriaisInfra();                                            // ao clicar, cria e adiciona uma nova linha à tabela
    });
  }
}

function inicializarListaMateriaisInfra() {
  if (!infraListaMateriaisTbody) { // verifica se o corpo da tabela existe na página atual
    return;                        // se não existir, significa que o formulário não está presente, então encerra
  }

  const linhaExistente = infraListaMateriaisTbody.querySelector(".infra-lista-materiais-linha"); // tenta localizar uma linha já definida no HTML
  if (!linhaExistente) {          // se nenhuma linha for encontrada (cenário improvável, mas tratado por segurança)
    criarLinhaListaMateriaisInfra(); // cria uma primeira linha vazia para o usuário preencher
  }

  if (infraAdicionarLinhaButton) {                                                // verifica se o botão "Nova linha" está presente no DOM
    infraAdicionarLinhaButton.addEventListener("click", () => {                   // registra o listener de clique no botão
      criarLinhaListaMateriaisInfra();                                            // ao clicar, cria e adiciona uma nova linha à tabela
    });
  }
}

/**
 * Coleta os dados da tabela de lista de materiais de infraestrutura
 * e devolve um array de objetos simples para uso em rascunhos ou envio à API.
 */
function coletarListaMateriaisInfraDoFormulario() {
  if (!infraListaMateriaisTbody) { // se o corpo da tabela não existir na página
    return []; // devolve um array vazio, pois não há lista de materiais para coletar
  }

  const linhas = infraListaMateriaisTbody.querySelectorAll(".infra-lista-materiais-linha"); // captura todas as linhas de materiais definidas na tabela
  const lista = []; // inicializa o array que acumulará os itens da lista de materiais

  linhas.forEach((linha) => { // percorre cada linha encontrada na tabela
    const inputEquipamento = linha.querySelector(".infra-lista-materiais-equipamento"); // localiza o campo de equipamento/material na linha
    const inputModelo = linha.querySelector(".infra-lista-materiais-modelo"); // localiza o campo de modelo na linha
    const inputQuantidade = linha.querySelector(".infra-lista-materiais-quantidade"); // localiza o campo de quantidade na linha
    const inputFabricante = linha.querySelector(".infra-lista-materiais-fabricante"); // localiza o campo de fabricante na linha

    const equipamento = inputEquipamento && inputEquipamento.value // verifica se o input de equipamento existe e possui algum valor
      ? inputEquipamento.value.trim() // se houver valor, normaliza removendo espaços nas extremidades
      : ""; // se não houver valor, usa string vazia

    const modelo = inputModelo && inputModelo.value // verifica se o input de modelo existe e possui algum valor
      ? inputModelo.value.trim() // normaliza o texto do modelo removendo espaços extras
      : ""; // se não houver valor, usa string vazia

    const quantidade = inputQuantidade && inputQuantidade.value // verifica se o input de quantidade existe e possui algum valor
      ? inputQuantidade.value.trim() // normaliza o texto da quantidade como string
      : ""; // se não houver valor, usa string vazia

    const fabricante = inputFabricante && inputFabricante.value // verifica se o input de fabricante existe e possui algum valor
      ? inputFabricante.value.trim() // normaliza o texto do fabricante removendo espaços nas extremidades
      : ""; // se não houver valor, usa string vazia

    const todosCamposVazios =
      !equipamento && !modelo && !quantidade && !fabricante; // verifica se todos os campos da linha estão vazios

    if (todosCamposVazios) { // se a linha estiver completamente vazia
      return; // ignora esta linha e segue para a próxima
    }

    lista.push({
      equipamento, // adiciona o valor do equipamento/material no objeto da linha
      modelo, // adiciona o modelo preenchido (se houver) no objeto da linha
      quantidade, // adiciona a quantidade como string (facilitando a edição futura no rascunho)
      fabricante, // adiciona o fabricante informado (se houver) no objeto da linha
    }); // insere o objeto desta linha no array principal de lista de materiais
  });

  return lista; // devolve o array de itens de materiais coletados da tabela
}

/**
 * Preenche a tabela de materiais de infraestrutura a partir de um array
 * previamente salvo (por exemplo, no rascunho local).
 */
function preencherListaMateriaisInfraAPartirDeDados(lista) {
  if (!infraListaMateriaisTbody) { // se o corpo da tabela não existir
    return; // não há onde preencher as linhas, então encerra a função
  }

  limparTabelaMateriaisInfra(); // limpa a tabela existente, deixando apenas uma linha vazia como base

  if (!Array.isArray(lista) || lista.length === 0) { // se não houver lista válida ou se o array estiver vazio
    return; // mantém apenas a linha vazia padrão e encerra a função
  }

  let primeiraLinha =
    infraListaMateriaisTbody.querySelector(".infra-lista-materiais-linha"); // obtém a linha base (primeira linha da tabela)

  lista.forEach((item, index) => { // percorre cada item do array de materiais recebido
    let linhaDestino = null; // variável que representará a linha em que os valores serão escritos

    if (index === 0 && primeiraLinha) {                 // se for o primeiro item e a linha base existir
      linhaDestino = primeiraLinha;                     // reutiliza a linha base existente para o primeiro item
    } else {
      linhaDestino = criarLinhaListaMateriaisInfra({    // para os itens seguintes, cria uma nova linha na tabela
        deveFocar: false,                               // evita mover o foco quando a tabela está sendo preenchida a partir de rascunho ou backend
      });
    }

    if (!linhaDestino) { // se por algum motivo não for possível obter/criar uma linha
      return; // interrompe o preenchimento para este item específico
    }

    const inputEquipamento = linhaDestino.querySelector(".infra-lista-materiais-equipamento"); // localiza o input de equipamento/material na linha
    const inputModelo = linhaDestino.querySelector(".infra-lista-materiais-modelo"); // localiza o input de modelo na linha
    const inputQuantidade = linhaDestino.querySelector(".infra-lista-materiais-quantidade"); // localiza o input de quantidade na linha
    const inputFabricante = linhaDestino.querySelector(".infra-lista-materiais-fabricante"); // localiza o input de fabricante na linha

    if (inputEquipamento) { // se o input de equipamento existir
      inputEquipamento.value = item && item.equipamento ? item.equipamento : ""; // escreve o valor de equipamento/material ou deixa em branco
    }

    if (inputModelo) { // se o input de modelo existir
      inputModelo.value = item && item.modelo ? item.modelo : ""; // escreve o valor de modelo ou deixa em branco
    }

    if (inputQuantidade) { // se o input de quantidade existir
      inputQuantidade.value = item && item.quantidade ? item.quantidade : ""; // escreve a quantidade ou deixa o campo vazio
    }

    if (inputFabricante) { // se o input de fabricante existir
      inputFabricante.value = item && item.fabricante ? item.fabricante : ""; // escreve o fabricante ou deixa o campo em branco
    }
  });
}

/**
 * Remove uma linha específica da lista de materiais de infraestrutura.
 * Se for a única linha existente, apenas limpa os campos ao invés de remover.
 */
function removerLinhaListaMateriaisInfra(linha) {
  if (!infraListaMateriaisTbody || !linha) {               // verifica se o corpo da tabela e a linha alvo existem
    return;                                                // se algum deles não existir, não há o que fazer
  }

  const linhas = infraListaMateriaisTbody.querySelectorAll(
    ".infra-lista-materiais-linha"
  );                                                       // obtém todas as linhas da tabela de materiais

  if (!linhas || linhas.length <= 1) {                     // se há zero ou apenas uma linha na tabela
    const inputs = linha.querySelectorAll("input");        // seleciona todos os inputs existentes nessa linha
    inputs.forEach((input) => {                            // percorre cada input da linha
      input.value = "";                                    // limpa o valor de cada campo, mantendo a linha vazia
    });
    return;                                                // encerra a função sem remover a linha do DOM
  }

  infraListaMateriaisTbody.removeChild(linha);             // se houver mais de uma linha, remove a linha alvo do corpo da tabela
}

// ================== INÍCIO: SUPORTE DE AUDITORIA NO FRONT ==================

// Mapa em memória para recuperar dados de usuários pela chave id (apenas para exibir nomes nos logs)
let AUDIT_MAPA_USUARIOS = {}; // cria um objeto global onde a chave será o id do usuário e o valor será o próprio objeto de usuário

// Mapa em memória para recuperar dados de avaliações pela chave id (para exibir informações legíveis no select)
let AUDIT_MAPA_AVALIACOES = {}; // cria outro objeto global onde a chave será o id da avaliação e o valor será o objeto com dados da avaliação

// Função auxiliar para tentar resumir o campo "detalhes" da auditoria
function resumirDetalhesAuditoria(detalhesBruto) { // declara função que recebe a string detalhes recebida da API
  if (!detalhesBruto) { // verifica se o valor é vazio, null ou undefined
    return ""; // se for vazio, retorna string vazia
  }

  try { // inicia bloco try para tentar interpretar a string como JSON
    const obj = JSON.parse(detalhesBruto); // tenta converter a string em objeto JavaScript usando JSON.parse

    // Se o JSON tiver uma chave "acao" e mais alguma chave, montamos um resumo simples
    if (obj.acao && typeof obj === "object") { // verifica se existe a propriedade "acao" e se é um objeto
      // Monta uma lista de pares chave: valor (ignorando "acao" porque já vai na frente)
      const partes = []; // cria array vazio para acumular partes de texto

      Object.keys(obj).forEach((chave) => { // percorre todas as chaves do objeto
        if (chave === "acao") { // se a chave for "acao"
          return; // não adiciona ao array de partes, porque já será usada no início
        }
        const valor = obj[chave]; // obtém o valor associado à chave atual
        if (valor !== null && valor !== undefined && valor !== "") { // garante que o valor não é vazio
          partes.push(`${chave}: ${valor}`); // adiciona ao array uma string no formato "chave: valor"
        }
      });

      const detalhesExtra = partes.join(" | "); // junta todas as partes com separador " | "
      if (detalhesExtra) { // se houver conteúdo extra além de "acao"
        return `${obj.acao} – ${detalhesExtra}`; // retorna string com a ação e os detalhes extras
      }
      return String(obj.acao); // se não houver detalhes extras, retorna apenas a ação em formato string
    }

    // Se não tiver chave "acao", mostramos o JSON inteiro compactado
    return JSON.stringify(obj); // converte o objeto JSON de volta para string em formato JSON
  } catch (e) { // se der erro no JSON.parse, cai aqui
    // Se não for JSON válido, devolve o texto original
    return detalhesBruto; // retorna a mesma string recebida, sem alterações
  }
}

// Carrega a lista de usuários apenas para preencher o select e o mapa interno
async function carregarUsuariosParaAuditoria() { // declara função assíncrona que busca usuários na API
  const select = document.getElementById("auditUserSelect"); // obtém o elemento select de usuários pelo id

  if (!select) { // se o elemento não for encontrado no DOM
    console.warn("Elemento #auditUserSelect não encontrado no DOM."); // exibe aviso no console para depuração
    return; // encerra a função sem fazer nada
  }

  select.innerHTML = '<option value="">Carregando usuários...</option>'; // define temporariamente uma opção informando que está carregando

  const resp = await fetch("/usuarios", { // chama a API GET /usuarios usando fetch
    method: "GET", // método HTTP GET
    headers: { // cabeçalhos HTTP da requisição
      "Content-Type": "application/json", // informa que esperamos JSON
      "Authorization": "Bearer " + accessToken // adiciona header de autorização com o token JWT (ajuste o nome da variável se for diferente)
    }
  });

  if (!resp.ok) { // verifica se a resposta não teve status 2xx
    console.error("Falha ao carregar usuários para auditoria:", resp.status); // mostra erro no console com o status HTTP
    select.innerHTML = '<option value="">Erro ao carregar usuários</option>'; // atualiza o select para informar erro ao usuário
    return; // encerra função
  }

  const usuarios = await resp.json(); // converte o corpo da resposta de JSON para objeto JavaScript

  AUDIT_MAPA_USUARIOS = {}; // limpa o mapa de usuários para garantir dados sincronizados

  select.innerHTML = '<option value="">Selecione um usuário...</option>'; // redefine o primeiro option como mensagem padrão

  usuarios.forEach((u) => { // percorre o array de usuários retornado pela API
    AUDIT_MAPA_USUARIOS[u.id] = u; // armazena o usuário no mapa, usando id como chave

    const opt = document.createElement("option"); // cria um novo elemento <option> para o select
    opt.value = String(u.id); // define o valor do option como o id do usuário (string)
    opt.textContent = `${u.id} - ${u.username} (${u.nome})`; // define o texto exibido combinando id, username e nome
    select.appendChild(opt); // adiciona o option ao select de usuários
  });
}

// Carrega a lista de avaliações para o select e o mapa interno
async function carregarAvaliacoesParaAuditoria() { // declara função assíncrona responsável por buscar avaliações
  const select = document.getElementById("auditAvaliacaoSelect"); // pega o select de avaliações pelo id

  if (!select) { // se o elemento não existir
    console.warn("Elemento #auditAvaliacaoSelect não encontrado no DOM."); // mostra aviso no console
    return; // encerra função
  }

  select.innerHTML = '<option value="">Carregando avaliações...</option>'; // mostra mensagem de carregamento no select

  const resp = await fetch("/avaliacoes", { // chama a API GET /avaliacoes
    method: "GET", // método HTTP GET
    headers: { // cabeçalhos HTTP
      "Content-Type": "application/json", // especifica que esperamos JSON
      "Authorization": "Bearer " + accessToken // envia o token JWT no cabeçalho Authorization
    }
  });

  if (!resp.ok) { // se status não for 2xx
    console.error("Falha ao carregar avaliações para auditoria:", resp.status); // loga erro com o status HTTP
    select.innerHTML = '<option value="">Erro ao carregar avaliações</option>'; // informa erro ao usuário no select
    return; // encerra a função
  }

  const avaliacoes = await resp.json(); // converte o corpo da resposta de JSON para array de objetos

  AUDIT_MAPA_AVALIACOES = {}; // reseta o mapa de avaliações

  select.innerHTML = '<option value="">Selecione uma avaliação...</option>'; // reescreve a opção padrão

  avaliacoes.forEach((a) => { // percorre o array de avaliações
    AUDIT_MAPA_AVALIACOES[a.id] = a; // armazena cada avaliação no mapa usando id como chave

    const opt = document.createElement("option"); // cria elemento <option> para o select
    const label = `${a.id} - ${a.cliente_nome || "Sem cliente"} (${a.data_avaliacao})`; // monta texto amigável com id, cliente e data
    opt.value = String(a.id); // define valor do option como id da avaliação (string)
    opt.textContent = label; // define o texto exibido
    select.appendChild(opt); // adiciona option ao select de avaliações
  });
}

// Busca e exibe a auditoria de um usuário específico
async function carregarAuditoriaUsuarioSelecionado() { // declara função assíncrona para carregar logs de um usuário
  const select = document.getElementById("auditUserSelect"); // obtém o select de usuários
  const tbody = document.querySelector("#tabelaAuditoriaUsuarios tbody"); // obtém o corpo da tabela de auditoria de usuários

  if (!select || !tbody) { // verifica se o select ou o tbody não existem no DOM
    console.warn("Elementos da tabela de auditoria de usuários não encontrados."); // loga aviso
    return; // encerra a função
  }

  const usuarioIdStr = select.value; // pega o valor selecionado (id do usuário em formato string)
  if (!usuarioIdStr) { // se nada foi selecionado (valor vazio)
    tbody.innerHTML = ""; // limpa a tabela
    return; // encerra a função (não busca nada)
  }

  const usuarioId = parseInt(usuarioIdStr, 10); // converte o valor para número inteiro

  tbody.innerHTML = "<tr><td colspan='5'>Carregando auditoria...</td></tr>"; // exibe linha temporária informando que está carregando

  const resp = await fetch(`/usuarios/${usuarioId}/auditoria`, { // chama a API GET /usuarios/{id}/auditoria
    method: "GET", // método HTTP GET
    headers: { // cabeçalhos HTTP
      "Content-Type": "application/json", // esperamos JSON
      "Authorization": "Bearer " + accessToken // envia o token JWT no cabeçalho Authorization
    }
  });

  if (!resp.ok) { // se resposta não for 2xx
    console.error("Erro ao buscar auditoria de usuário:", resp.status); // loga o erro com status HTTP
    tbody.innerHTML = "<tr><td colspan='5'>Erro ao carregar auditoria.</td></tr>"; // mostra mensagem de erro na tabela
    return; // encerra função
  }

  const logs = await resp.json(); // converte o corpo da resposta em array de registros de auditoria

  if (!logs.length) { // se não houver registros na auditoria
    tbody.innerHTML = "<tr><td colspan='5'>Nenhum registro de auditoria para este usuário.</td></tr>"; // mostra mensagem de vazio
    return; // encerra função
  }

  tbody.innerHTML = ""; // limpa qualquer conteúdo anterior da tabela

  logs.forEach((log) => { // percorre cada registro de auditoria
    const tr = document.createElement("tr"); // cria uma nova linha na tabela

    const tdData = document.createElement("td"); // cria célula para data/hora
    tdData.textContent = log.data_hora || ""; // preenche com campo data_hora retornado pela API ou string vazia
    tr.appendChild(tdData); // adiciona célula à linha

    const tdAcao = document.createElement("td"); // cria célula para ação
    tdAcao.textContent = log.acao || ""; // preenche com código da ação
    tr.appendChild(tdAcao); // adiciona célula à linha

    const tdUsuarioAlvo = document.createElement("td"); // cria célula para usuário alvo
    const alvo = AUDIT_MAPA_USUARIOS[log.usuario_alvo_id]; // tenta obter o objeto do usuário alvo a partir do mapa
    tdUsuarioAlvo.textContent = alvo // verifica se encontrou o objeto de usuário
      ? `${alvo.id} - ${alvo.username}` // se encontrou, mostra id e username
      : String(log.usuario_alvo_id); // se não encontrou, mostra apenas o id
    tr.appendChild(tdUsuarioAlvo); // adiciona célula à linha

    const tdUsuarioAcao = document.createElement("td"); // cria célula para usuário que executou a ação
    if (log.usuario_acao_id) { // se houver id do usuário responsável
      const usrAcao = AUDIT_MAPA_USUARIOS[log.usuario_acao_id]; // tenta buscar no mapa de usuários
      tdUsuarioAcao.textContent = usrAcao // se encontrou o objeto
        ? `${usrAcao.id} - ${usrAcao.username}` // mostra id e username do usuário que executou a ação
        : String(log.usuario_acao_id); // se não achou, mostra somente o id
    } else { // se usuario_acao_id for null (por exemplo, ações automáticas)
      tdUsuarioAcao.textContent = "Automático / Sistema"; // mostra texto padrão para ações sem usuário explícito
    }
    tr.appendChild(tdUsuarioAcao); // adiciona célula à linha

    const tdDetalhes = document.createElement("td"); // cria célula para detalhes
    tdDetalhes.textContent = resumirDetalhesAuditoria(log.detalhes); // chama helper para transformar detalhes em texto amigável
    tr.appendChild(tdDetalhes); // adiciona célula à linha

    tbody.appendChild(tr); // adiciona a linha completa ao corpo da tabela
  });
}

// Busca e exibe a auditoria de uma avaliação específica
async function carregarAuditoriaAvaliacaoSelecionada() { // declara função assíncrona que carrega logs da avaliação selecionada
  const select = document.getElementById("auditAvaliacaoSelect"); // obtém o select de avaliações
  const tbody = document.querySelector("#tabelaAuditoriaAvaliacoes tbody"); // obtém o corpo da tabela de auditoria de avaliações

  if (!select || !tbody) { // verifica se algum dos elementos não foi encontrado
    console.warn("Elementos da tabela de auditoria de avaliações não encontrados."); // loga aviso no console
    return; // encerra a função
  }

  const avaliacaoIdStr = select.value; // pega o valor selecionado no select (id da avaliação como string)
  if (!avaliacaoIdStr) { // se nada foi selecionado
    tbody.innerHTML = ""; // limpa a tabela
    return; // encerra função
  }

  const avaliacaoId = parseInt(avaliacaoIdStr, 10); // converte string de id para número inteiro

  tbody.innerHTML = "<tr><td colspan='4'>Carregando auditoria...</td></tr>"; // mostra linha temporária informando que está carregando

  const resp = await fetch(`/avaliacoes/${avaliacaoId}/auditoria`, { // chama a API GET /avaliacoes/{id}/auditoria
    method: "GET", // método HTTP GET
    headers: { // cabeçalhos da requisição
      "Content-Type": "application/json", // informa que estamos lidando com JSON
      "Authorization": "Bearer " + accessToken // envia token JWT no cabeçalho Authorization
    }
  });

  if (!resp.ok) { // se a resposta não for 2xx
    console.error("Erro ao buscar auditoria de avaliação:", resp.status); // loga erro com o status HTTP
    tbody.innerHTML = "<tr><td colspan='4'>Erro ao carregar auditoria.</td></tr>"; // atualiza a tabela com mensagem de erro
    return; // encerra a função
  }

  const logs = await resp.json(); // converte o corpo da resposta em array de registros de auditoria

  if (!logs.length) { // se não houver registros de auditoria
    tbody.innerHTML = "<tr><td colspan='4'>Nenhum registro de auditoria para esta avaliação.</td></tr>"; // mostra mensagem de "vazio"
    return; // encerra função
  }

  tbody.innerHTML = ""; // limpa qualquer conteúdo anterior na tabela

  logs.forEach((log) => { // percorre cada registro de auditoria da avaliação
    const tr = document.createElement("tr"); // cria uma nova linha da tabela

    const tdData = document.createElement("td"); // célula para data/hora
    tdData.textContent = log.data_hora || ""; // preenche com campo data_hora retornado pela API
    tr.appendChild(tdData); // adiciona a célula à linha

    const tdAcao = document.createElement("td"); // célula para ação
    tdAcao.textContent = log.acao || ""; // preenche com código da ação (CRIAR, EDITAR, ADD_EQUIPAMENTO etc.)
    tr.appendChild(tdAcao); // adiciona célula à linha

    const tdUsuario = document.createElement("td"); // célula para usuário responsável
    tdUsuario.textContent = log.usuario || ""; // preenche com o campo usuario retornado (no backend está como "sistema" por enquanto)
    tr.appendChild(tdUsuario); // adiciona célula à linha

    const tdDetalhes = document.createElement("td"); // célula para detalhes
    tdDetalhes.textContent = resumirDetalhesAuditoria(log.detalhes); // converte detalhes em texto resumido usando helper
    tr.appendChild(tdDetalhes); // adiciona célula à linha

    tbody.appendChild(tr); // adiciona a linha montada ao corpo da tabela
  });
}

// Função para inicializar os eventos da tela de auditoria
function inicializarTelaAuditoria() { // declara função que liga os elementos de tela aos handlers
  const btnUser = document.getElementById("btnCarregarAuditoriaUsuario"); // pega botão de carregar auditoria de usuários
  const btnAva = document.getElementById("btnCarregarAuditoriaAvaliacao"); // pega botão de carregar auditoria de avaliações

  if (btnUser) { // se o botão de usuários existir
    btnUser.addEventListener("click", carregarAuditoriaUsuarioSelecionado); // adiciona listener de clique que chama a função de carregar logs de usuário
  }

  if (btnAva) { // se o botão de avaliações existir
    btnAva.addEventListener("click", carregarAuditoriaAvaliacaoSelecionada); // adiciona listener de clique que chama a função de carregar logs de avaliação
  }

  // Também é útil carregar as listas assim que a tela de auditoria for exibida.
  // Se você tiver uma função de navegação de abas, pode chamar estas duas funções quando abrir a aba Auditoria.
  carregarUsuariosParaAuditoria(); // dispara carregamento inicial da lista de usuários
  carregarAvaliacoesParaAuditoria(); // dispara carregamento inicial da lista de avaliações
}

// Chame `inicializarTelaAuditoria()` quando a aba de Auditoria for aberta
// Exemplo (ajuste para o seu sistema de navegação):
// - ao clicar no botão/menu "Auditoria", além de mostrar a section, chame esta função:
//   inicializarTelaAuditoria();