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
const API_BASE_URL = (function () {                               // IIFE (função imediatamente invocada) que calcula e retorna a URL base
  const hostname = window.location.hostname;                      // obtém o hostname atual da página (ex.: "localhost", "meuapp.netlify.app")

  const isLocalhost =                                             // flag indicando se estamos em ambiente de desenvolvimento local
    hostname === "localhost" || hostname === "127.0.0.1";         // considera tanto "localhost" quanto "127.0.0.1" como ambiente local

  if (isLocalhost) {                                              // se estivermos rodando localmente
    return "";                                                    // usa string vazia: as chamadas vão para a mesma origem do backend (FastAPI local)
  }

  // Para qualquer outro hostname (produção no Netlify, por exemplo),
  // apontamos para a URL pública do backend hospedado no Render.
  return "https://avaliacao-nortetel-backend.onrender.com/";                      // <-- SUBSTITUA depois pela URL real da sua API no Render
})();                                                             // a função é executada imediatamente e o valor retornado é atribuído a API_BASE_URL

// Variável global para manter o token JWT em memória enquanto a página está aberta.
let authToken = null;

// Variável global para armazenar os dados do usuário logado (nome, se é admin, etc.).
let currentUser = null;

// Variável global para controlar se estamos editando uma avaliação existente (id diferente de null)
// ou criando uma nova (valor null).
let avaliacaoEmEdicaoId = null;

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
const clienteNomeInput = document.getElementById("cliente-nome"); // input de nome do cliente
const dataAvaliacaoInput = document.getElementById("data-avaliacao"); // input de data da avaliação
const localInput = document.getElementById("local"); // input de local
const objetoInput = document.getElementById("objeto"); // input de objeto
const statusSelect = document.getElementById("status"); // select de status
const equipeSelect = document.getElementById("equipe"); // select de equipe
const responsavelInput = document.getElementById("responsavel-avaliacao"); // input de responsável
const contatoInput = document.getElementById("contato-cliente"); // input de contato do cliente
const emailClienteInput = document.getElementById("email-cliente"); // input de e-mail do cliente
const escopoTextarea = document.getElementById("escopo-texto"); // textarea de escopo / observações
//tipo_formulario
const tipoFormularioInput = document.getElementById("tipo-formulario"); // input hidden que armazena o tipo atual de formulário (redes/infraestrutura)
const tabButtons = document.querySelectorAll(".avaliacao-tab-btn"); // NodeList contendo todos os botões de aba de tipo de formulário
const blocosTipoRedes = document.querySelectorAll(".tipo-redes-only"); // blocos de campos exclusivos do tipo "Redes"
const blocosTipoInfra = document.querySelectorAll(".tipo-infra-only"); // blocos de campos exclusivos do tipo "Infraestrutura"
//tipo_formulario
// ===================== CAMPOS NOVOS =====================

// ===================== CAMPOS NOVOS =====================

// Flags gerais do serviço
const servicoForaMC = document.getElementById("servico-fora-montes-claros"); // checkbox serviço fora de Montes Claros
const servicoIntermediario = document.getElementById("servico-intermediario"); // checkbox serviço para intermediário

// Quantitativo 01 – Patch Panel / Cabeamento
const q1Categoria = document.getElementById("q1-categoria-cab");
const q1Blindado = document.getElementById("q1-blindado");
const q1NovoPatch = document.getElementById("q1-novo-patch-panel");
const q1IncluirGuia = document.getElementById("q1-incluir-guia");
const q1QtdPontosRede = document.getElementById("q1-qtd-pontos-rede");
const q1QtdCabos = document.getElementById("q1-qtd-cabos");
const q1QtdPortasPP = document.getElementById("q1-qtd-portas-patch-panel");
const q1QtdPatchCords = document.getElementById("q1-qtd-patch-cords");

// Quantitativo 02 – Switch
const q2NovoSwitch = document.getElementById("q2-novo-switch");
const q2SwitchPoe = document.getElementById("q2-switch-poe");
const q2RedeIndustrial = document.getElementById("q2-rede-industrial");
const q2QtdPontosRede = document.getElementById("q2-qtd-pontos-rede");
const q2QtdPortasSwitch = document.getElementById("q2-qtd-portas-switch");
const q2ObsSwitch = document.getElementById("q2-observacoes");

// Quantitativo 03 – Cabeamento Óptico
const q3TipoFibra = document.getElementById("q3-tipo-fibra");
const q3QtdFibrasPorCabo = document.getElementById("q3-qtd-fibras-por-cabo");
const q3TipoConector = document.getElementById("q3-tipo-conector");
const q3NovoDio = document.getElementById("q3-novo-dio");
const q3CaixaTerminacao = document.getElementById("q3-caixa-terminacao");
const q3TipoCaboOptico = document.getElementById("q3-tipo-cabo-optico");
const q3CaixaEmenda = document.getElementById("q3-caixa-emenda");
const q3QtdCabos = document.getElementById("q3-qtd-cabos");
const q3TamanhoTotal = document.getElementById("q3-tamanho-total-m");
const q3QtdFibras = document.getElementById("q3-qtd-fibras");
const q3QtdPortasDio = document.getElementById("q3-qtd-portas-dio");
const q3QtdCordoesOpticos = document.getElementById("q3-qtd-cordoes-opticos");
const q3Obs = document.getElementById("q3-observacoes");

// Quantitativo 04 – Equipamentos
const q4Camera = document.getElementById("q4-camera");
const q4NvrDvr = document.getElementById("q4-nvr-dvr");
const q4AccessPoint = document.getElementById("q4-access-point");
const q4Conversor = document.getElementById("q4-conversor-midia");
const q4Gbic = document.getElementById("q4-gbic");
const q4Switch = document.getElementById("q4-switch");

// Quantitativo 05 – Infraestrutura
const q5NovaEletrocalha = document.getElementById("q5-nova-eletrocalha");
const q5NovoEletroduto = document.getElementById("q5-novo-eletroduto");
const q5NovoRack = document.getElementById("q5-novo-rack");
const q5InstalacaoEletrica = document.getElementById("q5-instalacao-eletrica");
const q5Nobreak = document.getElementById("q5-nobreak");
const q5Serralheria = document.getElementById("q5-serralheria");

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
// Botão para limpar o formulário e voltar explicitamente ao modo "Nova Avaliação".
const novaAvaliacaoButton = document.getElementById("btn-nova-avaliacao"); // referência ao botão "Nova avaliação"
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

// ============================
// Máscara para telefone (contato do cliente)
// ============================
function formatarTelefoneBrasil(valorDigitado) {                    // função que recebe o texto digitado no input
  const apenasNumeros = valorDigitado.replace(/\D/g, "");          // remove tudo que não for dígito (letras, espaços, etc.)
  const numerosLimitados = apenasNumeros.slice(0, 11);             // garante no máximo 11 dígitos (DDD + 9 + 8 números)
  let formatado = "";                                              // string que vai receber o valor já formatado

  if (numerosLimitados.length > 0) {                               // se já existe pelo menos 1 dígito
    formatado = "(" + numerosLimitados.substring(0, 2);            // abre parênteses e coloca o DDD (2 primeiros dígitos)

    if (numerosLimitados.length >= 3) {                            // se temos pelo menos 3 dígitos (DDD + primeiro do número)
      formatado += ") " + numerosLimitados.substring(2, 3);        // fecha parênteses, espaço e primeiro dígito do número
    }

    if (numerosLimitados.length >= 4) {                            // se temos de 4 a 7 dígitos (parte central do número)
      formatado += " " + numerosLimitados.substring(3, 7);         // adiciona espaço + dígitos centrais (posição 3 a 6)
    }

    if (numerosLimitados.length >= 8) {                            // se temos 8 dígitos ou mais
      formatado += "-" + numerosLimitados.substring(7, 11);        // adiciona traço + últimos dígitos (posição 7 a 10)
    }
  }

  return formatado;                                                // devolve o telefone no formato (99) 9 9999-9999
}

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
  // Esconde a tela de login
  loginScreen.classList.add("hidden");
  // Mostra a tela principal
  appScreen.classList.remove("hidden");
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
    const tokenData = await response.json();
    // Salva o token no helper e no localStorage
    setAuthToken(tokenData.access_token);

    // Depois de logar, carregamos os dados do usuário
    await carregarDadosUsuario();

    // E então carregamos a tela principal
    mostrarTelaApp();

    // Por fim, carregamos a lista de avaliações
    await carregarAvaliacoes();

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
  setAuthToken(null);
  currentUser = null;

  avaliacaoEmEdicaoId = null; // garante que não mantenha nenhuma avaliação em edição após sair

  if (formAvaliacao) {
    formAvaliacao.reset(); // limpa o formulário ao fazer logout
  }

  resetarFormularioParaNovaAvaliacao(); // volta o título/subtítulo para o modo padrão

  // Limpa eventuais mensagens do formulário de avaliação
  avaliacaoFeedbackEl.textContent = "";
  if (userManagementCard) {                                    // se o card de gestão de usuários existir
    userManagementCard.classList.add("hidden");                // garante que ele não apareça na tela de login
  }
  // Exibe a tela de login
  mostrarTelaLogin();
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
        const cliente = item.cliente_nome || "";
        const local = item.local || "";
        const status = (item.status || "").toString().toUpperCase();
        const objeto = item.objeto || "";

        // Retorna o HTML da linha de tabela
        return `
            <tr class="avaliacao-row" data-avaliacao-id="${item.id}">
                <td>${item.id}</td>
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

    linhasTabela.forEach((tr) => {
        const id = tr.getAttribute("data-avaliacao-id"); // lê o id da avaliação gravado no atributo data

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
    const tipo = (dados.tipo_formulario || "redes");         // obtém o tipo de formulário vindo da API ou assume "redes" como padrão

    if (tipoFormularioInput) {                               // se o input hidden existir
      tipoFormularioInput.value = tipo;                      // grava o tipo atual da avaliação no campo hidden
    }
    aplicarVisibilidadeTipoFormulario(tipo);                 // aplica a visibilidade dos blocos e estado das abas para o tipo carregado
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
    clienteNomeInput.value = dados.cliente_nome || ""; // nome do cliente
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
    if (servicoForaMC) servicoForaMC.checked = dados.servico_fora_montes_claros ?? false; // só marca se o checkbox existir
    if (servicoIntermediario) servicoIntermediario.checked = dados.servico_intermediario ?? false; // idem para intermediário

    // Quantitativo 01
    q1Categoria.value = dados.q1_categoria_cab || "";
    q1Blindado.checked = dados.q1_blindado ?? false;
    q1NovoPatch.checked = dados.q1_novo_patch_panel ?? false;
    q1IncluirGuia.checked = dados.q1_incluir_guia ?? false;
    q1QtdPontosRede.value = dados.q1_qtd_pontos_rede || "";
    q1QtdCabos.value = dados.q1_qtd_cabos || "";
    q1QtdPortasPP.value = dados.q1_qtd_portas_patch_panel || "";
    q1QtdPatchCords.value = dados.q1_qtd_patch_cords || "";

    // Quantitativo 02
    q2NovoSwitch.checked = dados.q2_novo_switch ?? false;
    q2SwitchPoe.checked = dados.q2_switch_poe ?? false;
    q2RedeIndustrial.checked = dados.q2_rede_industrial ?? false;
    q2QtdPontosRede.value = dados.q2_qtd_pontos_rede || "";
    q2QtdPortasSwitch.value = dados.q2_qtd_portas_switch || "";
    q2ObsSwitch.value = dados.q2_observacoes || "";

    // Quantitativo 03
    q3TipoFibra.value = dados.q3_tipo_fibra || "";
    q3QtdFibrasPorCabo.value = dados.q3_qtd_fibras_por_cabo || "";
    q3TipoConector.value = dados.q3_tipo_conector || "";
    q3NovoDio.checked = dados.q3_novo_dio ?? false;
    q3CaixaTerminacao.checked = dados.q3_caixa_terminacao ?? false;
    q3TipoCaboOptico.value = dados.q3_tipo_cabo_optico || "";
    q3CaixaEmenda.checked = dados.q3_caixa_emenda ?? false;
    q3QtdCabos.value = dados.q3_qtd_cabos || "";
    q3TamanhoTotal.value = dados.q3_tamanho_total_m || "";
    q3QtdFibras.value = dados.q3_qtd_fibras || "";
    q3QtdPortasDio.value = dados.q3_qtd_portas_dio || "";
    q3QtdCordoesOpticos.value = dados.q3_qtd_cordoes_opticos || "";
    q3Obs.value = dados.q3_observacoes || "";

    // Quantitativo 04
    q4Camera.checked = dados.q4_camera ?? false;
    q4NvrDvr.checked = dados.q4_nvr_dvr ?? false;
    q4AccessPoint.checked = dados.q4_access_point ?? false;
    q4Conversor.checked = dados.q4_conversor_midia ?? false;
    q4Gbic.checked = dados.q4_gbic ?? false;
    q4Switch.checked = dados.q4_switch ?? false;

    // Quantitativo 05
    q5NovaEletrocalha.checked = dados.q5_nova_eletrocalha ?? false;
    q5NovoEletroduto.checked = dados.q5_novo_eletroduto ?? false;
    q5NovoRack.checked = dados.q5_novo_rack ?? false;
    q5InstalacaoEletrica.checked = dados.q5_instalacao_eletrica ?? false;
    q5Nobreak.checked = dados.q5_nobreak ?? false;
    q5Serralheria.checked = dados.q5_serralheria ?? false;

    // Imagens
    imgRef1.value = dados.localizacao_imagem1_url || "";
    imgRef2.value = dados.localizacao_imagem2_url || "";

    // Pré-requisitos
    preTrabalhoAltura.checked = dados.pre_trabalho_altura ?? false;
    prePlataforma.checked = dados.pre_plataforma ?? false;
    prePlataformaModelo.value = dados.pre_plataforma_modelo || "";
    prePlataformaDias.value = dados.pre_plataforma_dias || "";
    preForaHorario.checked = dados.pre_fora_horario_comercial ?? false;
    preVeiculoNortetel.checked = dados.pre_veiculo_nortetel ?? false;
    preContainer.checked = dados.pre_container_materiais ?? false;

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

  if (formTituloEl) {
    formTituloEl.textContent = "Nova Avaliação"; // título padrão exibido na tela
  }

  if (formSubtituloEl) {
    formSubtituloEl.textContent =
      "Preencha os dados abaixo para registrar uma nova avaliação técnica."; // texto padrão
  }

  // Flags gerais
  if (servicoForaMC) servicoForaMC.checked = false;
  if (servicoIntermediario) servicoIntermediario.checked = false;

  // Quantitativo 01 – Cabeamento
  if (q1Categoria) q1Categoria.value = "";
  if (q1Blindado) q1Blindado.checked = false;
  if (q1NovoPatch) q1NovoPatch.checked = false;
  if (q1IncluirGuia) q1IncluirGuia.checked = false;
  if (q1QtdPontosRede) q1QtdPontosRede.value = "";
  if (q1QtdCabos) q1QtdCabos.value = "";
  if (q1QtdPortasPP) q1QtdPortasPP.value = "";
  if (q1QtdPatchCords) q1QtdPatchCords.value = "";

  // Quantitativo 02 – Switch
  if (q2NovoSwitch) q2NovoSwitch.checked = false;
  if (q2SwitchPoe) q2SwitchPoe.checked = false;
  if (q2RedeIndustrial) q2RedeIndustrial.checked = false;
  if (q2QtdPontosRede) q2QtdPontosRede.value = "";
  if (q2QtdPortasSwitch) q2QtdPortasSwitch.value = "";
  if (q2ObsSwitch) q2ObsSwitch.value = "";

  // Quantitativo 03 – Fibra Óptica
  if (q3TipoFibra) q3TipoFibra.value = "";
  if (q3QtdFibrasPorCabo) q3QtdFibrasPorCabo.value = "";
  if (q3TipoConector) q3TipoConector.value = "";
  if (q3NovoDio) q3NovoDio.checked = false;
  if (q3CaixaTerminacao) q3CaixaTerminacao.checked = false;
  if (q3TipoCaboOptico) q3TipoCaboOptico.value = "";
  if (q3CaixaEmenda) q3CaixaEmenda.checked = false;
  if (q3QtdCabos) q3QtdCabos.value = "";
  if (q3TamanhoTotal) q3TamanhoTotal.value = "";
  if (q3QtdFibras) q3QtdFibras.value = "";
  if (q3QtdPortasDio) q3QtdPortasDio.value = "";
  if (q3QtdCordoesOpticos) q3QtdCordoesOpticos.value = "";
  if (q3Obs) q3Obs.value = "";

  // Quantitativo 04 – Equipamentos
  if (q4Camera) q4Camera.checked = false;
  if (q4NvrDvr) q4NvrDvr.checked = false;
  if (q4AccessPoint) q4AccessPoint.checked = false;
  if (q4Conversor) q4Conversor.checked = false;
  if (q4Gbic) q4Gbic.checked = false;
  if (q4Switch) q4Switch.checked = false;

  // Quantitativo 05 – Infraestrutura
  if (q5NovaEletrocalha) q5NovaEletrocalha.checked = false;
  if (q5NovoEletroduto) q5NovoEletroduto.checked = false;
  if (q5NovoRack) q5NovoRack.checked = false;
  if (q5InstalacaoEletrica) q5InstalacaoEletrica.checked = false;
  if (q5Nobreak) q5Nobreak.checked = false;
  if (q5Serralheria) q5Serralheria.checked = false;

  // Imagens
  if (imgRef1) imgRef1.value = "";
  if (imgRef2) imgRef2.value = "";

  // Pré-requisitos
  if (preTrabalhoAltura) preTrabalhoAltura.checked = false;
  if (prePlataforma) prePlataforma.checked = false;
  if (prePlataformaModelo) prePlataformaModelo.value = "";
  if (prePlataformaDias) prePlataformaDias.value = "";
  if (preForaHorario) preForaHorario.checked = false;
  if (preVeiculoNortetel) preVeiculoNortetel.checked = false;
  if (preContainer) preContainer.checked = false;

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
 */
function aplicarVisibilidadeTipoFormulario(tipo) {                        // recebe uma string indicando o tipo de formulário
  const tipoNormalizado = (tipo || "").toLowerCase();                     // normaliza o tipo para minúsculas e trata undefined/null
  const ehRedes = tipoNormalizado === "redes";                            // verdadeiro se o tipo atual for "redes"
  const ehInfra =                                                        // verdadeiro se o tipo atual for "infraestrutura"
    tipoNormalizado === "infraestrutura" || tipoNormalizado === "infra"; // aceita tanto "infraestrutura" quanto um eventual "infra"

  // Atualiza estado visual das abas (botões)
  if (tabButtons && tabButtons.length > 0) {                              // garante que exista ao menos uma aba no DOM
    tabButtons.forEach((btn) => {                                         // percorre cada botão de aba
      const btnTipo = (btn.dataset.tipo || "").toLowerCase();            // obtém o valor do atributo data-tipo e normaliza
      const ehAbaAtiva = btnTipo === tipoNormalizado;                     // verifica se a aba representa o tipo atual

      if (ehAbaAtiva) {                                                   // se esta aba for a aba correspondente ao tipo atual
        btn.classList.add("active");                                      // adiciona a classe de estado ativo
      } else {                                                            // caso contrário
        btn.classList.remove("active");                                   // remove a classe de estado ativo
      }
    });
  }

  // Se tipo não for reconhecido, mostra tudo e sai (fallback seguro)
  if (!ehRedes && !ehInfra) {                                             // se não for nenhum dos tipos conhecidos
    if (blocosTipoRedes) {                                                // se existirem blocos de redes
      blocosTipoRedes.forEach((bloco) => bloco.classList.remove("hidden"));// garante que eles apareçam
    }
    if (blocosTipoInfra) {                                                // se existirem blocos de infraestrutura
      blocosTipoInfra.forEach((bloco) => bloco.classList.remove("hidden"));// garante que eles apareçam
    }
    return;                                                               // encerra a função (não aplica regras específicas)
  }

  // Exibe ou oculta blocos do tipo "Redes"
  if (blocosTipoRedes) {                                                  // se a NodeList de blocos de redes existir
    blocosTipoRedes.forEach((bloco) => {                                  // percorre cada bloco
      if (ehRedes) {                                                      // se o tipo atual for "redes"
        bloco.classList.remove("hidden");                                 // garante que o bloco fique visível
      } else {                                                            // se o tipo atual não for "redes"
        bloco.classList.add("hidden");                                    // esconde o bloco adicionando a classe hidden
      }
    });
  }

  // Exibe ou oculta blocos do tipo "Infraestrutura"
  if (blocosTipoInfra) {                                                  // se a NodeList de blocos de infra existir
    blocosTipoInfra.forEach((bloco) => {                                  // percorre cada bloco
      if (ehInfra) {                                                      // se o tipo atual for "infraestrutura"
        bloco.classList.remove("hidden");                                 // mostra o bloco de infraestrutura
      } else {                                                            // se não for tipo infraestrutura
        bloco.classList.add("hidden");                                    // esconde o bloco adicionando a classe hidden
      }
    });
  }
}
//tipo_formulario
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
  const clienteNome = clienteNomeInput.value.trim(); // nome do cliente sem espaços extras
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
  const tipoFormulario = tipoFormularioInput              // lê o tipo de formulário do input hidden, se existir
    ? (tipoFormularioInput.value || null)                // usa o valor atual ou null se estiver vazio
    : null;                                              // se o input não existir, considera null (seguro para ambientes antigos)
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
    tipo_formulario: tipoFormulario,    // tipo de formulário selecionado (redes/infraestrutura/etc.)
    //tipo_formulario
  };
  // Flags gerais
  payload.servico_fora_montes_claros =                     // campo booleano indicando se o serviço é fora de Montes Claros
    servicoForaMC ? servicoForaMC.checked : false;         // se o elemento existir, usa o .checked; se não, assume false

  payload.servico_intermediario =                          // campo booleano indicando se o serviço é para intermediário
    servicoIntermediario ? servicoIntermediario.checked : false; // mesma lógica: só acessa .checked se o elemento existir

  // Quantitativo 01
  payload.q1_categoria_cab = q1Categoria.value;
  payload.q1_blindado = q1Blindado.checked;
  payload.q1_novo_patch_panel = q1NovoPatch.checked;
  payload.q1_incluir_guia = q1IncluirGuia.checked;
  payload.q1_qtd_pontos_rede = intOrNullFromInput(q1QtdPontosRede);
  payload.q1_qtd_cabos = intOrNullFromInput(q1QtdCabos);
  payload.q1_qtd_portas_patch_panel = intOrNullFromInput(q1QtdPortasPP);
  payload.q1_qtd_patch_cords = intOrNullFromInput(q1QtdPatchCords);

  // Quantitativo 02
  payload.q2_novo_switch = q2NovoSwitch.checked;
  payload.q2_switch_poe = q2SwitchPoe.checked;
  payload.q2_rede_industrial = q2RedeIndustrial.checked;
  payload.q2_qtd_pontos_rede = intOrNullFromInput(q2QtdPontosRede);     // quantidade de pontos de rede via switch
  payload.q2_qtd_portas_switch = intOrNullFromInput(q2QtdPortasSwitch); // quantidade de portas do switch
  payload.q2_observacoes = q2ObsSwitch.value;

  // Quantitativo 03
  payload.q3_tipo_fibra = q3TipoFibra.value;
  payload.q3_qtd_fibras_por_cabo = intOrNullFromInput(q3QtdFibrasPorCabo);
  payload.q3_tipo_conector = q3TipoConector.value;
  payload.q3_novo_dio = q3NovoDio.checked;
  payload.q3_caixa_terminacao = q3CaixaTerminacao.checked;
  payload.q3_tipo_cabo_optico = q3TipoCaboOptico.value;
  payload.q3_caixa_emenda = q3CaixaEmenda.checked;
  payload.q3_qtd_cabos = intOrNullFromInput(q3QtdCabos);                     // quantidade de cabos ópticos
  payload.q3_tamanho_total_m = floatOrNullFromInput(q3TamanhoTotal);        // metragem total em metros (float)
  payload.q3_qtd_fibras = intOrNullFromInput(q3QtdFibras);                  // quantidade total de fibras
  payload.q3_qtd_portas_dio = intOrNullFromInput(q3QtdPortasDio);           // quantidade de portas no DIO
  payload.q3_qtd_cordoes_opticos = intOrNullFromInput(q3QtdCordoesOpticos); // quantidade de cordões ópticos
  payload.q3_observacoes = q3Obs.value;

  // Quantitativo 04
  payload.q4_camera = q4Camera.checked;
  payload.q4_nvr_dvr = q4NvrDvr.checked;
  payload.q4_access_point = q4AccessPoint.checked;
  payload.q4_conversor_midia = q4Conversor.checked;
  payload.q4_gbic = q4Gbic.checked;
  payload.q4_switch = q4Switch.checked;

  // Quantitativo 05
  payload.q5_nova_eletrocalha = q5NovaEletrocalha.checked;
  payload.q5_novo_eletroduto = q5NovoEletroduto.checked;
  payload.q5_novo_rack = q5NovoRack.checked;
  payload.q5_instalacao_eletrica = q5InstalacaoEletrica.checked;
  payload.q5_nobreak = q5Nobreak.checked;
  payload.q5_serralheria = q5Serralheria.checked;

  // Imagens
  payload.localizacao_imagem1_url = imgRef1.value;
  payload.localizacao_imagem2_url = imgRef2.value;

  // Pré-requisitos
  payload.pre_trabalho_altura = preTrabalhoAltura.checked;
  payload.pre_plataforma = prePlataforma.checked;
  payload.pre_plataforma_modelo = prePlataformaModelo.value;
  payload.pre_plataforma_dias = intOrNullFromInput(prePlataformaDias); // converte dias de uso da plataforma para número ou null
  payload.pre_fora_horario_comercial = preForaHorario.checked;
  payload.pre_veiculo_nortetel = preVeiculoNortetel.checked;
  payload.pre_container_materiais = preContainer.checked;

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
  payload.almoco_qtd = almocoQtdInput ? (almocoQtdInput.value || null) : null;               // quantidade de almoços
  payload.lanche_qtd = lancheQtdInput ? (lancheQtdInput.value || null) : null;               // quantidade de lanches

  try {
    if (!avaliacaoEmEdicaoId) {
      // Caso não haja id em edição, fazemos um POST (criação)
      await apiPostJson("/avaliacoes", payload); // cria nova avaliação no backend

      avaliacaoFeedbackEl.textContent = "Avaliação salva com sucesso."; // mensagem de sucesso
      avaliacaoFeedbackEl.classList.add("form-success"); // aplica estilo de sucesso
    } else {
      // Se houver id em edição, fazemos um PUT (edição)
      await apiPutJson(`/avaliacoes/${avaliacaoEmEdicaoId}`, payload); // atualiza a avaliação existente

      avaliacaoFeedbackEl.textContent = "Avaliação atualizada com sucesso."; // mensagem de sucesso para edição
      avaliacaoFeedbackEl.classList.add("form-success"); // aplica estilo de sucesso
    }

    formAvaliacao.reset(); // limpa os campos do formulário após salvar
    resetarFormularioParaNovaAvaliacao(); // volta o formulário para o modo "Nova Avaliação"
    await carregarAvaliacoes(); // recarrega a lista para refletir o novo registro/edição
  } catch (err) {
    console.error(err); // registra o erro no console para debug

    // Mensagens diferentes dependendo se era criação ou edição
    if (!avaliacaoEmEdicaoId) {
      avaliacaoFeedbackEl.textContent =
        "Erro ao salvar avaliação. Verifique os dados e tente novamente."; // mensagem de erro para criação
    } else {
      avaliacaoFeedbackEl.textContent =
        "Erro ao atualizar avaliação. Verifique os dados e tente novamente."; // mensagem de erro para edição
    }

    avaliacaoFeedbackEl.classList.add("form-error"); // aplica estilo de erro
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
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault(); // evita reload da página

      // Lê usuário e senha digitados
      const username = loginUsernameInput.value.trim();
      const password = loginPasswordInput.value.trim();

      // Validações simples
      if (!username || !password) {
        loginErrorEl.textContent = "Informe usuário e senha.";
        return;
      }

      // Chama a função de login
      realizarLogin(username, password);
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
  if (formAvaliacao) {
    formAvaliacao.addEventListener("submit", salvarAvaliacao);
  }

  if(salvarAvaliacaoButton){                                      // verifica se o botão de salvar avaliação existe
    salvarAvaliacaoButton.addEventListener("click", (event) => {   // registra o handler de clique
      event.preventDefault();                                     // evita o comportamento padrão de submit
      salvarAvaliacao(event);                                    // chama a função de salvar avaliação
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
      if (tipoFormularioInput) {                                // se o campo hidden de tipo existir
        const tipoAtual = tipoFormularioInput.value || "redes"; // obtém o tipo atual ou assume "redes" como padrão
        aplicarVisibilidadeTipoFormulario(tipoAtual);           // reaplica a visibilidade das seções conforme o tipo
      }
      //tipo_formulario
    });
    //tipo_formulario
    // Eventos de clique nas abas de tipo de formulário (Redes / Infraestrutura)
    if (tabButtons && tabButtons.length > 0) {                             // verifica se há abas definidas no DOM
      tabButtons.forEach((btn) => {                                        // percorre cada botão de aba
        btn.addEventListener("click", () => {                              // registra o handler de clique
          const tipo = (btn.dataset.tipo || "redes").toLowerCase();        // recupera o tipo associado à aba e normaliza para minúsculas

          if (tipoFormularioInput) {                                       // se o input hidden existir
            tipoFormularioInput.value = tipo;                              // atualiza o valor do hidden com o tipo escolhido
          }

          aplicarVisibilidadeTipoFormulario(tipo);                         // aplica visibilidade das seções e estado visual das abas
        });
      });
    }

    // Define um tipo padrão e aplica visibilidade inicial ao carregar a tela
    if (tipoFormularioInput && !tipoFormularioInput.value) {               // se houver input hidden e ele ainda estiver vazio
      tipoFormularioInput.value = "redes";                                 // define "redes" como tipo padrão
    }
    if (tipoFormularioInput) {                                             // se o input hidden existir
      aplicarVisibilidadeTipoFormulario(tipoFormularioInput.value);        // aplica a visibilidade inicial conforme o valor atual
    }
    //tipo_formulario

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

  // Tenta carregar token salvo no navegador
  const tokenSalvo = getStoredToken();

  if (!tokenSalvo) {
    // Se não houver token, mostramos a tela de login
    mostrarTelaLogin();
    return;
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

// Garante que inicializamos somente após o DOM estar pronto
document.addEventListener("DOMContentLoaded", () => {
  inicializarApp();
});

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