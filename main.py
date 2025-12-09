# ========================= main.py =========================
# Importações básicas da FastAPI
from fastapi import FastAPI, Depends, HTTPException              # importa a classe FastAPI e utilidades de dependência/erros
from fastapi.staticfiles import StaticFiles                      # permite servir arquivos estáticos (HTML, CSS, JS, imagens)
from fastapi.responses import FileResponse                       # permite devolver um arquivo diretamente como resposta HTTP
from fastapi.middleware.cors import CORSMiddleware               # middleware que habilita CORS (acesso à API a partir de outros domínios)

# Importações do Pydantic para definir schemas de entrada/saída
from pydantic import BaseModel, Field                            # BaseModel é a base dos modelos Pydantic; Field permite meta-informações por campo

# Tipagem (para listas e opcionais)
from typing import List, Optional                                # List e Optional são usados para declarar listas e campos opcionais

# Módulos padrão de apoio
import json                                                      # módulo para manipular dados em formato JSON (logs, payloads, etc.)
import secrets                                                   # módulo para gerar valores aleatórios criptograficamente seguros (tokens, senhas)
import string                                                    # módulo com constantes de letras/dígitos, útil para montar senhas

from datetime import date, datetime, timedelta                   # tipos de data, data/hora e diferença de tempo

from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm  # ferramentas de login via OAuth2 (form padrão de formulário)

from jose import JWTError, jwt                                   # biblioteca para criar e validar tokens JWT
from passlib.context import CryptContext                         # contexto do Passlib para hash/validação de senhas

# Importações do SQLAlchemy para ORM
from sqlalchemy import (                                         # importa vários elementos do SQLAlchemy
    create_engine,                                               # função para criar o "engine" de conexão com o banco
    Column,                                                      # classe para definir colunas
    Integer,                                                     # tipo inteiro
    String,                                                      # tipo string (tamanho fixo/limitado)
    Boolean,                                                     # tipo booleano (True/False)
    Text,                                                        # tipo texto longo
    Date,                                                        # tipo data
    Numeric,                                                     # tipo numérico com casas decimais
    ForeignKey,                                                  # para chaves estrangeiras
    TIMESTAMP,                                                   # tipo data/hora
    func                                                         # funções SQL, como func.now()
)

from sqlalchemy.orm import (                                     # importações para o ORM trabalhar
    declarative_base,                                            # base para declarar modelos ORM
    sessionmaker,                                                # fábrica de sessões
    relationship,                                               # relacionamento entre tabelas
    Session                                                      # tipo da sessão
)

# Importação para ler variáveis de ambiente
import os                                                        # módulo padrão do Python para acessar variáveis de ambiente
from dotenv import load_dotenv                                   # importa função para carregar variáveis de ambiente de um arquivo .env
# Carrega variáveis de ambiente do arquivo .env (se existir)
load_dotenv()                                                   # carrega o arquivo .env na raiz do projeto, se presente
# -----------------------------------------------------------
# Configuração do banco de dados (somente Postgres, sem fallback)
# -----------------------------------------------------------

# Lê a URL do banco de dados a partir da variável de ambiente DATABASE_URL (sem valor padrão)
DATABASE_URL = os.getenv("DATABASE_URL")                         # tenta buscar a variável no ambiente/.env

# Se não existir DATABASE_URL, interrompe a aplicação com erro explicativo
if not DATABASE_URL:                                             # verifica se a variável está vazia ou não definida
    raise RuntimeError(                                          # lança um erro em tempo de importação
        "DATABASE_URL não está configurada. "                    # parte 1 da mensagem
        "Crie um arquivo .env na raiz do projeto com a linha "   # instrução de configuração
        '"DATABASE_URL=postgresql+psycopg2://usuario:senha@host:5432/banco" '  # exemplo de URL
        "ou defina a variável de ambiente no sistema."           # alternativa: configurar direto no sistema operacional
    )

# Cria o "engine" de conexão com o banco, que o SQLAlchemy usa para falar com o PostgreSQL
engine = create_engine(DATABASE_URL)               

# Cria uma fábrica de sessões, que usaremos em cada requisição
SessionLocal = sessionmaker(                                    
    autocommit=False,
    autoflush=False,
    bind=engine
)

# -----------------------------------------------------------
# Configuração de segurança: JWT e hash de senha
# -----------------------------------------------------------

# Chave secreta usada para assinar os tokens JWT (idealmente viria do .env)
SECRET_KEY = os.getenv("SECRET_KEY", "troque-esta-chave-em-producao")  # chave padrão de desenvolvimento
ALGORITHM = "HS256"                                         # algoritmo usado na assinatura dos tokens
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8                        # tempo de expiração do token (8 horas)

# Contexto de hashing de senhas usando bcrypt
pwd_context = CryptContext(                                 # cria um contexto de criptografia para senhas
    schemes=["pbkdf2_sha256"],                              # usa o algoritmo PBKDF2 com SHA256 (seguro e estável)
    deprecated="auto"                                       # marca outros algoritmos antigos como deprecated
)

# Esquema OAuth2: define que o token será enviado no header Authorization: Bearer <token>
oauth2_scheme = OAuth2PasswordBearer(                       # cria um esquema OAuth2 padrão
    tokenUrl="auth/login"                                   # endpoint que dará o token de acesso
)

# Cria a base para os modelos ORM (tabelas)
Base = declarative_base() 

# Cria uma fábrica de sessões, que usaremos em cada requisição
SessionLocal = sessionmaker(                                    
    autocommit=False,                                            # desabilita autocommit (vamos controlar manualmente)
    autoflush=False,                                             # desabilita autoflush automático
    bind=engine                                                  # vincula este sessionmaker ao nosso engine
)

# Cria a base para os modelos ORM (tabelas)
Base = declarative_base()                                       

# -----------------------------------------------------------
# Modelos de banco (SQLAlchemy) - alinhados com as tabelas
# -----------------------------------------------------------

class Usuario(Base):                                         # classe para tabela "usuarios" (controle de login)
    __tablename__ = "usuarios"                               # nome da tabela no banco

    id = Column(Integer, primary_key=True, index=True)       # identificador único do usuário
    nome = Column(Text, nullable=False)                      # nome completo do usuário
    email = Column(String(255), unique=True, nullable=False) # e-mail (único, obrigatório)
    username = Column(String(50), unique=True, nullable=False)  # login do usuário (único)
    senha_hash = Column(Text, nullable=False)                # hash da senha (nunca armazenar senha pura)
    is_admin = Column(Boolean, nullable=False, default=False)# indica se é administrador
    precisa_trocar_senha = Column(Boolean, nullable=False, default=True)  # força troca de senha no primeiro login
    ativo = Column(Boolean, nullable=False, default=True)    # se o usuário está ativo ou bloqueado
    criado_em = Column(TIMESTAMP, server_default=func.now()) # data/hora de criação do registro
    atualizado_em = Column(                                  # data/hora da última atualização
        TIMESTAMP,
        server_default=func.now(),                           # valor padrão na criação
        onupdate=func.now()                                  # atualiza automaticamente em alterações
    )

class Avaliacao(Base):                                           # define a classe Avaliacao mapeando a tabela "avaliacoes"
    __tablename__ = "avaliacoes"                                 # nome da tabela no banco

    id = Column(Integer, primary_key=True, index=True)           # coluna id inteira, chave primária, com índice

    # Dados da equipe responsável
    equipe = Column(Text)                                        # equipe responsável (texto livre)
    responsavel_avaliacao = Column(Text)                         # responsável pela avaliação técnica
    #tipo_formulario
    tipo_formulario = Column(String(50))                         # tipo do formulário (ex.: "redes", "infraestrutura", etc.)
    #tipo_formulario
    # Dados do cliente
    cliente_nome = Column(Text, nullable=False)                  # nome do cliente, obrigatório (nullable=False)
    objeto = Column(Text)                                        # objeto da avaliação
    local = Column(Text)                                         # local da instalação/serviço
    data_avaliacao = Column(Date, nullable=False)                # data da avaliação, obrigatória
    contato = Column(Text)                                       # nome do contato do cliente
    email_cliente = Column(Text)                                 # e-mail do cliente

    # Escopo e características gerais
    escopo_texto = Column(Text)                                  # texto com o escopo
    servico_fora_montes_claros = Column(Boolean)                 # True se for fora de Montes Claros
    servico_intermediario = Column(Boolean)                      # True se for intermediário/empreiteira

    # Quantitativo 01 - Patch Panel / Cabeamento UTP
    q1_categoria_cab = Column(String(10))                        # categoria do cabeamento (ex.: CAT5E, CAT6)
    q1_blindado = Column(Boolean)                                # indica se o cabeamento UTP é blindado
    q1_novo_patch_panel = Column(Boolean)                        # indica se será fornecido um novo patch panel
    q1_incluir_guia = Column(Boolean)                            # indica se serão incluídas guias de cabos
    q1_qtd_pontos_rede = Column(Integer)                         # quantidade de pontos de rede previstos
    q1_qtd_cabos = Column(Integer)                               # quantidade de cabos UTP
    q1_qtd_portas_patch_panel = Column(Integer)                  # quantidade de portas do patch panel
    q1_qtd_patch_cords = Column(Integer)                         # quantidade total de patch cords previstos
    q1_marca_cab = Column(String(50))                            # marca do cabeamento UTP (CommScope, Furukawa ou "Outro: <texto>")
    q1_modelo_patch_panel = Column(Text)                         # modelo do patch panel quando houver novo fornecimento (CommScope 24 portas, Furukawa 24 portas, Systimax 24 portas ou "Outro: <texto>")
    q1_qtd_guias_cabos = Column(Integer)                         # quantidade de guias de cabos a instalar
    q1_patch_cords_modelo = Column(Text)                         # modelo/descrição dos patch cords (comprimentos, categoria, etc.)
    q1_patch_cords_cor = Column(String(50))                      # cor ou cores dos patch cords utilizados
    q1_patch_panel_existente_nome = Column(Text)                 # identificação do patch panel existente quando não houver novo fornecimento

    # Quantitativo 02 - Switch
    q2_novo_switch = Column(Boolean)                             # indica se será fornecido um novo switch
    q2_switch_poe = Column(Boolean)                              # LEGADO - indicador de switch PoE (não usado nos novos formulários)
    q2_rede_industrial = Column(Boolean)                         # LEGADO - indicador de rede industrial (não usado nos novos formulários)
    q2_qtd_pontos_rede = Column(Integer)                         # LEGADO - dimensionamento antigo de pontos de rede
    q2_qtd_portas_switch = Column(Integer)                       # LEGADO - dimensionamento antigo de portas de switch
    q2_fornecedor_switch = Column(String(20))                    # quem fornece o switch: 'nortetel' ou 'cliente'
    q2_modelo_switch = Column(Text)                              # modelo do switch (novo ou existente)
    q2_switch_foto_url = Column(Text)                            # URL/caminho da foto do switch
    q2_switch_existente_nome = Column(Text)                      # identificação do switch existente quando não for novo
    q2_observacoes = Column(Text)                                # observações gerais sobre o switch

    # Quantitativo 03 – Cabeamento Óptico
    q3_tipo_fibra = Column(String(10))                           # tipo da fibra (ex.: SM, OM1, OM2, OM3, OM4)
    q3_qtd_fibras_por_cabo = Column(Integer)                     # quantidade de fibras por cabo
    q3_tipo_conector = Column(String(10))                        # tipo de conector (ex.: LC, SC)
    q3_novo_dio = Column(Boolean)                                # indica se será fornecido um novo DIO
    q3_caixa_terminacao = Column(Boolean)                        # indica se haverá caixa de terminação
    q3_tipo_cabo_optico = Column(String(20))                     # tipo de cabo óptico (interno, externo, dielétrico, etc.)
    q3_caixa_emenda = Column(Boolean)                            # indica se haverá caixa de emenda
    q3_qtd_cabos = Column(Integer)                               # quantidade de cabos ópticos
    q3_tamanho_total_m = Column(Numeric(10, 2))                  # metragem total estimada dos cabos ópticos
    q3_qtd_fibras = Column(Integer)                              # quantidade total de fibras
    q3_qtd_portas_dio = Column(Integer)                          # quantidade de portas do DIO
    q3_qtd_cordoes_opticos = Column(Integer)                     # quantidade de cordões ópticos
    q3_marca_cab_optico = Column(String(50))                     # marca do cabeamento óptico
    q3_modelo_dio = Column(Text)                                 # modelo do DIO utilizado/fornecido
    q3_modelo_cordao_optico = Column(Text)                       # modelo/descrição dos cordões ópticos (comprimento, tipo de conector, etc.)
    q3_observacoes = Column(Text)                                # observações gerais sobre o cabeamento óptico

    # Quantitativo 04 – Equipamentos (Câmeras, NVR/DVR, conversor, GBIC)
    q4_camera = Column(Boolean)                                  # indica se a avaliação envolve câmeras
    q4_nvr_dvr = Column(Boolean)                                 # indica se haverá NVR ou DVR
    q4_access_point = Column(Boolean)                            # LEGADO - flag genérica para Access Points (não usada nos novos formulários)
    q4_conversor_midia = Column(Boolean)                         # indica se haverá conversor de mídia
    q4_gbic = Column(Boolean)                                    # indica se haverá GBIC
    q4_switch = Column(Boolean)                                  # LEGADO - flag genérica para switches adicionais (não usada nos novos formulários)
    q4_conversor_midia_modelo = Column(Text)                     # modelo do conversor de mídia
    q4_gbic_modelo = Column(Text)                                # modelo do GBIC
    q4_camera_nova = Column(Boolean)                             # indica se as câmeras são novas (caso contrário, realocação)
    q4_camera_modelo = Column(Text)                              # modelo das câmeras
    q4_camera_qtd = Column(Integer)                              # quantidade de câmeras do modelo indicado
    q4_camera_fornecedor = Column(String(20))                    # quem fornece as câmeras: 'nortetel' ou 'cliente'
    q4_nvr_dvr_modelo = Column(Text)                             # modelo do NVR ou DVR

    # Quantitativo 05 – Infraestrutura
    q5_nova_eletrocalha = Column(Boolean)                        # indica se haverá nova eletrocalha
    q5_novo_eletroduto = Column(Boolean)                         # indica se haverá novo eletroduto
    q5_novo_rack = Column(Boolean)                               # indica se haverá novo rack
    q5_instalacao_eletrica = Column(Boolean)                     # indica se haverá adequação/instalação elétrica
    q5_nobreak = Column(Boolean)                                 # indica se haverá nobreak
    q5_serralheria = Column(Boolean)                             # indica se haverá serviços de serralheria
    q5_eletrocalha_modelo = Column(Text)                         # modelo/descrição da eletrocalha
    q5_eletrocalha_qtd = Column(Integer)                         # quantidade de eletrocalhas
    q5_eletroduto_modelo = Column(Text)                          # modelo/descrição do eletroduto
    q5_eletroduto_qtd = Column(Integer)                          # quantidade de eletrodutos
    q5_rack_modelo = Column(Text)                                # modelo/descrição do rack
    q5_rack_qtd = Column(Integer)                                # quantidade de racks
    q5_nobreak_modelo = Column(Text)                             # modelo/descrição do nobreak
    q5_nobreak_qtd = Column(Integer)                             # quantidade de nobreaks
    q5_serralheria_descricao = Column(Text)                      # descrição detalhada da serralheria necessária
    q5_instalacao_eletrica_obs = Column(Text)                    # observações adicionais sobre a instalação elétrica

    # Localização / Referências
    localizacao_imagem1_url = Column(Text)                       # URL da primeira imagem
    localizacao_imagem2_url = Column(Text)                       # URL da segunda imagem

    # Pré-requisitos
    pre_trabalho_altura = Column(Boolean)                        # trabalho em altura
    pre_plataforma = Column(Boolean)                             # precisa de plataforma
    pre_plataforma_modelo = Column(Text)                         # modelo da plataforma
    pre_plataforma_dias = Column(Integer)                        # dias de uso da plataforma
    pre_fora_horario_comercial = Column(Boolean)                 # fora do horário comercial
    pre_veiculo_nortetel = Column(Boolean)                       # uso de veículo Nortetel
    pre_container_materiais = Column(Boolean)                    # container de materiais

    # #remoção legado
    # # Horas trabalhadas
    # horas_encarregado_dias = Column(Integer)                     # dias de encarregado
    # horas_instalador_dias = Column(Integer)                      # dias de instalador
    # horas_auxiliar_dias = Column(Integer)                        # dias de auxiliar
    # horas_tecnico_instalacao_dias = Column(Integer)              # dias de técnico de instalação
    # horas_tecnico_seguranca_dias = Column(Integer)               # dias de técnico em segurança
    # horas_hora_extra = Column(Integer)                           # horas extras
    # horas_trabalho_domingo = Column(Integer)                     # horas em domingo

    # # Prazo de instalação
    # prazo_cronograma_obra = Column(Boolean)                      # possui cronograma de obra
    # prazo_dias_instalacao = Column(Integer)                      # dias para instalação
    # prazo_as_built = Column(Boolean)                             # haverá As Built
    # prazo_dias_relatorio_obra = Column(Integer)                  # dias para relatório de obra
    # prazo_art = Column(Boolean)                                  # haverá ART
    # #remoção legado

        # Novos campos - horas trabalhadas por função (dias normais)
    encarregado_dias = Column(Integer)                          # quantidade de dias trabalhados pelo encarregado (tabela 4)
    instalador_dias = Column(Integer)                           # quantidade de dias trabalhados pelo instalador
    auxiliar_dias = Column(Integer)                             # quantidade de dias trabalhados pelo auxiliar
    tecnico_de_instalacao_dias = Column(Integer)                # quantidade de dias do técnico de instalação
    tecnico_em_seguranca_dias = Column(Integer)                 # quantidade de dias do técnico em segurança eletrônica

    # Novos campos - horas extras por função
    encarregado_hora_extra = Column(Integer)                    # quantidade de horas extras do encarregado
    instalador_hora_extra = Column(Integer)                     # quantidade de horas extras do instalador
    auxiliar_hora_extra = Column(Integer)                       # quantidade de horas extras do auxiliar
    tecnico_de_instalacao_hora_extra = Column(Integer)          # horas extras do técnico de instalação
    tecnico_em_seguranca_hora_extra = Column(Integer)           # horas extras do técnico em segurança

    # Novos campos - trabalho em domingos/feriados por função
    encarregado_trabalho_domingo = Column(Integer)              # horas de trabalho do encarregado em domingos/feriados
    instalador_trabalho_domingo = Column(Integer)               # horas de trabalho do instalador em domingos/feriados
    auxiliar_trabalho_domingo = Column(Integer)                 # horas de trabalho do auxiliar em domingos/feriados
    tecnico_de_instalacao_trabalho_domingo = Column(Integer)    # horas de trabalho do técnico de instalação em domingos/feriados
    tecnico_em_seguranca_trabalho_domingo = Column(Integer)     # horas de trabalho do técnico em segurança em domingos/feriados

    # Novos campos - alimentação (Tabela 5)
    almoco_qtd = Column(Integer)                                # quantidade de almoços previstos para a equipe
    lanche_qtd = Column(Integer)                                # quantidade de lanches previstos para a equipe

    # Novos campos - cronograma e prazos (equivalentes aos antigos campos 'prazo_*')
    cronograma_execucao = Column(Boolean)                       # indica se haverá cronograma de execução da obra (sim/não)
    dias_instalacao = Column(Integer)                           # quantidade total de dias previstos para instalação
    as_built = Column(Boolean)                                  # indica se haverá entrega de As Built (sim/não)
    dias_entrega_relatorio = Column(Integer)                    # dias previstos para entrega de relatório/relatório de obra
    art = Column(Boolean)                                       # indica se haverá ART associada ao serviço (sim/não)

    # Status e controle
    status = Column(String(30), nullable=False, default="aberto")# status da avaliação com valor padrão "aberto"
    criado_em = Column(TIMESTAMP, server_default=func.now())     # data/hora de criação com valor padrão do servidor
    atualizado_em = Column(TIMESTAMP, server_default=func.now(),# data/hora de atualização com valor padrão
                           onupdate=func.now())                  # atualiza automaticamente em alterações

    # Relacionamentos ORM
    equipamentos = relationship("AvaliacaoEquipamento",          # relacionamento 1:N com equipamentos
                                back_populates="avaliacao",      # nome do atributo inverso na classe filha
                                cascade="all, delete-orphan")    # apaga filhos ao apagar a avaliação
    outros_recursos = relationship("AvaliacaoOutroRecurso",      # relacionamento 1:N com outros recursos
                                   back_populates="avaliacao",   # atributo inverso
                                   cascade="all, delete-orphan") # apaga filhos ao apagar a avaliação
    auditoria = relationship("AvaliacaoAuditoria",               # relacionamento 1:N com auditoria
                             back_populates="avaliacao",         # atributo inverso
                             cascade="all, delete-orphan")       # apaga logs ao apagar a avaliação


class AvaliacaoEquipamento(Base):                                # classe para tabela "avaliacoes_equipamentos"
    __tablename__ = "avaliacoes_equipamentos"                    # nome da tabela

    id = Column(Integer, primary_key=True, index=True)           # id do equipamento (chave primária)
    avaliacao_id = Column(Integer,                               # id da avaliação associada
                          ForeignKey("avaliacoes.id"),           # chave estrangeira apontando para avaliacoes.id
                          nullable=False)                        # obrigatório

    equipamento = Column(Text, nullable=False)                   # nome do equipamento (obrigatório)
    modelo = Column(Text)                                        # modelo do equipamento
    quantidade = Column(Integer, nullable=False)                 # quantidade (obrigatório)
    fabricante = Column(Text)                                    # fabricante do equipamento

    avaliacao = relationship("Avaliacao",                        # relacionamento de volta com Avaliacao
                             back_populates="equipamentos")      # conecta com o atributo equipamentos em Avaliacao


class AvaliacaoOutroRecurso(Base):                               # classe para tabela "avaliacoes_outros_recursos"
    __tablename__ = "avaliacoes_outros_recursos"                 # nome da tabela

    id = Column(Integer, primary_key=True, index=True)           # id do recurso (chave primária)
    avaliacao_id = Column(Integer,                               # id da avaliação associada
                          ForeignKey("avaliacoes.id"),           # chave estrangeira para avaliacoes.id
                          nullable=False)                        # obrigatório

    descricao = Column(Text, nullable=False)                     # descrição do recurso (ex.: Almoço, Lanche)
    quantidade = Column(Integer, nullable=False)                 # quantidade do recurso

    avaliacao = relationship("Avaliacao",                        # relacionamento com Avaliacao
                             back_populates="outros_recursos")   # conecta com o atributo outros_recursos


class AvaliacaoAuditoria(Base):                                  # classe para tabela "avaliacoes_auditoria"
    __tablename__ = "avaliacoes_auditoria"                       # nome da tabela

    id = Column(Integer, primary_key=True, index=True)           # id do registro de auditoria
    avaliacao_id = Column(Integer,                               # id da avaliação associada
                          ForeignKey("avaliacoes.id"),           # chave estrangeira
                          nullable=False)                        # obrigatório

    usuario = Column(String(255))                                # usuário que realizou a ação (texto livre por enquanto)
    acao = Column(String(50), nullable=False)                    # tipo de ação: CRIAR, EDITAR, EXCLUIR, etc.
    detalhes = Column(Text)                                      # detalhes da ação (JSON/texto)
    data_hora = Column(TIMESTAMP, server_default=func.now())     # data/hora do evento de auditoria

    avaliacao = relationship("Avaliacao",                        # relacionamento com Avaliacao
                             back_populates="auditoria")         # conecta com o atributo auditoria em Avaliacao

class UsuarioAuditoria(Base):                                       # classe que representa a tabela de auditoria de ações em usuários
    __tablename__ = "usuarios_auditoria"                            # nome da tabela no banco de dados

    id = Column(Integer, primary_key=True, index=True)              # identificador único de cada registro de auditoria
    usuario_alvo_id = Column(                                       # id do usuário que sofreu a ação (ex.: teve senha resetada)
        Integer,                                                    # tipo inteiro
        ForeignKey("usuarios.id"),                                  # chave estrangeira para a tabela usuarios
        nullable=False                                              # obrigatório: sempre teremos um usuário alvo
    )
    usuario_acao_id = Column(                                       # id do usuário que executou a ação (ex.: o admin)
        Integer,                                                    # tipo inteiro
        ForeignKey("usuarios.id"),                                  # também referencia a tabela usuarios
        nullable=True                                               # pode ser nulo (ex.: ações automáticas do sistema)
    )
    acao = Column(String(50), nullable=False)                        # tipo de ação realizada (CRIAR_USUARIO, DESATIVAR_USUARIO, RESET_SENHA, TROCAR_SENHA, etc.)
    detalhes = Column(Text)                                         # campo livre para guardar detalhes em texto/JSON
    data_hora = Column(                                             # data e hora em que a ação ocorreu
        TIMESTAMP,                                                  # tipo timestamp
        server_default=func.now()                                   # preenchido automaticamente pelo banco com o horário atual
    )

    usuario_alvo = relationship(                                    # relacionamento ORM com o usuário alvo da ação
        "Usuario",                                                  # relaciona com a classe Usuario
        foreign_keys=[usuario_alvo_id]                              # especifica que usa a coluna usuario_alvo_id como chave
    )
    usuario_acao = relationship(                                    # relacionamento ORM com o usuário que executou a ação
        "Usuario",                                                  # também relaciona com a classe Usuario
        foreign_keys=[usuario_acao_id]                              # especifica que usa a coluna usuario_acao_id como chave
    )

def registrar_auditoria_usuario(                                    # função de ajuda para registrar uma linha na auditoria de usuários
    db: Session,                                                    # sessão de banco de dados atual
    usuario_alvo_id: int,                                           # id do usuário que sofreu a ação
    acao: str,                                                      # código da ação realizada (ex.: "CRIAR_USUARIO")
    detalhes: Optional[str] = None,                                 # detalhes adicionais em texto/JSON (opcional)
    usuario_responsavel: Optional[Usuario] = None                   # usuário que executou a ação (opcional, ex.: admin)
) -> None:                                                          # função não retorna nada
    log = UsuarioAuditoria(                                         # cria um novo objeto de auditoria
        usuario_alvo_id=usuario_alvo_id,                            # seta o id do usuário alvo
        usuario_acao_id=usuario_responsavel.id                      # usa o id do usuário responsável se for informado
        if usuario_responsavel                                     # verifica se foi enviado um usuário responsável
        else None,                                                 # caso contrário, deixa como None
        acao=acao,                                                  # registra o tipo de ação
        detalhes=detalhes                                           # guarda os detalhes adicionais
    )
    db.add(log)                                                     # adiciona o registro de auditoria na sessão (commit será feito na rota)

# -----------------------------------------------------------
# Funções auxiliares para senha e token JWT
# -----------------------------------------------------------

def verificar_senha(senha_plana: str, senha_hash: str) -> bool:  # função para comparar senha digitada com o hash salvo
    return pwd_context.verify(senha_plana, senha_hash)           # usa o contexto do passlib para validar

def gerar_hash_senha(senha_plana: str) -> str:                   # função para gerar o hash de uma senha
    return pwd_context.hash(senha_plana)                         # retorna o hash bcrypt da senha

def gerar_senha_temporaria(tamanho: int = 10) -> str:            # gera uma senha temporária aleatória e segura com o tamanho informado
    alfabeto = string.ascii_letters + string.digits              # monta o conjunto de caracteres possíveis (letras maiúsculas/minúsculas + dígitos)
    return "".join(                                              # junta os caracteres escolhidos em uma única string
        secrets.choice(alfabeto)                                 # escolhe um caractere aleatório do alfabeto de forma criptograficamente segura
        for _ in range(tamanho)                                  # repete o processo 'tamanho' vezes
    )                                                            # retorna a senha gerada

def criar_token_acesso(dados: dict,                              # função para criar um token JWT
                       expira_em: Optional[timedelta] = None     # parâmetro opcional com tempo de expiração
                       ) -> str:                                 # retorna uma string com o token
    to_encode = dados.copy()                                     # copia o dicionário de dados (payload)
    if expira_em:                                                # se um delta de expiração foi passado
        expire = datetime.utcnow() + expira_em                   # calcula a data de expiração
    else:                                                        # se não foi passado
        expire = datetime.utcnow() + timedelta(                  # usa tempo padrão definido em minutos
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )
    to_encode.update({"exp": expire})                            # adiciona campo "exp" (expiração) ao payload
    encoded_jwt = jwt.encode(                                    # gera o token JWT
        to_encode,                                               # payload com dados + expiração
        SECRET_KEY,                                              # chave secreta usada na assinatura
        algorithm=ALGORITHM                                     # algoritmo definido anteriormente
    )
    return encoded_jwt                                           # devolve o token JWT assinado

# -----------------------------------------------------------
# Funções para buscar e autenticar usuários
# -----------------------------------------------------------

def obter_usuario_por_username(db: Session,                      # função para buscar usuário pelo username
                               username: str                     # username (login) a ser pesquisado
                               ) -> Optional[Usuario]:           # retorna um Usuario ou None
    return db.query(Usuario).filter(                             # monta query na tabela usuarios
        Usuario.username == username,                            # filtra pelo username informado
        Usuario.ativo == True                                    # garante que o usuário esteja ativo
    ).first()                                                    # pega o primeiro resultado (ou None)

def autenticar_usuario(db: Session,                              # função que valida login/senha
                       username: str,                            # login informado
                       senha_plana: str                          # senha digitada pelo usuário
                       ) -> Optional[Usuario]:                   # retorna o usuário se der certo, ou None se falhar
    usuario = obter_usuario_por_username(db, username)           # busca o usuário pelo login
    if not usuario:                                              # se não encontrou
        return None                                              # retorna None (falha de autenticação)
    if not verificar_senha(senha_plana, usuario.senha_hash):     # se a senha não confere com o hash
        return None                                              # falha de autenticação
    return usuario                                               # autenticação OK, retorna o usuário

# -----------------------------------------------------------
# Dependência de sessão de banco para usar nas rotas
# -----------------------------------------------------------
def get_db() -> Session:                                         # função de dependência que fornece uma sessão de banco
    db = SessionLocal()                                          # cria uma nova sessão
    try:
        yield db                                                  # entrega a sessão para quem chamou
    finally:
        db.close()                                               # fecha a sessão depois do uso

# Dependência para obter usuário logado a partir do token JWT
async def obter_usuario_atual(                                   # função assíncrona para pegar o user do token
    token: str = Depends(oauth2_scheme),                         # token obtido automaticamente do header Authorization
    db: Session = Depends(get_db)                                # sessão de banco injetada pelo FastAPI
) -> Usuario:                                                    # retorna um objeto Usuario
    cred_exc = HTTPException(                                    # exceção padrão para problema de credenciais
        status_code=401,                                         # código HTTP 401 - não autorizado
        detail="Não foi possível validar as credenciais.",       # mensagem genérica de erro
        headers={"WWW-Authenticate": "Bearer"}                   # indica que usamos esquema Bearer
    )
    try:
        payload = jwt.decode(                                    # tenta decodificar o token JWT
            token,                                               # token recebido
            SECRET_KEY,                                          # chave secreta usada na assinatura
            algorithms=[ALGORITHM]                               # algoritmo esperado
        )
        username: str = payload.get("sub")                       # pega o campo "sub" (subject) do payload
        if username is None:                                     # se não tiver username
            raise cred_exc                                       # lança erro de credenciais inválidas
    except JWTError:                                             # se ocorrer erro ao decodificar o token
        raise cred_exc                                           # lança erro de credenciais inválidas

    usuario = obter_usuario_por_username(db, username)           # busca o usuário no banco a partir do username
    if usuario is None:                                          # se não encontrar
        raise cred_exc                                           # lança erro de credenciais
    if not usuario.ativo:                                        # se o usuário estiver inativo/bloqueado
        raise HTTPException(                                     # lança erro 403 (proibido)
            status_code=403,
            detail="Usuário inativo."
        )
    return usuario                                               # retorna o usuário válido

# Dependência para garantir que o usuário atual é administrador
async def obter_admin_atual(                                     # função para validar se o usuário logado é admin
    usuario: Usuario = Depends(obter_usuario_atual)              # obtém o usuário atual via token
) -> Usuario:                                                    # retorna o mesmo usuário se for admin
    if not usuario.is_admin:                                     # se não for administrador
        raise HTTPException(                                     # lança erro 403 (proibido)
            status_code=403,
            detail="Apenas administradores podem realizar esta ação."
        )
    return usuario                                               # se for admin, retorna o usuário

# -----------------------------------------------------------
# Criação das tabelas no banco (se ainda não existirem)
# -----------------------------------------------------------
Base.metadata.create_all(bind=engine)                            # cria todas as tabelas definidas acima no banco

# -----------------------------------------------------------
# Bootstrap: cria usuário admin padrão se ainda não existir
# -----------------------------------------------------------

def criar_admin_se_nao_existir() -> None:                       # função que garante um admin padrão no banco
    db = SessionLocal()                                         # abre uma sessão de banco
    try:
        admin = db.query(Usuario).filter(                       # procura usuário com username "admin"
            Usuario.username == "admin"
        ).first()   
        if not admin:                                           # se não existir
            admin = Usuario(                                    # cria novo objeto Usuario
                nome="Administrador",                           # nome padrão
                email="miguelribeiro.dev1@gmail.com",                   # e-mail padrão
                username="admin",                               # login padrão
                senha_hash=gerar_hash_senha("admin123"),        # senha padrão "admin123" (hash)
                is_admin=True,                                  # marca como administrador
                precisa_trocar_senha=True                       # obriga troca de senha no primeiro login
            )
            db.add(admin)                                       # adiciona o admin à sessão
            db.commit()                                         # grava no banco
            print("Usuário admin criado com senha 'admin123'. Altere assim que possível.")  # log simples no console
    finally:
        db.close()                                              # garante o fechamento da sessão

criar_admin_se_nao_existir()                                    # chama a função na inicialização da aplicação

# -----------------------------------------------------------
# Schemas Pydantic (entrada/saída)
# -----------------------------------------------------------

# -----------------------------------------------------------
# Schemas Pydantic para autenticação e usuários
# -----------------------------------------------------------

class TokenSchema(BaseModel):                                   # schema de resposta do endpoint de login
    access_token: str                                           # token JWT gerado
    token_type: str = "bearer"                                  # tipo do token (sempre "bearer")

class UsuarioBaseSchema(BaseModel):                             # schema base com dados públicos do usuário
    id: int                                                     # identificador do usuário
    nome: str                                                   # nome completo do usuário
    email: str                                                  # e-mail principal do usuário
    username: str                                               # login usado para autenticação
    is_admin: bool                                              # indica se o usuário é administrador
    precisa_trocar_senha: bool                                  # indica se o usuário ainda precisa trocar a senha inicial
    ativo: bool                                                 # indica se o usuário está ativo ou bloqueado

    class Config:                                               # configurações do Pydantic
        orm_mode = True                                         # permite criar o schema a partir de objetos ORM

class UsuarioCreateSchema(BaseModel):                           # schema para criação de usuário (apenas admins podem chamar)
    nome: str                                                   # nome completo do usuário
    email: str                                                  # e-mail do usuário
    username: str                                               # login desejado (login de acesso)
    senha: str                                                  # senha inicial (será convertida em hash no backend)
    is_admin: bool = False                                      # indica se o novo usuário será administrador (padrão: False)

class UsuarioStatusUpdateSchema(BaseModel):                      # schema usado para ativar ou desativar um usuário
    ativo: bool                                                  # indica se o usuário deve ficar ativo (True) ou inativo (False)

class UsuarioMeSchema(UsuarioBaseSchema):                       # schema para retornar dados do usuário logado
    pass                                                        # herda tudo de UsuarioBaseSchema sem alterações

class TrocarSenhaSchema(BaseModel):                             # schema para alteração de senha pelo próprio usuário
    senha_atual: str                                            # senha atual digitada
    nova_senha: str                                             # nova senha desejada

class AvaliacaoBaseSchema(BaseModel):                            # schema base com campos principais
    cliente_nome: str = Field(..., description="Nome do cliente")# nome do cliente, obrigatório
    data_avaliacao: date = Field(  # data da avaliação em string, opcional (iremos converter manualmente)
        None,  # se None, mantém a data atual
        description="Data da avaliação no formato YYYY-MM-DD"  # formato esperado ao atualizar
    )
    local: Optional[str] = Field(                                # campo opcional para o local da instalação
        None,                                                    # valor padrão None (não obrigatório)
        description="Local da instalação"                        # descrição exibida na documentação
    )
    objeto: Optional[str] = Field(                               # campo opcional para o objeto da avaliação
        None,                                                    # valor padrão None (não obrigatório)
        description="Objeto da avaliação"                        # descrição exibida na documentação
    )
    status: Optional[str] = Field(                               # campo opcional para o status da avaliação
        "aberto",                                                # valor padrão "aberto" se não for enviado
        description="Status da avaliação"                        # descrição exibida na documentação
    )
    #tipo_formulario
    tipo_formulario: Optional[str] = Field(                      # novo campo para tipo de formulário
        None,                                                    # None = não informado / legado
        description="Tipo do formulário (ex.: redes, infraestrutura, etc.)"  # descrição para Swagger
    )
    #tipo_formulario
    class Config:                                                # configurações do Pydantic
        orm_mode = True                                          # permite criar instâncias a partir de modelos ORM


class AvaliacaoCreateSchema(AvaliacaoBaseSchema):  # Schema usado para criação de uma nova avaliação (entrada vinda do front)
    equipe: Optional[str] = None  # (texto) Nome da equipe responsável pela avaliação
    responsavel_avaliacao: Optional[str] = None  # (texto) Nome do responsável técnico/comercial pela avaliação
    contato: Optional[str] = None  # (texto) Nome da pessoa de contato do cliente
    email_cliente: Optional[str] = None  # (texto) E-mail do cliente para envio de proposta/relatório
    escopo_texto: Optional[str] = None  # (texto) Descrição resumida do escopo da avaliação

    servico_fora_montes_claros: Optional[bool] = None  # (sim/não) Indica se o serviço será fora de Montes Claros
    servico_intermediario: Optional[bool] = None  # (sim/não) Indica se haverá empresa intermediária/empreiteira

    # ---------------- Quantitativo 01 - Patch Panel / Cabeamento UTP ----------------
    q1_categoria_cab: Optional[str] = None  # (texto / opções Cat5e, Cat6, Cat6a) Categoria de cabeamento estruturado
    q1_blindado: Optional[bool] = None  # (sim/não) Se o cabeamento UTP será blindado
    q1_novo_patch_panel: Optional[bool] = None  # (sim/não) Se será fornecido patch panel novo
    q1_incluir_guia: Optional[bool] = None  # (sim/não) Se deve incluir guia de passagem / duto auxiliar
    q1_qtd_pontos_rede: Optional[int] = None  # (número) Quantidade de pontos de rede (dados)
    q1_qtd_cabos: Optional[int] = None  # (número) Quantidade de cabos de rede necessários
    q1_qtd_portas_patch_panel: Optional[int] = None  # (número) Quantidade de portas no patch panel
    q1_qtd_patch_cords: Optional[int] = None  # (número) Quantidade de patch cords (cordões de rede)
    q1_marca_cab: Optional[str] = None  # (texto) Marca do cabeamento UTP (CommScope, Furukawa ou "Outro: <texto>")    q1_modelo_patch_panel: Optional[str] = None  # (texto) Modelo do patch panel quando houver novo fornecimento (CommScope/Furukawa/Systimax ou "Outro: <texto>")
    q1_qtd_guias_cabos: Optional[int] = None  # (número) Quantidade de guias de cabos (usar apenas quando q1_incluir_guia = True)
    q1_patch_cords_modelo: Optional[str] = None  # (texto) Modelo/descrição dos patch cords (comprimentos, categoria, etc.)
    q1_patch_cords_cor: Optional[str] = None  # (texto) Cor ou cores dos patch cords utilizados
    q1_patch_panel_existente_nome: Optional[str] = None  # (texto) Identificação do patch panel existente (quando não for novo)
    q1_modelo_patch_panel: Optional[str] = None

    # ---------------- Quantitativo 02 - Switch ----------------
    q2_novo_switch: Optional[bool] = None  # (sim/não) Se haverá fornecimento de switch novo
    q2_switch_poe: Optional[bool] = None  # LEGADO - indica se o switch deveria ser PoE (não usado nos novos formulários)
    q2_rede_industrial: Optional[bool] = None  # LEGADO - indica se a rede é industrial (não usado nos novos formulários)
    q2_qtd_pontos_rede: Optional[int] = None  # LEGADO - quantidade de pontos de rede ligados ao switch (modelo antigo)
    q2_qtd_portas_switch: Optional[int] = None  # LEGADO - quantidade total de portas do switch (modelo antigo)
    q2_fornecedor_switch: Optional[str] = None  # (texto) Quem fornece o switch: 'nortetel' ou 'cliente'
    q2_modelo_switch: Optional[str] = None  # (texto) Modelo do switch (novo ou existente)
    q2_switch_foto_url: Optional[str] = None  # (texto) URL/caminho da foto do switch
    q2_switch_existente_nome: Optional[str] = None  # (texto) Nome/identificação do switch existente (quando não for novo)
    q2_observacoes: Optional[str] = None  # (texto) Observações específicas sobre switches/rede de acesso

    # ---------------- Quantitativo 03 – Cabeamento Óptico ----------------
    q3_tipo_fibra: Optional[str] = None  # (texto) Tipo de fibra (ex.: monomodo, multimodo)
    q3_qtd_fibras_por_cabo: Optional[int] = None  # (número) Quantidade de fibras por cabo óptico
    q3_tipo_conector: Optional[str] = None  # (texto) Tipo de conector (ex.: SC, LC)
    q3_novo_dio: Optional[bool] = None  # (sim/não) Se será fornecido DIO novo
    q3_caixa_terminacao: Optional[bool] = None  # (sim/não) Se haverá caixa de terminação óptica
    q3_tipo_cabo_optico: Optional[str] = None  # (texto) Tipo de cabo óptico (externo, interno, dielétrico, etc.)
    q3_caixa_emenda: Optional[bool] = None  # (sim/não) Se haverá caixa de emenda
    q3_qtd_cabos: Optional[int] = None  # (número) Quantidade de cabos ópticos
    q3_tamanho_total_m: Optional[float] = None  # (número) Tamanho total estimado dos cabos ópticos em metros
    q3_qtd_fibras: Optional[int] = None  # (número) Quantidade total de fibras utilizadas
    q3_qtd_portas_dio: Optional[int] = None  # (número) Quantidade de portas no DIO
    q3_qtd_cordoes_opticos: Optional[int] = None  # (número) Quantidade de cordões ópticos
    q3_marca_cab_optico: Optional[str] = None  # (texto) Marca do cabeamento óptico
    q3_modelo_dio: Optional[str] = None  # (texto) Modelo do DIO utilizado/fornecido
    q3_modelo_cordao_optico: Optional[str] = None  # (texto) Modelo/descrição dos cordões ópticos (comprimento, tipo de conector, etc.)
    q3_observacoes: Optional[str] = None  # (texto) Observações específicas da parte óptica

    # ---------------- Quantitativo 04 – Equipamentos (Câmeras, NVR/DVR, conversor, GBIC) ----------------
    q4_camera: Optional[bool] = None  # (sim/não) Se o escopo inclui câmeras de CFTV
    q4_nvr_dvr: Optional[bool] = None  # (sim/não) Se inclui NVR/DVR
    q4_access_point: Optional[bool] = None  # LEGADO - indica se inclui Access Points Wi-Fi (não usado nos novos formulários)
    q4_conversor_midia: Optional[bool] = None  # (sim/não) Se inclui conversores de mídia
    q4_gbic: Optional[bool] = None  # (sim/não) Se inclui módulos GBIC/SFP
    q4_switch: Optional[bool] = None  # LEGADO - indica se inclui switches adicionais (não usado nos novos formulários)
    q4_conversor_midia_modelo: Optional[str] = None  # (texto) Modelo do conversor de mídia
    q4_gbic_modelo: Optional[str] = None  # (texto) Modelo do GBIC
    q4_camera_nova: Optional[bool] = None  # (sim/não) Indica se as câmeras são novas (caso contrário, realocação)
    q4_camera_modelo: Optional[str] = None  # (texto) Modelo das câmeras
    q4_camera_qtd: Optional[int] = None  # (número) Quantidade de câmeras do modelo indicado
    q4_camera_fornecedor: Optional[str] = None  # (texto) Quem fornece as câmeras: 'nortetel' ou 'cliente'
    q4_nvr_dvr_modelo: Optional[str] = None  # (texto) Modelo do NVR ou DVR

    # ---------------- Quantitativo 05 – Infraestrutura ----------------
    q5_nova_eletrocalha: Optional[bool] = None  # (sim/não) Se será necessária nova eletrocalha
    q5_novo_eletroduto: Optional[bool] = None  # (sim/não) Se será necessário novo eletroduto
    q5_novo_rack: Optional[bool] = None  # (sim/não) Se haverá fornecimento de rack novo
    q5_instalacao_eletrica: Optional[bool] = None  # (sim/não) Se envolve instalação elétrica complementar
    q5_nobreak: Optional[bool] = None  # (sim/não) Se envolve fornecimento/instalação de nobreak
    q5_serralheria: Optional[bool] = None  # (sim/não) Se serão necessários serviços de serralheria/suportes especiais
    q5_eletrocalha_modelo: Optional[str] = None  # (texto) Modelo/descrição da eletrocalha
    q5_eletrocalha_qtd: Optional[int] = None  # (número) Quantidade de eletrocalhas
    q5_eletroduto_modelo: Optional[str] = None  # (texto) Modelo/descrição do eletroduto
    q5_eletroduto_qtd: Optional[int] = None  # (número) Quantidade de eletrodutos
    q5_rack_modelo: Optional[str] = None  # (texto) Modelo/descrição do rack
    q5_rack_qtd: Optional[int] = None  # (número) Quantidade de racks
    q5_nobreak_modelo: Optional[str] = None  # (texto) Modelo/descrição do nobreak
    q5_nobreak_qtd: Optional[int] = None  # (número) Quantidade de nobreaks
    q5_serralheria_descricao: Optional[str] = None  # (texto) Descrição detalhada da serralheria necessária
    q5_instalacao_eletrica_obs: Optional[str] = None  # (texto) Observações adicionais sobre instalação elétrica

    localizacao_imagem1_url: Optional[str] = None  # (texto) URL/caminho da primeira imagem de localização (planta/foto)
    localizacao_imagem2_url: Optional[str] = None  # (texto) URL/caminho da segunda imagem de localização (planta/foto)

    pre_trabalho_altura: Optional[bool] = None  # (sim/não) Indica se haverá trabalho em altura
    pre_plataforma: Optional[bool] = None  # (sim/não) Se será necessária plataforma elevatória
    pre_plataforma_modelo: Optional[str] = None  # (texto) Modelo/tipo da plataforma (tesoura, articulada, etc.)
    pre_plataforma_dias: Optional[int] = None  # (número) Quantidade de dias estimados de uso da plataforma
    pre_fora_horario_comercial: Optional[bool] = None  # (sim/não) Se o serviço será fora do horário comercial
    pre_veiculo_nortetel: Optional[bool] = None  # (sim/não) Se será necessário veículo da Nortetel
    pre_container_materiais: Optional[bool] = None  # (sim/não) Se será necessário contêiner/armazenamento de materiais

    encarregado_dias: Optional[int] = None  # (número - Tabela 4) Quantidade de dias de encarregado
    instalador_dias: Optional[int] = None  # (número - Tabela 4) Quantidade de dias de instalador
    auxiliar_dias: Optional[int] = None  # (número - Tabela 4) Quantidade de dias de auxiliar
    tecnico_de_instalacao_dias: Optional[int] = None  # (número - Tabela 4) Quantidade de dias de técnico de instalação
    tecnico_em_seguranca_dias: Optional[int] = None  # (número - Tabela 4) Quantidade de dias de técnico em segurança

    encarregado_hora_extra: Optional[int] = None  # (número - Tabela 4) Horas extras de encarregado
    instalador_hora_extra: Optional[int] = None  # (número - Tabela 4) Horas extras de instalador
    auxiliar_hora_extra: Optional[int] = None  # (número - Tabela 4) Horas extras de auxiliar
    tecnico_de_instalacao_hora_extra: Optional[int] = None  # (número - Tabela 4) Horas extras de técnico de instalação
    tecnico_em_seguranca_hora_extra: Optional[int] = None  # (número - Tabela 4) Horas extras de técnico em segurança

    encarregado_trabalho_domingo: Optional[int] = None  # (número - Tabela 4) Quantidade de domingos trabalhados pelo encarregado
    instalador_trabalho_domingo: Optional[int] = None  # (número - Tabela 4) Quantidade de domingos trabalhados pelo instalador
    auxiliar_trabalho_domingo: Optional[int] = None  # (número - Tabela 4) Quantidade de domingos trabalhados pelo auxiliar
    tecnico_de_instalacao_trabalho_domingo: Optional[int] = None  # (número - Tabela 4) Domingos trabalhados pelo técnico de instalação
    tecnico_em_seguranca_trabalho_domingo: Optional[int] = None  # (número - Tabela 4) Domingos trabalhados pelo técnico em segurança

    almoco_qtd: Optional[int] = None  # (número - Tabela 5) Quantidade estimada de almoços
    lanche_qtd: Optional[int] = None  # (número - Tabela 5) Quantidade estimada de lanches

    cronograma_execucao: Optional[bool] = None  # (sim/não) Se está previsto cronograma formal de execução
    dias_instalacao: Optional[int] = None  # (número) Quantidade estimada de dias de instalação
    as_built: Optional[bool] = None  # (sim/não) Se será entregue documentação As Built
    dias_entrega_relatorio: Optional[int] = None  # (número) Prazo em dias para entrega de relatório/AS BUILT
    art: Optional[bool] = None  # (sim/não) Se será emitida ART (Anotação de Responsabilidade Técnica)

class AvaliacaoUpdateSchema(BaseModel):  # schema usado para atualizar uma avaliação existente (todos os campos opcionais)
    #tipo_formulario
    tipo_formulario: Optional[str] = Field(                 # novo campo para atualizar o tipo de formulário
        None,                                               # se None, não altera o valor atual no banco
        description="Tipo do formulário (ex.: redes, infraestrutura, etc.)"  # descrição no Swagger
    )
    #tipo_formulario
    cliente_nome: Optional[str] = Field(  # nome do cliente, opcional na atualização
        None,  # se None, não altera o valor atual no banco
        description="Nome do cliente"  # descrição do campo na documentação (Swagger)
    )
    data_avaliacao: Optional[str] = Field(  # data da avaliação em string, opcional (iremos converter manualmente)
        None,  # se None, mantém a data atual
        description="Data da avaliação no formato YYYY-MM-DD"  # formato esperado ao atualizar
    )
    local: Optional[str] = Field(  # local da instalação, opcional
        None,  # se não enviado, não altera
        description="Local da instalação"  # descrição do campo
    )
    objeto: Optional[str] = Field(  # objeto da avaliação, opcional
        None,  # valor padrão None
        description="Objeto da avaliação"  # descrição do campo
    )
    status: Optional[str] = Field(  # status da avaliação, opcional
        None,  # se None, mantém o status atual
        description="Status da avaliação (aberto, aprovado, etc.)"  # explicação do campo
    )
    equipe: Optional[str] = Field(  # equipe responsável, opcional
        None,  # não enviado = não altera
        description="Equipe responsável pela avaliação"  # descrição do campo
    )
    responsavel_avaliacao: Optional[str] = Field(  # responsável técnico pela avaliação, opcional
        None,  # não enviado = não altera
        description="Responsável técnico pela avaliação"  # descrição do campo
    )
    contato: Optional[str] = Field(  # nome do contato do cliente, opcional
        None,  # valor padrão None
        description="Nome do contato do cliente"  # descrição do campo
    )
    email_cliente: Optional[str] = Field(  # e-mail do cliente, opcional
        None,  # se None, mantém o valor atual
        description="E-mail do cliente"  # descrição do campo
    )
    escopo_texto: Optional[str] = Field(  # escopo da avaliação, opcional
        None,  # se None, não altera
        description="Descrição do escopo da avaliação"  # descrição do campo
    )

    servico_fora_montes_claros: Optional[bool] = Field(  # indica se o serviço será fora de Montes Claros
        None,  # None significa "não alterar"
        description="Serviço fora de Montes Claros (True/False)"  # descrição do campo
    )
    servico_intermediario: Optional[bool] = Field(  # indica se haverá empresa intermediária/empreiteira
        None,  # None = não alterar
        description="Serviço intermediário / empreiteira (True/False)"  # descrição do campo
    )

    # ---------------- Quantitativo 01 - Patch Panel / Cabeamento UTP ----------------
    q1_categoria_cab: Optional[str] = Field(  # categoria de cabeamento estruturado
        None,  # None = não alterar
        description="Categoria do cabeamento (ex.: Cat5e, Cat6, Cat6a)"  # descrição do campo
    )
    q1_blindado: Optional[bool] = Field(  # indica se o cabeamento UTP será blindado
        None,  # None = não alterar
        description="Cabeamento blindado (True/False)"  # descrição do campo
    )
    q1_novo_patch_panel: Optional[bool] = Field(  # indica se será fornecido patch panel novo
        None,  # None = não alterar
        description="Fornecer patch panel novo (True/False)"  # descrição do campo
    )
    q1_incluir_guia: Optional[bool] = Field(  # se deve incluir guia de passagem / duto auxiliar
        None,  # None = não alterar
        description="Incluir guia de passagem (True/False)"  # descrição do campo
    )
    q1_qtd_pontos_rede: Optional[int] = Field(  # quantidade de pontos de rede
        None,  # None = não alterar
        description="Quantidade de pontos de rede"  # descrição do campo
    )
    q1_qtd_cabos: Optional[int] = Field(  # quantidade de cabos de rede necessários
        None,  # None = não alterar
        description="Quantidade de cabos de rede"  # descrição do campo
    )
    q1_qtd_portas_patch_panel: Optional[int] = Field(  # quantidade de portas no patch panel
        None,  # None = não alterar
        description="Quantidade de portas no patch panel"  # descrição do campo
    )
    q1_qtd_patch_cords: Optional[int] = Field(  # quantidade de patch cords
        None,  # None = não alterar
        description="Quantidade de patch cords"  # descrição do campo
    )
    q1_marca_cab: Optional[str] = Field(  # marca do cabeamento UTP
        None,  # None = não alterar
        description="Marca do cabeamento UTP (CommScope, Furukawa ou 'Outro: <texto>')"  # descrição do campo
    )
    q1_modelo_patch_panel: Optional[str] = Field(  # modelo do patch panel
        None,  # None = não alterar
        description="Modelo do patch panel quando houver novo fornecimento (CommScope 24 portas, Furukawa 24 portas, Systimax 24 portas ou 'Outro: <texto>')"  # descrição do campo
    )
    q1_qtd_guias_cabos: Optional[int] = Field(                    # quantidade de guias de cabos
        None,                                                     # None = não alterar
        description="Quantidade de guias de cabos (preenchida apenas quando q1_incluir_guia = True)"  # descrição do campo
    )
    q1_patch_cords_modelo: Optional[str] = Field(  # modelo dos patch cords
        None,  # None = não alterar
        description="Modelo/descrição dos patch cords (comprimentos, categoria, etc.)"  # descrição do campo
    )
    q1_patch_cords_cor: Optional[str] = Field(  # cor dos patch cords
        None,  # None = não alterar
        description="Cor ou cores dos patch cords"  # descrição do campo
    )
    q1_patch_panel_existente_nome: Optional[str] = Field(  # identificação do patch panel existente
        None,  # None = não alterar
        description="Identificação do patch panel existente (quando não houver novo fornecimento)"  # descrição do campo
    )

    # ---------------- Quantitativo 02 - Switch ----------------
    q2_novo_switch: Optional[bool] = Field(  # indica se haverá fornecimento de switch novo
        None,  # None = não alterar
        description="Fornecer switch novo (True/False)"  # descrição do campo
    )
    q2_switch_poe: Optional[bool] = Field(  # LEGADO - indicador de switch PoE
        None,  # None = não alterar
        description="LEGADO - Switch com PoE (modelo antigo, não usado nos novos formulários)"  # descrição do campo
    )
    q2_rede_industrial: Optional[bool] = Field(  # LEGADO - indicador de rede industrial
        None,  # None = não alterar
        description="LEGADO - Rede em ambiente industrial (modelo antigo, não usado nos novos formulários)"  # descrição do campo
    )
    q2_qtd_pontos_rede: Optional[int] = Field(  # LEGADO - quantidade de pontos de rede
        None,  # None = não alterar
        description="LEGADO - Quantidade de pontos de rede (dimensionamento antigo)"  # descrição do campo
    )
    q2_qtd_portas_switch: Optional[int] = Field(  # LEGADO - quantidade total de portas do switch
        None,  # None = não alterar
        description="LEGADO - Quantidade de portas do switch (dimensionamento antigo)"  # descrição do campo
    )
    q2_fornecedor_switch: Optional[str] = Field(  # quem fornece o switch
        None,  # None = não alterar
        description="Quem fornece o switch: 'nortetel' ou 'cliente'"  # descrição do campo
    )
    q2_modelo_switch: Optional[str] = Field(  # modelo do switch
        None,  # None = não alterar
        description="Modelo do switch (novo ou existente)"  # descrição do campo
    )
    q2_switch_foto_url: Optional[str] = Field(  # URL da foto do switch
        None,  # None = não alterar
        description="URL/caminho da foto do switch"  # descrição do campo
    )
    q2_switch_existente_nome: Optional[str] = Field(  # identificação do switch existente
        None,  # None = não alterar
        description="Nome/identificação do switch existente (quando não for novo)"  # descrição do campo
    )
    q2_observacoes: Optional[str] = Field(  # observações específicas sobre switches
        None,  # None = não alterar
        description="Observações sobre switches / rede de acesso"  # descrição do campo
    )

    # ---------------- Quantitativo 03 – Cabeamento Óptico ----------------
    q3_tipo_fibra: Optional[str] = Field(  # tipo de fibra (SM, OM1, OM2, etc.)
        None,  # None = não alterar
        description="Tipo de fibra óptica (SM, OM, etc.)"  # descrição do campo
    )
    q3_qtd_fibras_por_cabo: Optional[int] = Field(  # quantidade de fibras por cabo
        None,  # None = não alterar
        description="Quantidade de fibras por cabo óptico"  # descrição do campo
    )
    q3_tipo_conector: Optional[str] = Field(  # tipo de conector (LC, SC, etc.)
        None,  # None = não alterar
        description="Tipo de conector óptico (LC, SC, etc.)"  # descrição do campo
    )
    q3_novo_dio: Optional[bool] = Field(  # indica se será fornecido DIO novo
        None,  # None = não alterar
        description="Fornecer DIO novo (True/False)"  # descrição do campo
    )
    q3_caixa_terminacao: Optional[bool] = Field(  # indica se haverá caixa de terminação óptica
        None,  # None = não alterar
        description="Caixa de terminação óptica (True/False)"  # descrição do campo
    )
    q3_tipo_cabo_optico: Optional[str] = Field(  # tipo de cabo óptico
        None,  # None = não alterar
        description="Tipo de cabo óptico (externo, interno, dielétrico, etc.)"  # descrição do campo
    )
    q3_caixa_emenda: Optional[bool] = Field(  # indica se haverá caixa de emenda óptica
        None,  # None = não alterar
        description="Caixa de emenda óptica (True/False)"  # descrição do campo
    )
    q3_qtd_cabos: Optional[int] = Field(  # quantidade de cabos ópticos
        None,  # None = não alterar
        description="Quantidade de cabos ópticos"  # descrição do campo
    )
    q3_tamanho_total_m: Optional[float] = Field(  # tamanho total dos cabos em metros
        None,  # None = não alterar
        description="Tamanho total dos cabos ópticos em metros"  # descrição do campo
    )
    q3_qtd_fibras: Optional[int] = Field(  # quantidade total de fibras utilizadas
        None,  # None = não alterar
        description="Quantidade total de fibras"  # descrição do campo
    )
    q3_qtd_portas_dio: Optional[int] = Field(  # quantidade de portas no DIO
        None,  # None = não alterar
        description="Quantidade de portas do DIO"  # descrição do campo
    )
    q3_qtd_cordoes_opticos: Optional[int] = Field(  # quantidade de cordões ópticos
        None,  # None = não alterar
        description="Quantidade de cordões ópticos"  # descrição do campo
    )
    q3_marca_cab_optico: Optional[str] = Field(  # marca do cabo óptico
        None,  # None = não alterar
        description="Marca do cabeamento óptico"  # descrição do campo
    )
    q3_modelo_dio: Optional[str] = Field(  # modelo do DIO
        None,  # None = não alterar
        description="Modelo do DIO utilizado/fornecido"  # descrição do campo
    )
    q3_modelo_cordao_optico: Optional[str] = Field(  # modelo dos cordões
        None,  # None = não alterar
        description="Modelo/descrição dos cordões ópticos (comprimento, tipo de conector, etc.)"  # descrição do campo
    )
    q3_observacoes: Optional[str] = Field(  # observações da parte óptica
        None,  # None = não alterar
        description="Observações sobre cabeamento óptico"  # descrição do campo
    )

    # ---------------- Quantitativo 04 – Equipamentos (Câmeras, NVR/DVR, conversor, GBIC) ----------------
    q4_camera: Optional[bool] = Field(  # indica se o escopo inclui câmeras de CFTV
        None,  # None = não alterar
        description="Inclui câmeras de CFTV (True/False)"  # descrição do campo
    )
    q4_nvr_dvr: Optional[bool] = Field(  # indica se inclui NVR/DVR
        None,  # None = não alterar
        description="Inclui NVR/DVR (True/False)"  # descrição do campo
    )
    q4_access_point: Optional[bool] = Field(  # LEGADO - indica se inclui access points Wi-Fi
        None,  # None = não alterar
        description="LEGADO - Inclui Access Points Wi-Fi (modelo antigo, não usado nos novos formulários)"  # descrição do campo
    )
    q4_conversor_midia: Optional[bool] = Field(  # indica se inclui conversores de mídia
        None,  # None = não alterar
        description="Inclui conversores de mídia (True/False)"  # descrição do campo
    )
    q4_gbic: Optional[bool] = Field(  # indica se inclui módulos GBIC/SFP
        None,  # None = não alterar
        description="Inclui módulos GBIC/SFP (True/False)"  # descrição do campo
    )
    q4_switch: Optional[bool] = Field(  # LEGADO - indica se inclui switches adicionais
        None,  # None = não alterar
        description="LEGADO - Inclui switches adicionais (modelo antigo, não usado nos novos formulários)"  # descrição do campo
    )
    q4_conversor_midia_modelo: Optional[str] = Field(  # modelo do conversor de mídia
        None,  # None = não alterar
        description="Modelo do conversor de mídia"  # descrição do campo
    )
    q4_gbic_modelo: Optional[str] = Field(  # modelo do GBIC
        None,  # None = não alterar
        description="Modelo do GBIC"  # descrição do campo
    )
    q4_camera_nova: Optional[bool] = Field(  # indica se as câmeras são novas
        None,  # None = não alterar
        description="Câmeras novas (True) ou realocação (False)"  # descrição do campo
    )
    q4_camera_modelo: Optional[str] = Field(  # modelo das câmeras
        None,  # None = não alterar
        description="Modelo das câmeras de CFTV"  # descrição do campo
    )
    q4_camera_qtd: Optional[int] = Field(  # quantidade de câmeras
        None,  # None = não alterar
        description="Quantidade de câmeras do modelo indicado"  # descrição do campo
    )
    q4_camera_fornecedor: Optional[str] = Field(  # quem fornece as câmeras
        None,  # None = não alterar
        description="Quem fornece as câmeras: 'nortetel' ou 'cliente'"  # descrição do campo
    )
    q4_nvr_dvr_modelo: Optional[str] = Field(  # modelo do NVR/DVR
        None,  # None = não alterar
        description="Modelo do NVR ou DVR"  # descrição do campo
    )

    # ---------------- Quantitativo 05 – Infraestrutura ----------------
    q5_nova_eletrocalha: Optional[bool] = Field(  # indica se será necessária nova eletrocalha
        None,  # None = não alterar
        description="Nova eletrocalha (True/False)"  # descrição do campo
    )
    q5_novo_eletroduto: Optional[bool] = Field(  # indica se será necessário novo eletroduto
        None,  # None = não alterar
        description="Novo eletroduto (True/False)"  # descrição do campo
    )
    q5_novo_rack: Optional[bool] = Field(  # indica se haverá fornecimento de rack novo
        None,  # None = não alterar
        description="Novo rack (True/False)"  # descrição do campo
    )
    q5_instalacao_eletrica: Optional[bool] = Field(  # indica se envolve instalação elétrica complementar
        None,  # None = não alterar
        description="Instalação elétrica complementar (True/False)"  # descrição do campo
    )
    q5_nobreak: Optional[bool] = Field(  # indica se envolve fornecimento/instalação de nobreak
        None,  # None = não alterar
        description="Inclui nobreak (True/False)"  # descrição do campo
    )
    q5_serralheria: Optional[bool] = Field(  # indica se serão necessários serviços de serralheria
        None,  # None = não alterar
        description="Serviços de serralheria / suportes (True/False)"  # descrição do campo
    )
    q5_eletrocalha_modelo: Optional[str] = Field(  # modelo da eletrocalha
        None,  # None = não alterar
        description="Modelo/descrição da eletrocalha"  # descrição do campo
    )
    q5_eletrocalha_qtd: Optional[int] = Field(  # quantidade de eletrocalhas
        None,  # None = não alterar
        description="Quantidade de eletrocalhas"  # descrição do campo
    )
    q5_eletroduto_modelo: Optional[str] = Field(  # modelo do eletroduto
        None,  # None = não alterar
        description="Modelo/descrição do eletroduto"  # descrição do campo
    )
    q5_eletroduto_qtd: Optional[int] = Field(  # quantidade de eletrodutos
        None,  # None = não alterar
        description="Quantidade de eletrodutos"  # descrição do campo
    )
    q5_rack_modelo: Optional[str] = Field(  # modelo do rack
        None,  # None = não alterar
        description="Modelo/descrição do rack"  # descrição do campo
    )
    q5_rack_qtd: Optional[int] = Field(  # quantidade de racks
        None,  # None = não alterar
        description="Quantidade de racks"  # descrição do campo
    )
    q5_nobreak_modelo: Optional[str] = Field(  # modelo do nobreak
        None,  # None = não alterar
        description="Modelo/descrição do nobreak"  # descrição do campo
    )
    q5_nobreak_qtd: Optional[int] = Field(  # quantidade de nobreaks
        None,  # None = não alterar
        description="Quantidade de nobreaks"  # descrição do campo
    )
    q5_serralheria_descricao: Optional[str] = Field(  # descrição da serralheria
        None,  # None = não alterar
        description="Descrição detalhada da serralheria necessária"  # descrição do campo
    )
    q5_instalacao_eletrica_obs: Optional[str] = Field(  # observações da instalação elétrica
        None,  # None = não alterar
        description="Observações adicionais sobre instalação elétrica"  # descrição do campo
    )

    localizacao_imagem1_url: Optional[str] = Field(  # URL/caminho da primeira imagem de localização
        None,  # None = não alterar
        description="URL da primeira imagem de localização"  # descrição do campo
    )
    localizacao_imagem2_url: Optional[str] = Field(  # URL/caminho da segunda imagem de localização
        None,  # None = não alterar
        description="URL da segunda imagem de localização"  # descrição do campo
    )

    pre_trabalho_altura: Optional[bool] = Field(  # indica se haverá trabalho em altura
        None,  # None = não alterar
        description="Trabalho em altura (True/False)"  # descrição do campo
    )
    pre_plataforma: Optional[bool] = Field(  # indica se será necessária plataforma elevatória
        None,  # None = não alterar
        description="Necessidade de plataforma elevatória (True/False)"  # descrição do campo
    )
    pre_plataforma_modelo: Optional[str] = Field(  # modelo/tipo da plataforma
        None,  # None = não alterar
        description="Modelo/tipo da plataforma elevatória"  # descrição do campo
    )
    pre_plataforma_dias: Optional[int] = Field(  # quantidade de dias de uso da plataforma
        None,  # None = não alterar
        description="Quantidade de dias de uso da plataforma"  # descrição do campo
    )
    pre_fora_horario_comercial: Optional[bool] = Field(  # indica se o serviço será fora do horário comercial
        None,  # None = não alterar
        description="Serviço fora do horário comercial (True/False)"  # descrição do campo
    )
    pre_veiculo_nortetel: Optional[bool] = Field(  # indica se será necessário veículo da Nortetel
        None,  # None = não alterar
        description="Uso de veículo Nortetel (True/False)"  # descrição do campo
    )
    pre_container_materiais: Optional[bool] = Field(  # indica se será necessário contêiner de materiais
        None,  # None = não alterar
        description="Necessidade de contêiner de materiais (True/False)"  # descrição do campo
    )

    encarregado_dias: Optional[int] = Field(  # quantidade de dias de encarregado
        None,  # None = não alterar
        description="Quantidade de dias de encarregado"  # descrição do campo
    )
    instalador_dias: Optional[int] = Field(  # quantidade de dias de instalador
        None,  # None = não alterar
        description="Quantidade de dias de instalador"  # descrição do campo
    )
    auxiliar_dias: Optional[int] = Field(  # quantidade de dias de auxiliar
        None,  # None = não alterar
        description="Quantidade de dias de auxiliar"  # descrição do campo
    )
    tecnico_de_instalacao_dias: Optional[int] = Field(  # quantidade de dias de técnico de instalação
        None,  # None = não alterar
        description="Quantidade de dias de técnico de instalação"  # descrição do campo
    )
    tecnico_em_seguranca_dias: Optional[int] = Field(  # quantidade de dias de técnico em segurança
        None,  # None = não alterar
        description="Quantidade de dias de técnico em segurança"  # descrição do campo
    )

    encarregado_hora_extra: Optional[int] = Field(  # horas extras de encarregado
        None,  # None = não alterar
        description="Horas extras de encarregado"  # descrição do campo
    )
    instalador_hora_extra: Optional[int] = Field(  # horas extras de instalador
        None,  # None = não alterar
        description="Horas extras de instalador"  # descrição do campo
    )
    auxiliar_hora_extra: Optional[int] = Field(  # horas extras de auxiliar
        None,  # None = não alterar
        description="Horas extras de auxiliar"  # descrição do campo
    )
    tecnico_de_instalacao_hora_extra: Optional[int] = Field(  # horas extras de técnico de instalação
        None,  # None = não alterar
        description="Horas extras de técnico de instalação"  # descrição do campo
    )
    tecnico_em_seguranca_hora_extra: Optional[int] = Field(  # horas extras de técnico em segurança
        None,  # None = não alterar
        description="Horas extras de técnico em segurança"  # descrição do campo
    )

    encarregado_trabalho_domingo: Optional[int] = Field(  # domingos trabalhados pelo encarregado
        None,  # None = não alterar
        description="Domingos trabalhados pelo encarregado"  # descrição do campo
    )
    instalador_trabalho_domingo: Optional[int] = Field(  # domingos trabalhados pelo instalador
        None,  # None = não alterar
        description="Domingos trabalhados pelo instalador"  # descrição do campo
    )
    auxiliar_trabalho_domingo: Optional[int] = Field(  # domingos trabalhados pelo auxiliar
        None,  # None = não alterar
        description="Domingos trabalhados pelo auxiliar"  # descrição do campo
    )
    tecnico_de_instalacao_trabalho_domingo: Optional[int] = Field(  # domingos trabalhados pelo técnico de instalação
        None,  # None = não alterar
        description="Domingos trabalhados pelo técnico de instalação"  # descrição do campo
    )
    tecnico_em_seguranca_trabalho_domingo: Optional[int] = Field(  # domingos trabalhados pelo técnico em segurança
        None,  # None = não alterar
        description="Domingos trabalhados pelo técnico em segurança"  # descrição do campo
    )

    almoco_qtd: Optional[int] = Field(  # quantidade estimada de almoços
        None,  # None = não alterar
        description="Quantidade estimada de almoços"  # descrição do campo
    )
    lanche_qtd: Optional[int] = Field(  # quantidade estimada de lanches
        None,  # None = não alterar
        description="Quantidade estimada de lanches"  # descrição do campo
    )

    cronograma_execucao: Optional[bool] = Field(  # indica se está previsto cronograma formal de execução
        None,  # None = não alterar
        description="Cronograma formal de execução (True/False)"  # descrição do campo
    )
    dias_instalacao: Optional[int] = Field(  # quantidade estimada de dias de instalação
        None,  # None = não alterar
        description="Quantidade estimada de dias de instalação"  # descrição do campo
    )
    as_built: Optional[bool] = Field(  # indica se será entregue documentação As Built
        None,  # None = não alterar
        description="Entrega de documentação As Built (True/False)"  # descrição do campo
    )
    dias_entrega_relatorio: Optional[int] = Field(  # prazo em dias para entrega de relatório
        None,  # None = não alterar
        description="Prazo em dias para entrega de relatório / As Built"  # descrição do campo
    )
    art: Optional[bool] = Field(  # indica se será emitida ART
        None,  # None = não alterar
        description="Emissão de ART (True/False)"  # descrição do campo
    )

    class Config:  # configuração do Pydantic
        orm_mode = True  # permite converter diretamente a partir de objetos ORM do SQLAlchemy

class AvaliacaoOutSchema(AvaliacaoBaseSchema):                      # schema de saída de avaliação, herdando os campos básicos (cliente_nome, data_avaliacao, local, objeto, status, tipo_formulario)
    id: int = Field(...,                                            # id numérico da avaliação (chave primária no banco)
                    description="ID da avaliação")                  # descrição exibida na documentação/Swagger

    equipe: Optional[str] = Field(                                  # equipe responsável pela avaliação
        None,                                                       # None significa que pode vir vazio em alguns registros
        description="Equipe responsável pela avaliação"             # descrição do campo
    )
    responsavel_avaliacao: Optional[str] = Field(                   # responsável técnico pela avaliação
        None,                                                       # opcional
        description="Responsável técnico pela avaliação"            # descrição do campo
    )
    contato: Optional[str] = Field(                                 # nome do contato do cliente
        None,                                                       # opcional
        description="Nome do contato do cliente"                    # descrição do campo
    )
    email_cliente: Optional[str] = Field(                           # e-mail de contato do cliente
        None,                                                       # opcional
        description="E-mail do cliente"                             # descrição do campo
    )
    escopo_texto: Optional[str] = Field(                            # descrição textual do escopo
        None,                                                       # opcional
        description="Descrição do escopo da avaliação"              # descrição do campo
    )

    servico_fora_montes_claros: Optional[bool] = Field(             # flag indicando se o serviço é fora de Montes Claros
        None,                                                       # None = não informado
        description="Serviço fora de Montes Claros (True/False)"    # descrição do campo
    )
    servico_intermediario: Optional[bool] = Field(                  # flag indicando se há empresa intermediária/empreiteira
        None,                                                       # opcional
        description="Serviço intermediário / empreiteira (True/False)"  # descrição do campo
    )

    # ---------------- Quantitativo 01 - Patch Panel / Cabeamento UTP ----------------
    q1_categoria_cab: Optional[str] = Field(                        # categoria do cabeamento estruturado
        None,                                                       # opcional
        description="Categoria do cabeamento (ex.: Cat5e, Cat6, Cat6a)"  # descrição do campo
    )
    q1_blindado: Optional[bool] = Field(                            # indica se o cabeamento é blindado
        None,                                                       # opcional
        description="Cabeamento blindado (True/False)"              # descrição do campo
    )
    q1_novo_patch_panel: Optional[bool] = Field(                    # indica se será fornecido patch panel novo
        None,                                                       # opcional
        description="Fornecer patch panel novo (True/False)"        # descrição do campo
    )
    q1_incluir_guia: Optional[bool] = Field(                        # indica se será incluída guia de passagem
        None,                                                       # opcional
        description="Incluir guia de passagem (True/False)"         # descrição do campo
    )
    q1_qtd_guias_cabos: Optional[int] = Field(                    # quantidade de guias de cabos
        None,                                                     # opcional
        description="Quantidade de guias de cabos (usar apenas quando q1_incluir_guia = True)"  # descrição do campo
    )
    q1_qtd_pontos_rede: Optional[int] = Field(                      # quantidade de pontos de rede na área
        None,                                                       # opcional
        description="Quantidade de pontos de rede"                  # descrição do campo
    )
    q1_qtd_cabos: Optional[int] = Field(                            # quantidade de cabos de rede necessários
        None,                                                       # opcional
        description="Quantidade de cabos de rede"                   # descrição do campo
    )
    q1_qtd_portas_patch_panel: Optional[int] = Field(               # quantidade de portas do patch panel
        None,                                                       # opcional
        description="Quantidade de portas do patch panel"           # descrição do campo
    )
    q1_qtd_patch_cords: Optional[int] = Field(                      # quantidade de patch cords
        None,                                                       # opcional
        description="Quantidade de patch cords"                     # descrição do campo
    )
    q1_marca_cab: Optional[str] = Field(                            # marca do cabeamento UTP
        None,                                                       # opcional
        description="Marca do cabeamento UTP (CommScope, Furukawa ou 'Outro: <texto>')"  # descrição do campo
    )
    q1_modelo_patch_panel: Optional[str] = Field(                   # modelo do patch panel
        None,                                                       # opcional
        description="Modelo do patch panel quando houver novo fornecimento (CommScope 24 portas, Furukawa 24 portas, Systimax 24 portas ou 'Outro: <texto>')"  # descrição do campo
    )
    q1_patch_cords_modelo: Optional[str] = Field(                   # modelo/descrição dos patch cords
        None,                                                       # opcional
        description="Modelo/descrição dos patch cords (comprimentos, categoria, etc.)"  # descrição do campo
    )
    q1_patch_cords_cor: Optional[str] = Field(                      # cor ou cores dos patch cords
        None,                                                       # opcional
        description="Cor ou cores dos patch cords"                  # descrição do campo
    )
    q1_patch_panel_existente_nome: Optional[str] = Field(           # identificação do patch panel existente
        None,                                                       # opcional
        description="Identificação do patch panel existente (quando não houver novo fornecimento)"  # descrição do campo
    )

    # ---------------- Quantitativo 02 - Switch ----------------
    q2_novo_switch: Optional[bool] = Field(                         # indica se haverá fornecimento de switch novo
        None,                                                       # opcional
        description="Fornecer switch novo (True/False)"             # descrição do campo
    )
    q2_switch_poe: Optional[bool] = Field(                          # indica se o switch deve ser PoE
        None,                                                       # opcional
        description="Switch com PoE (True/False)"                   # descrição do campo
    )
    q2_rede_industrial: Optional[bool] = Field(                     # indica se a rede é em ambiente industrial
        None,                                                       # opcional
        description="Rede em ambiente industrial (True/False)"      # descrição do campo
    )
    q2_qtd_pontos_rede: Optional[int] = Field(                      # quantidade de pontos de rede ligados ao switch
        None,                                                       # opcional
        description="Quantidade de pontos de rede (switch)"         # descrição do campo
    )
    q2_qtd_portas_switch: Optional[int] = Field(                    # total de portas do switch
        None,                                                       # opcional
        description="Quantidade de portas do switch"                # descrição do campo
    )
    q2_fornecedor_switch: Optional[str] = Field(                    # quem fornece o switch
        None,                                                       # opcional
        description="Quem fornece o switch: 'nortetel' ou 'cliente'"  # descrição do campo
    )
    q2_modelo_switch: Optional[str] = Field(                        # modelo do switch
        None,                                                       # opcional
        description="Modelo do switch (novo ou existente)"          # descrição do campo
    )
    q2_switch_foto_url: Optional[str] = Field(                      # URL/caminho da foto do switch
        None,                                                       # opcional
        description="URL/caminho da foto do switch"                 # descrição do campo
    )
    q2_switch_existente_nome: Optional[str] = Field(                # identificação do switch existente
        None,                                                       # opcional
        description="Nome/identificação do switch existente (quando não for novo)"  # descrição do campo
    )
    q2_observacoes: Optional[str] = Field(                          # observações específicas sobre switches
        None,                                                       # opcional
        description="Observações sobre switches / rede de acesso"   # descrição do campo
    )

    # ---------------- Quantitativo 03 – Cabeamento Óptico ----------------
    q3_tipo_fibra: Optional[str] = Field(                           # tipo de fibra (SM, OM1, OM2, etc.)
        None,                                                       # opcional
        description="Tipo de fibra óptica (SM, OM, etc.)"           # descrição do campo
    )
    q3_qtd_fibras_por_cabo: Optional[int] = Field(                  # número de fibras em cada cabo
        None,                                                       # opcional
        description="Quantidade de fibras por cabo óptico"          # descrição do campo
    )
    q3_tipo_conector: Optional[str] = Field(                        # tipo de conector (LC, SC, etc.)
        None,                                                       # opcional
        description="Tipo de conector óptico (LC, SC, etc.)"        # descrição do campo
    )
    q3_novo_dio: Optional[bool] = Field(                            # indica se haverá DIO novo
        None,                                                       # opcional
        description="Fornecer DIO novo (True/False)"                # descrição do campo
    )
    q3_caixa_terminacao: Optional[bool] = Field(                    # indica se haverá caixa de terminação óptica
        None,                                                       # opcional
        description="Caixa de terminação óptica (True/False)"       # descrição do campo
    )
    q3_tipo_cabo_optico: Optional[str] = Field(                     # tipo de cabo óptico (externo, interno, etc.)
        None,                                                       # opcional
        description="Tipo de cabo óptico (externo, interno, dielétrico, etc.)"  # descrição do campo
    )
    q3_caixa_emenda: Optional[bool] = Field(                        # indica se haverá caixa de emenda óptica
        None,                                                       # opcional
        description="Caixa de emenda óptica (True/False)"           # descrição do campo
    )
    q3_qtd_cabos: Optional[int] = Field(                            # quantidade total de cabos ópticos
        None,                                                       # opcional
        description="Quantidade de cabos ópticos"                   # descrição do campo
    )
    q3_tamanho_total_m: Optional[float] = Field(                    # metragem total dos cabos ópticos
        None,                                                       # opcional
        description="Tamanho total dos cabos ópticos em metros"     # descrição do campo
    )
    q3_qtd_fibras: Optional[int] = Field(                           # quantidade total de fibras utilizadas
        None,                                                       # opcional
        description="Quantidade total de fibras"                    # descrição do campo
    )
    q3_qtd_portas_dio: Optional[int] = Field(                       # quantidade de portas do DIO
        None,                                                       # opcional
        description="Quantidade de portas do DIO"                   # descrição do campo
    )
    q3_qtd_cordoes_opticos: Optional[int] = Field(                  # quantidade de cordões ópticos
        None,                                                       # opcional
        description="Quantidade de cordões ópticos"                 # descrição do campo
    )
    q3_marca_cab_optico: Optional[str] = Field(                     # marca do cabo óptico
        None,                                                       # opcional
        description="Marca do cabeamento óptico"                    # descrição do campo
    )
    q3_modelo_dio: Optional[str] = Field(                           # modelo do DIO
        None,                                                       # opcional
        description="Modelo do DIO utilizado/fornecido"             # descrição do campo
    )
    q3_modelo_cordao_optico: Optional[str] = Field(                 # modelo dos cordões ópticos
        None,                                                       # opcional
        description="Modelo/descrição dos cordões ópticos (comprimento, tipo de conector, etc.)"  # descrição do campo
    )
    q3_observacoes: Optional[str] = Field(                          # observações gerais da parte óptica
        None,                                                       # opcional
        description="Observações sobre cabeamento óptico"           # descrição do campo
    )

    # ---------------- Quantitativo 04 – Equipamentos (Câmeras, NVR/DVR, conversor, GBIC) ----------------
    q4_camera: Optional[bool] = Field(                              # indica se o escopo inclui câmeras de CFTV
        None,                                                       # opcional
        description="Inclui câmeras de CFTV (True/False)"           # descrição do campo
    )
    q4_nvr_dvr: Optional[bool] = Field(                             # indica se inclui NVR/DVR
        None,                                                       # opcional
        description="Inclui NVR/DVR (True/False)"                   # descrição do campo
    )
    q4_access_point: Optional[bool] = Field(                        # indica se inclui access points Wi-Fi
        None,                                                       # opcional
        description="Inclui Access Points Wi-Fi (True/False)"       # descrição do campo
    )
    q4_conversor_midia: Optional[bool] = Field(                     # indica se inclui conversores de mídia
        None,                                                       # opcional
        description="Inclui conversores de mídia (True/False)"      # descrição do campo
    )
    q4_gbic: Optional[bool] = Field(                                # indica se inclui módulos GBIC/SFP
        None,                                                       # opcional
        description="Inclui módulos GBIC/SFP (True/False)"          # descrição do campo
    )
    q4_switch: Optional[bool] = Field(                              # indica se inclui switches adicionais
        None,                                                       # opcional
        description="Inclui switches adicionais (True/False)"       # descrição do campo
    )
    q4_conversor_midia_modelo: Optional[str] = Field(               # modelo do conversor de mídia
        None,                                                       # opcional
        description="Modelo do conversor de mídia"                  # descrição do campo
    )
    q4_gbic_modelo: Optional[str] = Field(                          # modelo do GBIC
        None,                                                       # opcional
        description="Modelo do GBIC"                                # descrição do campo
    )
    q4_camera_nova: Optional[bool] = Field(                         # indica se as câmeras são novas
        None,                                                       # opcional
        description="Câmeras novas (True) ou realocação (False)"    # descrição do campo
    )
    q4_camera_modelo: Optional[str] = Field(                        # modelo das câmeras
        None,                                                       # opcional
        description="Modelo das câmeras de CFTV"                    # descrição do campo
    )
    q4_camera_qtd: Optional[int] = Field(                           # quantidade de câmeras
        None,                                                       # opcional
        description="Quantidade de câmeras do modelo indicado"      # descrição do campo
    )
    q4_camera_fornecedor: Optional[str] = Field(                    # quem fornece as câmeras
        None,                                                       # opcional
        description="Quem fornece as câmeras: 'nortetel' ou 'cliente'"  # descrição do campo
    )
    q4_nvr_dvr_modelo: Optional[str] = Field(                       # modelo do NVR/DVR
        None,                                                       # opcional
        description="Modelo do NVR ou DVR"                          # descrição do campo
    )

    # ---------------- Quantitativo 05 – Infraestrutura ----------------
    q5_nova_eletrocalha: Optional[bool] = Field(                    # indica se será necessária nova eletrocalha
        None,                                                       # opcional
        description="Nova eletrocalha (True/False)"                 # descrição do campo
    )
    q5_novo_eletroduto: Optional[bool] = Field(                     # indica se será necessário novo eletroduto
        None,                                                       # opcional
        description="Novo eletroduto (True/False)"                  # descrição do campo
    )
    q5_novo_rack: Optional[bool] = Field(                           # indica se haverá fornecimento de rack novo
        None,                                                       # opcional
        description="Novo rack (True/False)"                        # descrição do campo
    )
    q5_instalacao_eletrica: Optional[bool] = Field(                 # indica se há instalação elétrica complementar
        None,                                                       # opcional
        description="Instalação elétrica complementar (True/False)" # descrição do campo
    )
    q5_nobreak: Optional[bool] = Field(                             # indica se inclui nobreak
        None,                                                       # opcional
        description="Inclui nobreak (True/False)"                   # descrição do campo
    )
    q5_serralheria: Optional[bool] = Field(                         # indica se serão necessários serviços de serralheria
        None,                                                       # opcional
        description="Serviços de serralheria / suportes (True/False)"  # descrição do campo
    )
    q5_eletrocalha_modelo: Optional[str] = Field(                   # modelo/descrição da eletrocalha
        None,                                                       # opcional
        description="Modelo/descrição da eletrocalha"              # descrição do campo
    )
    q5_eletrocalha_qtd: Optional[int] = Field(                      # quantidade de eletrocalhas
        None,                                                       # opcional
        description="Quantidade de eletrocalhas"                   # descrição do campo
    )
    q5_eletroduto_modelo: Optional[str] = Field(                    # modelo/descrição do eletroduto
        None,                                                       # opcional
        description="Modelo/descrição do eletroduto"              # descrição do campo
    )
    q5_eletroduto_qtd: Optional[int] = Field(                       # quantidade de eletrodutos
        None,                                                       # opcional
        description="Quantidade de eletrodutos"                   # descrição do campo
    )
    q5_rack_modelo: Optional[str] = Field(                          # modelo/descrição do rack
        None,                                                       # opcional
        description="Modelo/descrição do rack"                    # descrição do campo
    )
    q5_rack_qtd: Optional[int] = Field(                             # quantidade de racks
        None,                                                       # opcional
        description="Quantidade de racks"                          # descrição do campo
    )
    q5_nobreak_modelo: Optional[str] = Field(                       # modelo/descrição do nobreak
        None,                                                       # opcional
        description="Modelo/descrição do nobreak"                 # descrição do campo
    )
    q5_nobreak_qtd: Optional[int] = Field(                          # quantidade de nobreaks
        None,                                                       # opcional
        description="Quantidade de nobreaks"                       # descrição do campo
    )
    q5_serralheria_descricao: Optional[str] = Field(                # descrição detalhada da serralheria necessária
        None,                                                       # opcional
        description="Descrição detalhada da serralheria necessária"  # descrição do campo
    )
    q5_instalacao_eletrica_obs: Optional[str] = Field(              # observações adicionais sobre instalação elétrica
        None,                                                       # opcional
        description="Observações adicionais sobre instalação elétrica"  # descrição do campo
    )

    # ---------------- Localização / Referências ----------------
    localizacao_imagem1_url: Optional[str] = Field(                 # URL ou caminho da primeira imagem de localização
        None,                                                       # opcional
        description="URL da primeira imagem de localização"         # descrição do campo
    )
    localizacao_imagem2_url: Optional[str] = Field(                 # URL ou caminho da segunda imagem de localização
        None,                                                       # opcional
        description="URL da segunda imagem de localização"          # descrição do campo
    )

    # ---------------- Pré-requisitos ----------------
    pre_trabalho_altura: Optional[bool] = Field(                    # indica se haverá trabalho em altura
        None,                                                       # opcional
        description="Trabalho em altura (True/False)"               # descrição do campo
    )
    pre_plataforma: Optional[bool] = Field(                         # indica se será necessária plataforma elevatória
        None,                                                       # opcional
        description="Necessidade de plataforma elevatória (True/False)"  # descrição do campo
    )
    pre_plataforma_modelo: Optional[str] = Field(                   # modelo/tipo da plataforma
        None,                                                       # opcional
        description="Modelo/tipo da plataforma elevatória"          # descrição do campo
    )
    pre_plataforma_dias: Optional[int] = Field(                     # quantidade de dias de uso da plataforma
        None,                                                       # opcional
        description="Quantidade de dias de uso da plataforma"       # descrição do campo
    )
    pre_fora_horario_comercial: Optional[bool] = Field(             # indica se o serviço será fora do horário comercial
        None,                                                       # opcional
        description="Serviço fora do horário comercial (True/False)"  # descrição do campo
    )
    pre_veiculo_nortetel: Optional[bool] = Field(                   # indica se será necessário veículo da Nortetel
        None,                                                       # opcional
        description="Uso de veículo Nortetel (True/False)"          # descrição do campo
    )
    pre_container_materiais: Optional[bool] = Field(                # indica se será necessário contêiner de materiais
        None,                                                       # opcional
        description="Necessidade de contêiner de materiais (True/False)"  # descrição do campo
    )

    # ---------------- Horas trabalhadas (dias normais) ----------------
    encarregado_dias: Optional[int] = Field(                        # quantidade de dias de encarregado
        None,                                                       # opcional
        description="Quantidade de dias de encarregado"             # descrição do campo
    )
    instalador_dias: Optional[int] = Field(                         # quantidade de dias de instalador
        None,                                                       # opcional
        description="Quantidade de dias de instalador"              # descrição do campo
    )
    auxiliar_dias: Optional[int] = Field(                           # quantidade de dias de auxiliar
        None,                                                       # opcional
        description="Quantidade de dias de auxiliar"                # descrição do campo
    )
    tecnico_de_instalacao_dias: Optional[int] = Field(              # quantidade de dias de técnico de instalação
        None,                                                       # opcional
        description="Quantidade de dias de técnico de instalação"   # descrição do campo
    )
    tecnico_em_seguranca_dias: Optional[int] = Field(               # quantidade de dias de técnico em segurança
        None,                                                       # opcional
        description="Quantidade de dias de técnico em segurança"    # descrição do campo
    )

    # ---------------- Horas extras ----------------
    encarregado_hora_extra: Optional[int] = Field(                  # horas extras de encarregado
        None,                                                       # opcional
        description="Horas extras de encarregado"                   # descrição do campo
    )
    instalador_hora_extra: Optional[int] = Field(                   # horas extras de instalador
        None,                                                       # opcional
        description="Horas extras de instalador"                    # descrição do campo
    )
    auxiliar_hora_extra: Optional[int] = Field(                     # horas extras de auxiliar
        None,                                                       # opcional
        description="Horas extras de auxiliar"                      # descrição do campo
    )
    tecnico_de_instalacao_hora_extra: Optional[int] = Field(        # horas extras de técnico de instalação
        None,                                                       # opcional
        description="Horas extras de técnico de instalação"         # descrição do campo
    )
    tecnico_em_seguranca_hora_extra: Optional[int] = Field(         # horas extras de técnico em segurança
        None,                                                       # opcional
        description="Horas extras de técnico em segurança"          # descrição do campo
    )

    # ---------------- Trabalho em domingos/feriados ----------------
    encarregado_trabalho_domingo: Optional[int] = Field(            # domingos/feriados trabalhados pelo encarregado
        None,                                                       # opcional
        description="Domingos/feriados trabalhados pelo encarregado"  # descrição do campo
    )
    instalador_trabalho_domingo: Optional[int] = Field(             # domingos/feriados trabalhados pelo instalador
        None,                                                       # opcional
        description="Domingos/feriados trabalhados pelo instalador"  # descrição do campo
    )
    auxiliar_trabalho_domingo: Optional[int] = Field(               # domingos/feriados trabalhados pelo auxiliar
        None,                                                       # opcional
        description="Domingos/feriados trabalhados pelo auxiliar"   # descrição do campo
    )
    tecnico_de_instalacao_trabalho_domingo: Optional[int] = Field(  # domingos/feriados trabalhados pelo técnico de instalação
        None,                                                       # opcional
        description="Domingos/feriados trabalhados pelo técnico de instalação"  # descrição do campo
    )
    tecnico_em_seguranca_trabalho_domingo: Optional[int] = Field(   # domingos/feriados trabalhados pelo técnico em segurança
        None,                                                       # opcional
        description="Domingos/feriados trabalhados pelo técnico em segurança"  # descrição do campo
    )

    # ---------------- Alimentação ----------------
    almoco_qtd: Optional[int] = Field(                              # quantidade estimada de almoços
        None,                                                       # opcional
        description="Quantidade estimada de almoços"                # descrição do campo
    )
    lanche_qtd: Optional[int] = Field(                              # quantidade estimada de lanches
        None,                                                       # opcional
        description="Quantidade estimada de lanches"                # descrição do campo
    )

    # ---------------- Cronograma e prazos ----------------
    cronograma_execucao: Optional[bool] = Field(                    # indica se haverá cronograma formal de execução
        None,                                                       # opcional
        description="Cronograma formal de execução (True/False)"    # descrição do campo
    )
    dias_instalacao: Optional[int] = Field(                         # quantidade estimada de dias de instalação
        None,                                                       # opcional
        description="Quantidade estimada de dias de instalação"     # descrição do campo
    )
    as_built: Optional[bool] = Field(                               # indica se será entregue documentação As Built
        None,                                                       # opcional
        description="Entrega de documentação As Built (True/False)" # descrição do campo
    )
    dias_entrega_relatorio: Optional[int] = Field(                  # prazo em dias para entrega de relatório/As Built
        None,                                                       # opcional
        description="Prazo em dias para entrega de relatório / As Built"  # descrição do campo
    )
    art: Optional[bool] = Field(                                    # indica se será emitida ART
        None,                                                       # opcional
        description="Emissão de ART (True/False)"                   # descrição do campo
    )

    # ---------------- Metadados ----------------
    criado_em: Optional[datetime] = Field(                          # data/hora de criação do registro no banco
        None,                                                       # opcional (pode vir nulo em alguns contextos)
        description="Data/hora de criação da avaliação"             # descrição do campo
    )
    atualizado_em: Optional[datetime] = Field(                      # data/hora da última atualização do registro
        None,                                                       # opcional
        description="Data/hora da última atualização da avaliação"  # descrição do campo
    )

    class Config:                                                   # configuração interna do Pydantic
        orm_mode = True                                             # permite criar esse schema direto a partir de objetos ORM do SQLAlchemy

class AvaliacaoAuditoriaOutSchema(BaseModel):                    # schema de saída para auditoria
    id: int                                                      # id do registro de auditoria
    avaliacao_id: int                                            # id da avaliação associada
    usuario: Optional[str]                                       # usuário que fez a ação
    acao: str                                                    # tipo de ação
    detalhes: Optional[str]                                      # detalhes em texto
    data_hora: Optional[str]                                     # data/hora da ação

    class Config:                                                # configuração do Pydantic
        orm_mode = True                                          # permite ler de objeto ORM

class UsuarioAuditoriaOutSchema(BaseModel):                         # schema de saída para listar registros de auditoria de usuários
    id: int                                                         # id do registro de auditoria
    usuario_alvo_id: int                                            # id do usuário que sofreu a ação
    usuario_acao_id: Optional[int]                                  # id do usuário que executou a ação (pode ser None)
    acao: str                                                       # tipo de ação executada
    detalhes: Optional[str]                                         # detalhes extras em texto/JSON
    data_hora: Optional[datetime]                                   # data e hora em que a ação aconteceu

    class Config:                                                   # configuração do Pydantic
        orm_mode = True                                             # permite criar o schema a partir de objetos ORM do SQLAlchemy

class EquipamentoBaseSchema(BaseModel):                           # schema base para criação de equipamento
    equipamento: str = Field(                                     # nome do equipamento
        ...,                                                      # obrigatório
        description="Nome do equipamento"                         # descrição exibida no Swagger
    )
    modelo: Optional[str] = Field(                                # modelo do equipamento
        None,                                                     # opcional
        description="Modelo do equipamento"                       # descrição no Swagger
    )
    quantidade: int = Field(                                      # quantidade do equipamento
        ...,                                                      # obrigatório
        ge=1,                                                     # mínimo 1
        description="Quantidade do equipamento"                   # descrição no Swagger
    )
    fabricante: Optional[str] = Field(                            # fabricante do equipamento
        None,                                                     # opcional
        description="Fabricante do equipamento"                   # descrição no Swagger
    )

    class Config:                                                 # configurações do Pydantic
        orm_mode = True                                           # permite converter a partir de objetos ORM


class EquipamentoOutSchema(EquipamentoBaseSchema):                # schema de saída para equipamento
    id: int = Field(..., description="ID do equipamento")         # identificador único do equipamento
    avaliacao_id: int = Field(..., description="ID da avaliação") # id da avaliação relacionada


class OutroRecursoBaseSchema(BaseModel):                          # schema base para criação de outro recurso
    descricao: str = Field(                                       # descrição do recurso
        ...,                                                      # obrigatório
        description="Descrição do recurso (ex.: Almoço, Lanche)"  # descrição exibida no Swagger
    )
    quantidade: int = Field(                                      # quantidade do recurso
        ...,                                                      # obrigatório
        ge=1,                                                     # mínimo 1
        description="Quantidade do recurso"                       # descrição no Swagger
    )

    class Config:                                                 # configurações do Pydantic
        orm_mode = True                                           # permite converter a partir de objetos ORM

class OutroRecursoOutSchema(OutroRecursoBaseSchema):              # schema de saída para outro recurso
    id: int = Field(..., description="ID do recurso")             # identificador único do recurso
    avaliacao_id: int = Field(..., description="ID da avaliação") # id da avaliação relacionada


# -----------------------------------------------------------
# Criação da aplicação FastAPI
# -----------------------------------------------------------
app = FastAPI(                                                   # instancia a aplicação FastAPI
    title="API Avaliação Técnica de Instalações",                # título da API
    description="API para registrar e auditar avaliações técnicas de instalações.",  # descrição da API
    version="0.1.0"                                              # versão inicial da API
)

# -----------------------------------------------------------
# Configuração de CORS (para permitir o front do Netlify acessar a API)
# -----------------------------------------------------------
origins = [                                                      # lista de origens autorizadas a consumir a API
    "http://localhost:8000",                                     # origem quando o front é servido pelo próprio FastAPI em desenvolvimento
    "http://127.0.0.1:8000",                                     # variação com IP local
    "https://avaliacao-nortetel.netlify.app",                    # origem EXATA do front em produção no Netlify
]

app.add_middleware(                                              # registra o middleware de CORS na aplicação
    CORSMiddleware,                                              # classe de middleware usada para tratar CORS
    allow_origins=origins,                                       # restringe quais origens podem acessar a API
    allow_credentials=True,                                      # permite envio de cookies/credenciais (se um dia forem usados)
    allow_methods=["*"],                                         # libera todos os métodos HTTP (GET, POST, PUT, DELETE, etc.)
    allow_headers=["*"],                                         # libera todos os cabeçalhos nas requisições
)

# -----------------------------------------------------------
# Arquivos estáticos e rota raiz (para uso local / testes)
# -----------------------------------------------------------
app.mount(                                                       # registra uma rota de arquivos estáticos
    "/static",                                                   # prefixo de URL onde os arquivos ficarão acessíveis
    StaticFiles(directory="static"),                             # aponta para a pasta local "static" (CSS, JS, imagens)
    name="static",                                               # nome interno desse mount, usado apenas pelo FastAPI
)

@app.get("/")                                                    # define a rota GET para a raiz do site ("/")
def servir_frontend() -> FileResponse:                           # função chamada quando acessamos a raiz
    return FileResponse("index.html")                            # devolve o arquivo index.html na raiz do projeto (opção B que você escolheu)

# -----------------------------------------------------------
# Rota de saúde (opcional, só para testar se está no ar)
# -----------------------------------------------------------
@app.get("/health")                                              # define rota GET /health
def health_check():                                              # função que será executada nessa rota
    return {"status": "ok"}                                      # retorna JSON simples com status ok

# -----------------------------------------------------------
# Endpoint: login (gera token JWT)
# -----------------------------------------------------------
@app.post("/auth/login",                                        # rota POST /auth/login
          response_model=TokenSchema)                           # resposta no formato TokenSchema
async def login(                                                # função assíncrona para realizar login
    form_data: OAuth2PasswordRequestForm = Depends(),           # recebe username e password via formulário padrão OAuth2
    db: Session = Depends(get_db)                               # sessão de banco injetada
):
    usuario = autenticar_usuario(                               # tenta autenticar o usuário
        db,                                                     # sessão de banco
        form_data.username,                                     # login informado
        form_data.password                                      # senha digitada
    )
    if not usuario:                                             # se autenticação falhar
        raise HTTPException(                                    # lança erro 400
            status_code=400,
            detail="Usuário ou senha incorretos."               # mensagem genérica
        )

    expira = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)     # calcula tempo de expiração do token
    access_token = criar_token_acesso(                          # gera o token JWT
        dados={"sub": usuario.username},                        # define o "subject" (usuário) do token
        expira_em=expira                                        # tempo de expiração
    )

    return {                                                    # retorna o token e o tipo
        "access_token": access_token,
        "token_type": "bearer"
    }

# -----------------------------------------------------------
# Endpoint: dados do usuário logado
# -----------------------------------------------------------
@app.get("/auth/me",                                            # rota GET /auth/me
         response_model=UsuarioMeSchema)                        # resposta com dados do usuário
async def obter_me(                                             # função para retornar o usuário atual
    usuario: Usuario = Depends(obter_usuario_atual)             # obtém usuário atual a partir do token
):
    return usuario                                              # retorna o objeto usuário (convertido pelo Pydantic)

# -----------------------------------------------------------
# Endpoint: troca de senha (usuário logado)
# -----------------------------------------------------------
@app.post("/auth/trocar-senha")                                 # rota POST /auth/trocar-senha
async def trocar_senha(                                         # função para alteração de senha
    payload: TrocarSenhaSchema,                                 # corpo da requisição com senha atual e nova
    db: Session = Depends(get_db),                              # sessão de banco
    usuario: Usuario = Depends(obter_usuario_atual)             # usuário atual obtido pelo token
):
    if not verificar_senha(payload.senha_atual, usuario.senha_hash):  # verifica se a senha atual confere
        raise HTTPException(                                    # se não conferir, erro 400
            status_code=400,
            detail="Senha atual incorreta."
        )

    usuario.senha_hash = gerar_hash_senha(payload.nova_senha)     # atualiza o hash da senha do usuário com a nova senha digitada
    usuario.precisa_trocar_senha = False                          # remove a obrigatoriedade de trocar senha (já foi trocada)
    db.add(usuario)                                               # garante que o objeto usuário está anexado à sessão
    db.commit()                                                   # grava a alteração da senha no banco

    detalhes_log = json.dumps({                                   # monta um dicionário simples com informações para o log
        "acao": "TROCAR_SENHA",                                   # tipo da ação
        "usuario": usuario.username                               # login do usuário que trocou a senha
    }, ensure_ascii=False)                                        # mantém os caracteres especiais corretamente

    registrar_auditoria_usuario(                                  # registra a auditoria da troca de senha
        db=db,                                                    # sessão de banco atual
        usuario_alvo_id=usuario.id,                               # o próprio usuário é o alvo da ação
        acao="TROCAR_SENHA",                                      # código da ação
        detalhes=detalhes_log,                                    # detalhes em JSON
        usuario_responsavel=usuario                               # o usuário responsável pela ação é ele mesmo
    )
    db.commit()                                                   # commit final para salvar o registro de auditoria

    return {"detail": "Senha alterada com sucesso."}              # responde ao cliente informando o sucesso da operação

# -----------------------------------------------------------
# Endpoint: criar novo usuário (apenas admin)
# -----------------------------------------------------------
@app.post("/usuarios",                                          # rota POST /usuarios
          response_model=UsuarioBaseSchema)                     # responde com dados do usuário criado
async def criar_usuario(                                        # função para criar um novo usuário
    payload: UsuarioCreateSchema,                               # dados do novo usuário
    db: Session = Depends(get_db),                              # sessão de banco
    admin: Usuario = Depends(obter_admin_atual)                 # garante que quem chama é admin
):
    # Verifica se já existe usuário com mesmo username ou e-mail
    existente = db.query(Usuario).filter(                       # busca por conflito de login/e-mail
        (Usuario.username == payload.username) |                # mesmo username
        (Usuario.email == payload.email)                        # ou mesmo e-mail
    ).first()
    if existente:                                               # se encontrou conflito
        raise HTTPException(                                    # erro 400
            status_code=400,
            detail="Já existe usuário com esse login ou e-mail."
        )

    novo_usuario = Usuario(                                     # cria novo objeto Usuario com base nos dados recebidos
        nome=payload.nome,                                      # define o nome completo a partir do payload
        email=payload.email,                                    # define o e-mail a partir do payload
        username=payload.username,                              # define o login de acesso
        senha_hash=gerar_hash_senha(payload.senha),             # gera o hash seguro da senha inicial
        is_admin=payload.is_admin,                              # define se o usuário será administrador ou não
        precisa_trocar_senha=True                               # obriga troca de senha no primeiro login
    )

    db.add(novo_usuario)                                        # adiciona novo usuário na sessão
    db.commit()                                                 # grava no banco
    db.refresh(novo_usuario)                                    # atualiza o objeto com dados do banco (id, etc.)

    detalhes_log = json.dumps({                                   # monta um dicionário com alguns dados do usuário criado para salvar no log
        "acao": "CRIAR_USUARIO",                                  # identifica o tipo de ação registrada
        "nome": novo_usuario.nome,                                # nome do usuário criado
        "email": novo_usuario.email,                              # e-mail do usuário criado
        "username": novo_usuario.username                         # login do usuário criado
    }, ensure_ascii=False)                                        # garante que acentos e caracteres especiais sejam mantidos corretamente

    registrar_auditoria_usuario(                                  # chama o helper para registrar a auditoria dessa ação
        db=db,                                                    # passa a sessão de banco atual
        usuario_alvo_id=novo_usuario.id,                          # id do usuário que acabou de ser criado
        acao="CRIAR_USUARIO",                                     # código da ação
        detalhes=detalhes_log,                                    # detalhes em JSON
        usuario_responsavel=admin                                 # usuário responsável pela ação (o admin logado)
    )
    db.commit()                                                   # faz um novo commit para gravar o registro de auditoria

    return novo_usuario                                         # retorna o usuário criado

# -----------------------------------------------------------
# Endpoint: listar usuários (apenas admin)
# -----------------------------------------------------------
@app.get("/usuarios",                                           # rota GET /usuarios para listar todos os usuários
         response_model=List[UsuarioBaseSchema])                # resposta será uma lista de usuários no formato base
async def listar_usuarios(                                      # função assíncrona para listar usuários
    db: Session = Depends(get_db),                              # injeta sessão de banco de dados
    admin: Usuario = Depends(obter_admin_atual)                 # garante que apenas administradores possam acessar a lista
):
    usuarios = db.query(Usuario).order_by(Usuario.id.asc()).all()  # busca todos os usuários ordenando pelo id crescente
    return usuarios                                             # retorna a lista de usuários

# -----------------------------------------------------------
# Endpoint: ativar/desativar usuário (apenas admin)
# -----------------------------------------------------------
@app.patch("/usuarios/{usuario_id}/status",                     # rota PATCH para alterar o campo "ativo" de um usuário
           response_model=UsuarioBaseSchema)                    # responde com o usuário atualizado
async def atualizar_status_usuario(                             # função assíncrona para atualizar o status de um usuário
    usuario_id: int,                                            # id do usuário recebido na URL
    payload: UsuarioStatusUpdateSchema,                         # corpo da requisição com o novo valor de "ativo"
    db: Session = Depends(get_db),                              # sessão de banco injetada pelo FastAPI
    admin: Usuario = Depends(obter_admin_atual)                 # usuário logado, garantido como administrador
):
    usuario = db.query(Usuario).filter(                         # monta consulta na tabela de usuários
        Usuario.id == usuario_id                                # filtra pelo id informado na rota
    ).first()                                                   # obtém o primeiro resultado (ou None)

    if not usuario:                                             # se nenhum usuário foi encontrado
        raise HTTPException(                                    # lança erro HTTP
            status_code=404,                                    # código 404 - não encontrado
            detail="Usuário não encontrado."                    # mensagem explicando o problema
        )

    if usuario.id == admin.id and not payload.ativo:            # se o admin tentar desativar o próprio usuário logado
        raise HTTPException(                                    # lança erro HTTP
            status_code=400,                                    # código 400 - requisição inválida
            detail="Você não pode desativar o próprio usuário logado."  # motivo da restrição
        )

    usuario.ativo = payload.ativo                               # aplica o novo valor de "ativo" ao usuário
    db.add(usuario)                                             # adiciona o objeto usuário na sessão de banco
    db.commit()                                                 # grava a alteração no banco
    db.refresh(usuario)                                         # recarrega o objeto usuário com os dados atualizados

    acao = "ATIVAR_USUARIO" if usuario.ativo else "DESATIVAR_USUARIO"  # define o código da ação conforme o novo status

    detalhes_log = json.dumps({                                 # monta o JSON com detalhes para o log
        "acao": acao,                                           # tipo de ação (ATIVAR_USUARIO ou DESATIVAR_USUARIO)
        "usuario_alvo": usuario.username                        # login do usuário afetado pela ação
    }, ensure_ascii=False)                                      # mantém acentuação corretamente

    registrar_auditoria_usuario(                                # registra a ação na tabela de auditoria de usuários
        db=db,                                                  # sessão de banco atual
        usuario_alvo_id=usuario.id,                             # id do usuário que sofreu a ação
        acao=acao,                                              # código da ação (ATIVAR_USUARIO ou DESATIVAR_USUARIO)
        detalhes=detalhes_log,                                  # detalhes em JSON
        usuario_responsavel=admin                               # aqui usamos o admin logado, NÃO Depends(...)
    )
    db.commit()                                                 # faz commit para gravar o registro de auditoria

    return usuario                                              # retorna o usuário atualizado para o cliente

# -----------------------------------------------------------
# Endpoint: resetar senha de usuário (apenas admin)
# -----------------------------------------------------------
@app.post("/usuarios/{usuario_id}/resetar-senha")               # rota POST /usuarios/{id}/resetar-senha
async def resetar_senha_usuario(                                # função assíncrona para resetar a senha de um usuário
    usuario_id: int,                                            # id do usuário recebido na URL
    db: Session = Depends(get_db),                              # sessão de banco injetada
    admin: Usuario = Depends(obter_admin_atual)                 # garante que apenas administradores executem a ação
):
    usuario = db.query(Usuario).filter(                         # consulta a tabela de usuários
        Usuario.id == usuario_id                                # filtra pelo id informado
    ).first()                                                   # obtém o primeiro resultado (ou None)

    if not usuario:                                             # se o usuário não foi encontrado
        raise HTTPException(                                    # lança exceção HTTP
            status_code=404,                                    # código 404 - não encontrado
            detail="Usuário não encontrado."                    # mensagem explicando o problema
        )

    senha_temporaria = gerar_senha_temporaria(10)               # gera uma nova senha temporária com 10 caracteres
    usuario.senha_hash = gerar_hash_senha(senha_temporaria)     # atualiza o hash de senha com a nova senha temporária
    usuario.precisa_trocar_senha = True                         # força o usuário a trocar a senha no próximo login
    usuario.ativo = True                                        # garante que o usuário esteja ativo após o reset de senha
    db.add(usuario)                                             # adiciona o usuário modificado na sessão
    db.commit()                                                 # grava as alterações no banco

    detalhes_log = json.dumps({                                   # monta detalhes específicos da ação executada
        "acao": "RESET_SENHA",                              # ajuste para ATIVAR_USUARIO ou RESET_SENHA conforme o caso
        "usuario_alvo": usuario.username                          # login do usuário afetado
    }, ensure_ascii=False)                                        # mantém acentos corretamente

    registrar_auditoria_usuario(                                  # registra a auditoria dessa operação
        db=db,                                                    # sessão de banco
        usuario_alvo_id=usuario.id,                               # id do usuário alvo da ação
        acao="RESET_SENHA",                                 # ajuste para o código correto da ação
        detalhes=detalhes_log,                                    # detalhes em JSON
        usuario_responsavel=admin               # passe o usuário responsável (ex.: admin da dependência)
    )
    db.commit()                                                   # commit para gravar o log de auditoria


    return {                                                    # retorna um JSON com informações da operação
        "detail": "Senha temporária gerada com sucesso.",       # mensagem de confirmação da ação
        "senha_temporaria": senha_temporaria                    # senha temporária para o administrador informar ao usuário
    }                                          # devolve a lista de usuários para o cliente

# -----------------------------------------------------------
# Endpoint: criar nova avaliação (POST /avaliacoes)
# -----------------------------------------------------------
@app.post("/avaliacoes",                                         # define rota POST /avaliacoes
          response_model=AvaliacaoOutSchema)                     # define o schema de resposta
def criar_avaliacao(                                             # função para criar avaliação
    payload: AvaliacaoCreateSchema,                              # dados recebidos no corpo da requisição (já parseados pelo Pydantic)
    db: Session = Depends(get_db)                               # sessão de banco injetada pela dependência
):
    # Neste ponto, payload.data_avaliacao já é um objeto date,    # comentário explicando que o Pydantic já converteu a string
    # porque tipamos o campo como date no schema.                 # reforço da compatibilidade com a coluna Date do SQLAlchemy

    avaliacao = Avaliacao(                                           # instancia um novo objeto Avaliacao
        cliente_nome=payload.cliente_nome,                           # nome do cliente
        data_avaliacao=payload.data_avaliacao,                       # data da avaliação (já é date)
        local=payload.local,                                         # local da instalação
        objeto=payload.objeto,                                       # objeto da avaliação
        status=payload.status or "aberto",                           # status, com fallback para "aberto"
        equipe=payload.equipe,                                       # equipe responsável
        responsavel_avaliacao=payload.responsavel_avaliacao,         # responsável técnico pela avaliação
        #tipo_formulario
        tipo_formulario=payload.tipo_formulario,                     # tipo de formulário (redes, infraestrutura, etc.)
        #tipo_formulario
        contato=payload.contato,                                     # contato do cliente
        email_cliente=payload.email_cliente,                         # e-mail do cliente
        escopo_texto=payload.escopo_texto,                           # texto do escopo da avaliação

        # ====== Campos gerais de serviço (fora MC / intermediário) ======
        servico_fora_montes_claros=payload.servico_fora_montes_claros,   # flag se serviço é fora de Montes Claros
        servico_intermediario=payload.servico_intermediario,             # flag se serviço é para intermediário/empreiteira

        # ====== Quantitativo 01 – Patch Panel ======
        q1_categoria_cab=payload.q1_categoria_cab,                        # categoria do cabeamento (Cat5e/Cat6/Cat6a)
        q1_blindado=payload.q1_blindado,                                  # se o cabeamento é blindado (STP/UTP)
        q1_novo_patch_panel=payload.q1_novo_patch_panel,                  # indica se será fornecido novo patch panel
        q1_incluir_guia=payload.q1_incluir_guia,                          # indica se devem ser incluídas guias de cabos
        q1_qtd_pontos_rede=payload.q1_qtd_pontos_rede,                    # quantidade de pontos de rede previstos
        q1_qtd_cabos=payload.q1_qtd_cabos,                                # quantidade de cabos UTP previstos
        q1_qtd_portas_patch_panel=payload.q1_qtd_portas_patch_panel,      # quantidade de portas do patch panel
        q1_qtd_patch_cords=payload.q1_qtd_patch_cords,                    # quantidade de patch cords previstos
        q1_marca_cab=payload.q1_marca_cab,                 # marca do cabeamento UTP a ser usado (CommScope, Furukawa ou "Outro: <texto>")
        q1_modelo_patch_panel=payload.q1_modelo_patch_panel,              # modelo/descrição do patch panel (fabricante, nº de portas, etc.)
        q1_qtd_guias_cabos=payload.q1_qtd_guias_cabos,                    # quantidade de guias de cabos a instalar
        q1_patch_cords_modelo=payload.q1_patch_cords_modelo,              # modelo/descrição dos patch cords (categoria, comprimento, etc.)
        q1_patch_cords_cor=payload.q1_patch_cords_cor,                    # cor ou cores dos patch cords
        q1_patch_panel_existente_nome=payload.q1_patch_panel_existente_nome,  # identificação do patch panel existente, quando não for fornecido novo

        # ====== Quantitativo 02 – Switch ======
        q2_novo_switch=payload.q2_novo_switch,                       # indica se haverá fornecimento de switch novo
        q2_switch_poe=payload.q2_switch_poe,                         # LEGADO - necessidade de PoE (modelo antigo de formulário)
        q2_rede_industrial=payload.q2_rede_industrial,               # LEGADO - indicação de rede industrial (modelo antigo)
        q2_qtd_pontos_rede=payload.q2_qtd_pontos_rede,               # LEGADO - quantidade de pontos atendidos (modelo antigo)
        q2_qtd_portas_switch=payload.q2_qtd_portas_switch,           # LEGADO - quantidade de portas do switch (modelo antigo)
        q2_fornecedor_switch=payload.q2_fornecedor_switch,           # quem fornece o switch: 'nortetel' ou 'cliente'
        q2_modelo_switch=payload.q2_modelo_switch,                   # modelo do switch (novo ou existente)
        q2_switch_foto_url=payload.q2_switch_foto_url,               # URL ou caminho da foto do switch existente
        q2_switch_existente_nome=payload.q2_switch_existente_nome,   # identificação/nome do switch existente
        q2_observacoes=payload.q2_observacoes,                       # observações gerais sobre o(s) switch(es)

        # ====== Quantitativo 03 – Cabeamento Óptico ======
        q3_tipo_fibra=payload.q3_tipo_fibra,                         # tipo de fibra (SM, OM1, OM3...)
        q3_qtd_fibras_por_cabo=payload.q3_qtd_fibras_por_cabo,       # quantas fibras por cabo (02F, 04F, etc.)
        q3_tipo_conector=payload.q3_tipo_conector,                   # tipo de conector (LC, SC, ST, MTRJ)
        q3_novo_dio=payload.q3_novo_dio,                             # se precisa de DIO novo
        q3_caixa_terminacao=payload.q3_caixa_terminacao,             # se precisa de caixa de terminação
        q3_tipo_cabo_optico=payload.q3_tipo_cabo_optico,             # tipo de cabo óptico (indoor, outdoor, autossustentado)
        q3_caixa_emenda=payload.q3_caixa_emenda,                     # se precisa de caixa de emenda
        q3_qtd_cabos=payload.q3_qtd_cabos,                           # quantidade de cabos ópticos previstos
        q3_tamanho_total_m=payload.q3_tamanho_total_m,               # metragem total estimada dos cabos ópticos (em metros)
        q3_qtd_fibras=payload.q3_qtd_fibras,                         # quantidade total de fibras
        q3_qtd_portas_dio=payload.q3_qtd_portas_dio,                 # quantidade de portas do DIO
        q3_qtd_cordoes_opticos=payload.q3_qtd_cordoes_opticos,       # quantidade de cordões ópticos
        q3_marca_cab_optico=payload.q3_marca_cab_optico,             # marca do cabeamento óptico
        q3_modelo_dio=payload.q3_modelo_dio,                         # modelo/descrição do DIO
        q3_modelo_cordao_optico=payload.q3_modelo_cordao_optico,     # modelo/descrição dos cordões ópticos
        q3_observacoes=payload.q3_observacoes,                       # observações gerais sobre o cabeamento óptico

        # ====== Quantitativo 04 – Equipamentos (Câmeras / NVR/DVR / Conversor / GBIC) ======
        q4_camera=payload.q4_camera,                                 # indica se a avaliação envolve câmeras de CFTV
        q4_nvr_dvr=payload.q4_nvr_dvr,                               # indica se haverá NVR ou DVR
        q4_access_point=payload.q4_access_point,                     # LEGADO - Access Points (modelo antigo, não usado nos novos formulários)
        q4_conversor_midia=payload.q4_conversor_midia,               # indica se haverá conversor de mídia
        q4_gbic=payload.q4_gbic,                                     # indica se haverá GBIC/SFP
        q4_switch=payload.q4_switch,                                 # LEGADO - switches adicionais (modelo antigo)
        q4_conversor_midia_modelo=payload.q4_conversor_midia_modelo, # modelo/descrição do conversor de mídia
        q4_gbic_modelo=payload.q4_gbic_modelo,                       # modelo/descrição do GBIC/SFP
        q4_camera_nova=payload.q4_camera_nova,                       # True = câmeras novas, False = realocação
        q4_camera_modelo=payload.q4_camera_modelo,                   # modelo das câmeras de CFTV
        q4_camera_qtd=payload.q4_camera_qtd,                         # quantidade de câmeras do modelo informado
        q4_camera_fornecedor=payload.q4_camera_fornecedor,           # quem fornece as câmeras: 'nortetel' ou 'cliente'
        q4_nvr_dvr_modelo=payload.q4_nvr_dvr_modelo,                 # modelo/descrição do NVR/DVR

        # ====== Quantitativo 05 – Infraestrutura ======
        q5_nova_eletrocalha=payload.q5_nova_eletrocalha,             # indica se haverá nova eletrocalha
        q5_novo_eletroduto=payload.q5_novo_eletroduto,               # indica se haverá novo eletroduto
        q5_novo_rack=payload.q5_novo_rack,                           # indica se haverá novo rack
        q5_instalacao_eletrica=payload.q5_instalacao_eletrica,       # indica se haverá adequação/instalação elétrica
        q5_nobreak=payload.q5_nobreak,                               # indica se haverá fornecimento de nobreak
        q5_serralheria=payload.q5_serralheria,                       # indica se haverá serviços de serralheria/suportes
        q5_eletrocalha_modelo=payload.q5_eletrocalha_modelo,         # modelo/descrição da eletrocalha
        q5_eletrocalha_qtd=payload.q5_eletrocalha_qtd,               # quantidade de eletrocalhas
        q5_eletroduto_modelo=payload.q5_eletroduto_modelo,           # modelo/descrição do eletroduto
        q5_eletroduto_qtd=payload.q5_eletroduto_qtd,                 # quantidade de eletrodutos
        q5_rack_modelo=payload.q5_rack_modelo,                       # modelo/descrição do rack
        q5_rack_qtd=payload.q5_rack_qtd,                             # quantidade de racks
        q5_nobreak_modelo=payload.q5_nobreak_modelo,                 # modelo/descrição do nobreak
        q5_nobreak_qtd=payload.q5_nobreak_qtd,                       # quantidade de nobreaks
        q5_serralheria_descricao=payload.q5_serralheria_descricao,   # descrição detalhada da serralheria necessária
        q5_instalacao_eletrica_obs=payload.q5_instalacao_eletrica_obs, # observações adicionais sobre instalação elétrica

        # ====== Localização / imagens de referência ======
        localizacao_imagem1_url=payload.localizacao_imagem1_url,     # URL da primeira imagem de referência
        localizacao_imagem2_url=payload.localizacao_imagem2_url,     # URL da segunda imagem de referência

        # ====== Pré-requisitos de instalação ======
        pre_trabalho_altura=payload.pre_trabalho_altura,             # se é trabalho em altura
        pre_plataforma=payload.pre_plataforma,                       # se precisa de plataforma
        pre_plataforma_modelo=payload.pre_plataforma_modelo,         # modelo da plataforma (se aplicável)
        pre_plataforma_dias=payload.pre_plataforma_dias,             # dias de uso da plataforma
        pre_fora_horario_comercial=payload.pre_fora_horario_comercial,  # alinhado ao nome da coluna do modelo
        pre_veiculo_nortetel=payload.pre_veiculo_nortetel,           # se precisa usar veículo da Nortetel
        pre_container_materiais=payload.pre_container_materiais,     # se precisa de container para materiais

        # ====== Horas trabalhadas por função (dias normais) ======
        encarregado_dias=payload.encarregado_dias,                   # grava na coluna encarregado_dias o valor enviado no payload
        instalador_dias=payload.instalador_dias,                     # grava na coluna instalador_dias o valor enviado
        auxiliar_dias=payload.auxiliar_dias,                         # grava na coluna auxiliar_dias o valor enviado
        tecnico_de_instalacao_dias=payload.tecnico_de_instalacao_dias,  # grava dias de técnico de instalação
        tecnico_em_seguranca_dias=payload.tecnico_em_seguranca_dias,    # grava dias de técnico em segurança eletrônica

        # ====== Horas extras por função ======
        encarregado_hora_extra=payload.encarregado_hora_extra,       # grava horas extras do encarregado
        instalador_hora_extra=payload.instalador_hora_extra,         # grava horas extras do instalador
        auxiliar_hora_extra=payload.auxiliar_hora_extra,             # grava horas extras do auxiliar
        tecnico_de_instalacao_hora_extra=payload.tecnico_de_instalacao_hora_extra,  # grava horas extras do técnico de instalação
        tecnico_em_seguranca_hora_extra=payload.tecnico_em_seguranca_hora_extra,    # grava horas extras do técnico em segurança

        # ====== Trabalho em domingos/feriados por função ======
        encarregado_trabalho_domingo=payload.encarregado_trabalho_domingo,          # grava horas/dias em domingos do encarregado
        instalador_trabalho_domingo=payload.instalador_trabalho_domingo,            # grava domingos do instalador
        auxiliar_trabalho_domingo=payload.auxiliar_trabalho_domingo,                # grava domingos do auxiliar
        tecnico_de_instalacao_trabalho_domingo=payload.tecnico_de_instalacao_trabalho_domingo,  # grava domingos do técnico de instalação
        tecnico_em_seguranca_trabalho_domingo=payload.tecnico_em_seguranca_trabalho_domingo,    # grava domingos do técnico em segurança

        # ====== Alimentação / Refeições ======
        almoco_qtd=payload.almoco_qtd,                           # grava a quantidade estimada de almoços
        lanche_qtd=payload.lanche_qtd,                           # grava a quantidade estimada de lanches

        # ====== Cronograma e prazos (novos campos) ======
        cronograma_execucao=payload.cronograma_execucao,         # grava se haverá cronograma formal de execução (True/False)
        dias_instalacao=payload.dias_instalacao,                 # grava a quantidade de dias previstos para instalação
        as_built=payload.as_built,                               # grava se haverá entrega de As Built (True/False)
        dias_entrega_relatorio=payload.dias_entrega_relatorio,   # grava o prazo em dias para entrega de relatório
        art=payload.art                                          # grava se haverá ART (True/False)

    )                                                                 # fim da construção do objeto Avaliacao

    db.add(avaliacao)                                            # adiciona o objeto à sessão
    db.commit()                                                  # faz o commit para gravar no banco
    db.refresh(avaliacao)                                        # atualiza o objeto com dados do banco (id, timestamps, etc.)

    log = AvaliacaoAuditoria(                                    # instancia um novo objeto de auditoria
        avaliacao_id=avaliacao.id,                               # associa à avaliação recém-criada
        usuario="sistema",                                       # por enquanto colocamos "sistema"
        acao="CRIAR",                                            # ação realizada
        detalhes="Avaliação criada via API"                      # detalhe textual simples
    )

    db.add(log)                                                  # adiciona o log à sessão
    db.commit()                                                  # grava o log no banco

    return avaliacao                                             # retorna o objeto Avaliacao (FastAPI converte para schema)
# -----------------------------------------------------------
# Endpoint: listar avaliações (GET /avaliacoes)
# -----------------------------------------------------------
@app.get("/avaliacoes",                                          # define rota GET /avaliacoes
         response_model=List[AvaliacaoOutSchema])                # resposta será uma lista de AvaliacaoOutSchema
def listar_avaliacoes(                                           # função para listar avaliações
    skip: int = 0,                                               # parâmetro de query "skip" (pular N registros)
    limit: int = 100,                                            # parâmetro de query "limit" (quantidade máxima)
    db: Session = Depends(get_db)                               # sessão de banco
):
    query = db.query(Avaliacao)                                  # inicia uma query sobre a tabela Avaliacao
    avaliacoes = query.offset(skip).limit(limit).all()           # aplica paginação: pula e limita resultados
    return avaliacoes                                            # retorna a lista de avaliações

# -----------------------------------------------------------
# Endpoint: adicionar equipamento a uma avaliação
# -----------------------------------------------------------
@app.post("/avaliacoes/{avaliacao_id}/equipamentos",             # rota POST com id da avaliação na URL
          response_model=EquipamentoOutSchema)                   # resposta será o equipamento criado
def adicionar_equipamento(                                       # função para criar equipamento
    avaliacao_id: int,                                           # id da avaliação vindo da URL
    payload: EquipamentoBaseSchema,                              # dados do equipamento enviados no corpo
    db: Session = Depends(get_db)                                # sessão de banco injetada
):
    avaliacao = db.query(Avaliacao).filter(                      # busca a avaliação no banco
        Avaliacao.id == avaliacao_id                             # condição: id igual ao fornecido
    ).first()                                                    # pega o primeiro resultado

    if not avaliacao:                                            # se não encontrou avaliação
        raise HTTPException(                                     # lança erro HTTP
            status_code=404,                                     # código 404 (não encontrado)
            detail="Avaliação não encontrada"                    # mensagem de erro
        )

    equipamento = AvaliacaoEquipamento(                          # cria instância ORM de equipamento
        avaliacao_id=avaliacao_id,                               # associa ao id da avaliação
        equipamento=payload.equipamento,                         # nome do equipamento
        modelo=payload.modelo,                                   # modelo do equipamento
        quantidade=payload.quantidade,                           # quantidade
        fabricante=payload.fabricante                            # fabricante
    )

    db.add(equipamento)                                          # adiciona o equipamento à sessão
    db.commit()                                                  # grava no banco
    db.refresh(equipamento)                                      # recarrega o objeto com dados do banco (id, etc.)

    detalhes_log = json.dumps(                                   # monta JSON com detalhes para auditoria
        {
            "acao": "adicionar_equipamento",                     # tipo de ação
            "equipamento": payload.equipamento,                  # nome do equipamento
            "modelo": payload.modelo,                            # modelo
            "quantidade": payload.quantidade,                    # quantidade
            "fabricante": payload.fabricante                     # fabricante
        },
        ensure_ascii=False                                       # mantém acentuação corretamente
    )

    log = AvaliacaoAuditoria(                                    # cria registro de auditoria
        avaliacao_id=avaliacao.id,                               # associa à avaliação
        usuario="sistema",                                       # usuário responsável (ajustar depois se tiver login)
        acao="ADD_EQUIPAMENTO",                                  # código da ação
        detalhes=detalhes_log                                    # detalhes em JSON
    )

    db.add(log)                                                  # adiciona log à sessão
    db.commit()                                                  # grava log no banco

    return equipamento                                            # retorna equipamento criado

# -----------------------------------------------------------
# Endpoint: listar equipamentos de uma avaliação
# -----------------------------------------------------------
@app.get("/avaliacoes/{avaliacao_id}/equipamentos",              # rota GET para listar equipamentos
         response_model=List[EquipamentoOutSchema])              # resposta: lista de equipamentos
def listar_equipamentos(                                         # função para listar equipamentos
    avaliacao_id: int,                                           # id da avaliação vindo da URL
    db: Session = Depends(get_db)                                # sessão de banco injetada
):
    equipamentos = db.query(AvaliacaoEquipamento).filter(        # monta a query na tabela de equipamentos
        AvaliacaoEquipamento.avaliacao_id == avaliacao_id        # filtra pelo id da avaliação
    ).all()                                                      # obtém todos os resultados

    return equipamentos                                          # retorna lista de equipamentos (pode ser vazia)

# -----------------------------------------------------------
# Endpoint: remover um equipamento específico
# -----------------------------------------------------------
@app.delete("/equipamentos/{equipamento_id}")                    # rota DELETE com id do equipamento
def remover_equipamento(                                         # função para remover equipamento
    equipamento_id: int,                                         # id do equipamento vindo da URL
    db: Session = Depends(get_db)                                # sessão de banco injetada
):
    equipamento = db.query(AvaliacaoEquipamento).filter(         # busca o equipamento
        AvaliacaoEquipamento.id == equipamento_id                # filtra pelo id informado
    ).first()                                                    # pega o primeiro resultado

    if not equipamento:                                          # se não encontrou
        raise HTTPException(                                     # lança erro HTTP
            status_code=404,                                     # código 404
            detail="Equipamento não encontrado"                  # mensagem
        )

    avaliacao_id = equipamento.avaliacao_id                      # guarda id da avaliação para o log

    detalhes_log = json.dumps(                                   # monta JSON com informações removidas
        {
            "acao": "remover_equipamento",                       # tipo de ação
            "equipamento": equipamento.equipamento,              # nome do equipamento
            "modelo": equipamento.modelo,                        # modelo
            "quantidade": equipamento.quantidade,                # quantidade
            "fabricante": equipamento.fabricante                 # fabricante
        },
        ensure_ascii=False                                       # mantém acentos
    )

    db.delete(equipamento)                                       # marca o equipamento para remoção
    db.commit()                                                  # aplica a remoção no banco

    log = AvaliacaoAuditoria(                                    # cria registro de auditoria
        avaliacao_id=avaliacao_id,                               # id da avaliação associada
        usuario="sistema",                                       # usuário responsável
        acao="REMOVER_EQUIPAMENTO",                              # código da ação
        detalhes=detalhes_log                                    # detalhes em JSON
    )

    db.add(log)                                                  # adiciona log à sessão
    db.commit()                                                  # grava log no banco

    return {"detail": "Equipamento removido com sucesso"}        # resposta simples de confirmação

# -----------------------------------------------------------
# Endpoint: adicionar outro recurso a uma avaliação
# -----------------------------------------------------------
@app.post("/avaliacoes/{avaliacao_id}/outros_recursos",          # rota POST para criar recurso
          response_model=OutroRecursoOutSchema)                  # resposta: recurso criado
def adicionar_outro_recurso(                                     # função para criar recurso
    avaliacao_id: int,                                           # id da avaliação vindo da URL
    payload: OutroRecursoBaseSchema,                             # dados do recurso enviados no corpo
    db: Session = Depends(get_db)                                # sessão de banco injetada
):
    avaliacao = db.query(Avaliacao).filter(                      # busca a avaliação
        Avaliacao.id == avaliacao_id                             # filtra pelo id
    ).first()                                                    # pega o primeiro resultado

    if not avaliacao:                                            # se não encontrou avaliação
        raise HTTPException(                                     # lança erro
            status_code=404,                                     # código 404
            detail="Avaliação não encontrada"                    # mensagem
        )

    recurso = AvaliacaoOutroRecurso(                             # cria instância ORM do recurso
        avaliacao_id=avaliacao_id,                               # associa à avaliação
        descricao=payload.descricao,                             # descrição do recurso
        quantidade=payload.quantidade                            # quantidade
    )

    db.add(recurso)                                              # adiciona à sessão
    db.commit()                                                  # grava no banco
    db.refresh(recurso)                                          # recarrega objeto com id, etc.

    detalhes_log = json.dumps(                                   # monta JSON para auditoria
        {
            "acao": "adicionar_outro_recurso",                   # tipo de ação
            "descricao": payload.descricao,                      # descrição
            "quantidade": payload.quantidade                     # quantidade
        },
        ensure_ascii=False                                       # mantém acentos
    )

    log = AvaliacaoAuditoria(                                    # cria registro de auditoria
        avaliacao_id=avaliacao.id,                               # id da avaliação associada
        usuario="sistema",                                       # usuário responsável
        acao="ADD_OUTRO_RECURSO",                                # código da ação
        detalhes=detalhes_log                                    # detalhes em JSON
    )

    db.add(log)                                                  # adiciona log
    db.commit()                                                  # grava log

    return recurso                                               # retorna recurso criado

# -----------------------------------------------------------
# Endpoint: listar outros recursos de uma avaliação
# -----------------------------------------------------------
@app.get("/avaliacoes/{avaliacao_id}/outros_recursos",           # rota GET para listar recursos
         response_model=List[OutroRecursoOutSchema])             # resposta: lista de recursos
def listar_outros_recursos(                                      # função para listar recursos
    avaliacao_id: int,                                           # id da avaliação vindo da URL
    db: Session = Depends(get_db)                                # sessão de banco injetada
):
    recursos = db.query(AvaliacaoOutroRecurso).filter(           # monta query na tabela de recursos
        AvaliacaoOutroRecurso.avaliacao_id == avaliacao_id       # filtra pelo id da avaliação
    ).all()                                                      # obtém todos os registros

    return recursos                                              # retorna a lista (pode ser vazia)
# -----------------------------------------------------------
# Endpoint: remover um outro recurso específico
# -----------------------------------------------------------
@app.delete("/outros_recursos/{recurso_id}")                     # rota DELETE com id do recurso
def remover_outro_recurso(                                       # função para remover recurso
    recurso_id: int,                                             # id do recurso vindo da URL
    db: Session = Depends(get_db)                                # sessão de banco injetada
):
    recurso = db.query(AvaliacaoOutroRecurso).filter(            # busca o recurso no banco
        AvaliacaoOutroRecurso.id == recurso_id                   # filtra pelo id informado
    ).first()                                                    # pega o primeiro resultado

    if not recurso:                                              # se não encontrou
        raise HTTPException(                                     # lança erro HTTP
            status_code=404,                                     # código 404
            detail="Recurso não encontrado"                      # mensagem
        )

    avaliacao_id = recurso.avaliacao_id                          # guarda id da avaliação para o log

    detalhes_log = json.dumps(                                   # monta JSON com dados removidos
        {
            "acao": "remover_outro_recurso",                     # tipo de ação
            "descricao": recurso.descricao,                      # descrição
            "quantidade": recurso.quantidade                     # quantidade
        },
        ensure_ascii=False                                       # mantém acentos
    )

    db.delete(recurso)                                           # marca o recurso para remoção
    db.commit()                                                  # aplica a remoção

    log = AvaliacaoAuditoria(                                    # cria registro de auditoria
        avaliacao_id=avaliacao_id,                               # id da avaliação associada
        usuario="sistema",                                       # usuário responsável
        acao="REMOVER_OUTRO_RECURSO",                            # código da ação
        detalhes=detalhes_log                                    # detalhes em JSON
    )

    db.add(log)                                                  # adiciona log
    db.commit()                                                  # grava log

    return {"detail": "Recurso removido com sucesso"}            # resposta simples confirmando

# -----------------------------------------------------------
# Endpoint: obter uma avaliação específica (GET /avaliacoes/{id})
# -----------------------------------------------------------
@app.get("/avaliacoes/{avaliacao_id}",                           # define rota GET com parâmetro de caminho avaliacao_id
         response_model=AvaliacaoOutSchema)                      # resposta será uma avaliação única
def obter_avaliacao(                                             # função para obter uma avaliação específica
    avaliacao_id: int,                                           # parâmetro de rota representando o ID da avaliação
    db: Session = Depends(get_db)                                # sessão de banco injetada pela dependência
):
    avaliacao = db.query(Avaliacao).filter(                      # monta a query na tabela Avaliacao
        Avaliacao.id == avaliacao_id                             # condição: id igual ao id recebido
    ).first()                                                    # busca o primeiro (e único) resultado

    if not avaliacao:                                            # se não encontrou avaliação
        raise HTTPException(                                     # lança exceção HTTP
            status_code=404,                                     # código 404 (não encontrado)
            detail="Avaliação não encontrada"                    # mensagem de erro
        )

    return avaliacao                                             # retorna o objeto Avaliacao (convertido para schema)

# -----------------------------------------------------------
# Endpoint: atualizar uma avaliação (PUT /avaliacoes/{id})
# -----------------------------------------------------------
@app.put("/avaliacoes/{avaliacao_id}",                           # define rota PUT com parâmetro de caminho avaliacao_id
         response_model=AvaliacaoOutSchema)                      # resposta será a avaliação atualizada
def atualizar_avaliacao(                                         # função para atualizar uma avaliação existente
    avaliacao_id: int,                                           # id da avaliação vindo da URL
    payload: AvaliacaoUpdateSchema,                              # dados enviados pelo cliente (campos opcionais)
    db: Session = Depends(get_db)                                # sessão de banco injetada
):
    from datetime import datetime                                # importa datetime para tratar datas

    avaliacao = db.query(Avaliacao).filter(                      # busca a avaliação no banco
        Avaliacao.id == avaliacao_id                             # condição: id igual ao id recebido
    ).first()                                                    # pega o primeiro resultado

    if not avaliacao:                                            # se não encontrou avaliação com esse id
        raise HTTPException(                                     # lança um erro HTTP
            status_code=404,                                     # código 404 (não encontrado)
            detail="Avaliação não encontrada"                    # mensagem de erro
        )

    alteracoes = []                                              # lista para registrar alterações realizadas, usada no audit trail

    # Atualiza cliente_nome se enviado e se mudou
    if payload.cliente_nome is not None:                         # verifica se o campo cliente_nome foi enviado
        if payload.cliente_nome != avaliacao.cliente_nome:       # compara valor novo com o atual
            alteracoes.append({                                  # registra a alteração em uma lista
                "campo": "cliente_nome",                         # nome do campo
                "antes": avaliacao.cliente_nome,                 # valor anterior
                "depois": payload.cliente_nome                   # valor novo
            })
            avaliacao.cliente_nome = payload.cliente_nome        # aplica a alteração no objeto ORM

    # Atualiza data_avaliacao se enviada e se mudou
    if payload.data_avaliacao is not None:                       # verifica se a data foi enviada
        try:
            nova_data = datetime.strptime(                       # converte a string recebida em objeto date
                payload.data_avaliacao,                          # string de entrada
                "%Y-%m-%d"                                       # formato esperado
            ).date()                                             # pega somente a parte de data
        except ValueError:                                       # se a conversão falhar
            raise HTTPException(                                 # lança erro de requisição inválida
                status_code=400,                                 # código 400
                detail="data_avaliacao deve estar no formato YYYY-MM-DD"  # mensagem de erro
            )
        if nova_data != avaliacao.data_avaliacao:                # compara nova data com a atual
            alteracoes.append({                                  # registra alteração
                "campo": "data_avaliacao",                       # nome do campo
                "antes": str(avaliacao.data_avaliacao),          # valor anterior como string
                "depois": payload.data_avaliacao                 # valor novo como string
            })
            avaliacao.data_avaliacao = nova_data                 # aplica a nova data

    # Helper interno para evitar repetição de código nos campos simples
    def atualiza_campo(nome_attr: str, nome_label: str):         # função interna para atualizar um campo texto simples
        valor_novo = getattr(payload, nome_attr)                 # obtém o valor do campo no payload
        if valor_novo is not None:                               # se o campo foi enviado
            valor_atual = getattr(avaliacao, nome_attr)          # obtém o valor atual na avaliação
            if valor_novo != valor_atual:                        # compara novo e atual
                alteracoes.append({                              # registra a alteração
                    "campo": nome_label,                         # nome "humano" do campo
                    "antes": valor_atual,                        # valor anterior
                    "depois": valor_novo                         # novo valor
                })
                setattr(avaliacao, nome_attr, valor_novo)        # atualiza o atributo no objeto Avaliacao

    # Atualiza campos de texto/curtos usando o helper
    atualiza_campo("local", "local")                             # atualiza campo local, se necessário
    atualiza_campo("objeto", "objeto")                           # atualiza campo objeto, se necessário
    atualiza_campo("status", "status")                           # atualiza campo status, se necessário
    #tipo_formulario
    atualiza_campo("tipo_formulario", "tipo_formulario")         # atualiza tipo de formulário, se enviado
    #tipo_formulario
    atualiza_campo("equipe", "equipe")                           # atualiza campo equipe, se necessário
    atualiza_campo("responsavel_avaliacao", "responsavel_avaliacao")  # atualiza responsável pela avaliação
    atualiza_campo("contato", "contato")                         # atualiza contato do cliente
    atualiza_campo("email_cliente", "email_cliente")             # atualiza e-mail do cliente
    atualiza_campo("escopo_texto", "escopo_texto")               # atualiza escopo da avaliação

    # ===== Novos campos: características gerais =====
    atualiza_campo("servico_fora_montes_claros", "servico_fora_montes_claros")  # indica se o serviço é fora de Montes Claros
    atualiza_campo("servico_intermediario", "servico_intermediario")            # indica se é serviço para intermediário/empreiteira

    # Quantitativo 01 – Patch Panel / Cabeamento UTP
    atualiza_campo("q1_categoria_cab", "q1_categoria_cab")                    # categoria do cabeamento (Cat5e/Cat6/Cat6a)
    atualiza_campo("q1_blindado", "q1_blindado")                              # se o cabeamento é blindado
    atualiza_campo("q1_novo_patch_panel", "q1_novo_patch_panel")              # se será fornecido novo patch panel
    atualiza_campo("q1_incluir_guia", "q1_incluir_guia")                      # se inclui guia de cabos
    atualiza_campo("q1_qtd_pontos_rede", "q1_qtd_pontos_rede")                # quantidade de pontos de rede
    atualiza_campo("q1_qtd_cabos", "q1_qtd_cabos")                            # quantidade de cabos UTP
    atualiza_campo("q1_qtd_portas_patch_panel", "q1_qtd_portas_patch_panel")  # quantidade de portas do patch panel
    atualiza_campo("q1_qtd_patch_cords", "q1_qtd_patch_cords")                # quantidade de patch cords
    atualiza_campo("q1_marca_cab", "q1_marca_cab")                            # marca do cabeamento UTP
    atualiza_campo("q1_modelo_patch_panel", "q1_modelo_patch_panel")          # modelo/descrição do patch panel
    atualiza_campo("q1_qtd_guias_cabos", "q1_qtd_guias_cabos")                # quantidade de guias de cabos
    atualiza_campo("q1_patch_cords_modelo", "q1_patch_cords_modelo")          # modelo/descrição dos patch cords
    atualiza_campo("q1_patch_cords_cor", "q1_patch_cords_cor")                # cor ou cores dos patch cords
    atualiza_campo("q1_patch_panel_existente_nome", "q1_patch_panel_existente_nome")  # identificação do patch panel existente

    # Quantitativo 02 – Switch
    atualiza_campo("q2_novo_switch", "q2_novo_switch")                    # indica se haverá fornecimento de switch novo
    atualiza_campo("q2_switch_poe", "q2_switch_poe")                      # LEGADO - PoE (modelo antigo)
    atualiza_campo("q2_rede_industrial", "q2_rede_industrial")            # LEGADO - rede industrial (modelo antigo)
    atualiza_campo("q2_qtd_pontos_rede", "q2_qtd_pontos_rede")            # LEGADO - dimensionamento antigo de pontos
    atualiza_campo("q2_qtd_portas_switch", "q2_qtd_portas_switch")        # LEGADO - dimensionamento antigo de portas
    atualiza_campo("q2_fornecedor_switch", "q2_fornecedor_switch")        # quem fornece o switch: 'nortetel' ou 'cliente'
    atualiza_campo("q2_modelo_switch", "q2_modelo_switch")                # modelo do switch (novo ou existente)
    atualiza_campo("q2_switch_foto_url", "q2_switch_foto_url")            # URL/caminho da foto do switch
    atualiza_campo("q2_switch_existente_nome", "q2_switch_existente_nome")# identificação do switch existente
    atualiza_campo("q2_observacoes", "q2_observacoes")                    # observações gerais sobre o switch

    # Quantitativo 03 – Cabeamento Óptico
    atualiza_campo("q3_tipo_fibra", "q3_tipo_fibra")                        # tipo de fibra (SM/OMx)
    atualiza_campo("q3_qtd_fibras_por_cabo", "q3_qtd_fibras_por_cabo")      # número de fibras por cabo
    atualiza_campo("q3_tipo_conector", "q3_tipo_conector")                  # tipo de conector (LC/SC etc.)
    atualiza_campo("q3_novo_dio", "q3_novo_dio")                            # se será fornecido novo DIO
    atualiza_campo("q3_caixa_terminacao", "q3_caixa_terminacao")            # se haverá caixa de terminação
    atualiza_campo("q3_tipo_cabo_optico", "q3_tipo_cabo_optico")            # tipo de cabo óptico
    atualiza_campo("q3_caixa_emenda", "q3_caixa_emenda")                    # se haverá caixa de emenda
    atualiza_campo("q3_qtd_cabos", "q3_qtd_cabos")                          # quantidade de cabos ópticos
    atualiza_campo("q3_tamanho_total_m", "q3_tamanho_total_m")              # metragem total estimada (m)
    atualiza_campo("q3_qtd_fibras", "q3_qtd_fibras")                        # quantidade total de fibras
    atualiza_campo("q3_qtd_portas_dio", "q3_qtd_portas_dio")                # quantidade de portas no DIO
    atualiza_campo("q3_qtd_cordoes_opticos", "q3_qtd_cordoes_opticos")      # quantidade de cordões ópticos
    atualiza_campo("q3_marca_cab_optico", "q3_marca_cab_optico")            # marca do cabeamento óptico
    atualiza_campo("q3_modelo_dio", "q3_modelo_dio")                        # modelo/descrição do DIO
    atualiza_campo("q3_modelo_cordao_optico", "q3_modelo_cordao_optico")    # modelo/descrição dos cordões ópticos
    atualiza_campo("q3_observacoes", "q3_observacoes")                      # observações gerais sobre o cabeamento óptico

    # Quantitativo 04 – Equipamentos (Câmeras / NVR/DVR / Conversor / GBIC)
    atualiza_campo("q4_camera", "q4_camera")                              # indica se a avaliação inclui câmeras
    atualiza_campo("q4_nvr_dvr", "q4_nvr_dvr")                            # indica se haverá NVR/DVR
    atualiza_campo("q4_access_point", "q4_access_point")                  # LEGADO - Access Points (modelo antigo)
    atualiza_campo("q4_conversor_midia", "q4_conversor_midia")            # indica se inclui conversores de mídia
    atualiza_campo("q4_gbic", "q4_gbic")                                  # indica se inclui módulos GBIC/SFP
    atualiza_campo("q4_switch", "q4_switch")                              # LEGADO - switches adicionais (modelo antigo)
    atualiza_campo("q4_conversor_midia_modelo", "q4_conversor_midia_modelo")  # modelo do conversor de mídia
    atualiza_campo("q4_gbic_modelo", "q4_gbic_modelo")                    # modelo do GBIC/SFP
    atualiza_campo("q4_camera_nova", "q4_camera_nova")                    # True = câmeras novas, False = realocação
    atualiza_campo("q4_camera_modelo", "q4_camera_modelo")                # modelo das câmeras
    atualiza_campo("q4_camera_qtd", "q4_camera_qtd")                      # quantidade de câmeras
    atualiza_campo("q4_camera_fornecedor", "q4_camera_fornecedor")        # quem fornece as câmeras
    atualiza_campo("q4_nvr_dvr_modelo", "q4_nvr_dvr_modelo")              # modelo/descrição do NVR/DVR

    # Quantitativo 05 – Infraestrutura
    atualiza_campo("q5_nova_eletrocalha", "q5_nova_eletrocalha")          # indica se haverá nova eletrocalha
    atualiza_campo("q5_novo_eletroduto", "q5_novo_eletroduto")            # indica se haverá novo eletroduto
    atualiza_campo("q5_novo_rack", "q5_novo_rack")                        # indica se haverá novo rack
    atualiza_campo("q5_instalacao_eletrica", "q5_instalacao_eletrica")    # indica se haverá instalação elétrica
    atualiza_campo("q5_nobreak", "q5_nobreak")                            # indica se haverá nobreak
    atualiza_campo("q5_serralheria", "q5_serralheria")                    # indica se haverá serviços de serralheria
    atualiza_campo("q5_eletrocalha_modelo", "q5_eletrocalha_modelo")      # modelo da eletrocalha
    atualiza_campo("q5_eletrocalha_qtd", "q5_eletrocalha_qtd")            # quantidade de eletrocalhas
    atualiza_campo("q5_eletroduto_modelo", "q5_eletroduto_modelo")        # modelo do eletroduto
    atualiza_campo("q5_eletroduto_qtd", "q5_eletroduto_qtd")              # quantidade de eletrodutos
    atualiza_campo("q5_rack_modelo", "q5_rack_modelo")                    # modelo do rack
    atualiza_campo("q5_rack_qtd", "q5_rack_qtd")                          # quantidade de racks
    atualiza_campo("q5_nobreak_modelo", "q5_nobreak_modelo")              # modelo do nobreak
    atualiza_campo("q5_nobreak_qtd", "q5_nobreak_qtd")                    # quantidade de nobreaks
    atualiza_campo("q5_serralheria_descricao", "q5_serralheria_descricao")# descrição detalhada da serralheria
    atualiza_campo("q5_instalacao_eletrica_obs", "q5_instalacao_eletrica_obs")  # observações adicionais de instalação elétrica

    # ===== Novos campos: Localização / Referências =====
    atualiza_campo("localizacao_imagem1_url", "localizacao_imagem1_url")        # URL da primeira imagem de localização
    atualiza_campo("localizacao_imagem2_url", "localizacao_imagem2_url")        # URL da segunda imagem de localização

    # ===== Novos campos: Pré-requisitos =====
    atualiza_campo("pre_trabalho_altura", "pre_trabalho_altura")                # se há trabalho em altura
    atualiza_campo("pre_plataforma", "pre_plataforma")                          # se precisa de plataforma elevatória
    atualiza_campo("pre_plataforma_modelo", "pre_plataforma_modelo")            # modelo da plataforma
    atualiza_campo("pre_plataforma_dias", "pre_plataforma_dias")                # dias de uso da plataforma
    atualiza_campo("pre_fora_horario_comercial", "pre_fora_horario_comercial")  # se será fora do horário comercial
    atualiza_campo("pre_veiculo_nortetel", "pre_veiculo_nortetel")              # se usará veículo da Nortetel
    atualiza_campo("pre_container_materiais", "pre_container_materiais")        # se precisa de container de materiais

    # ===== Novos campos: Horas trabalhadas por função (dias normais) =====
    atualiza_campo("encarregado_dias", "encarregado_dias")                      # atualiza dias de encarregado, se enviados
    atualiza_campo("instalador_dias", "instalador_dias")                        # atualiza dias de instalador, se enviados
    atualiza_campo("auxiliar_dias", "auxiliar_dias")                            # atualiza dias de auxiliar, se enviados
    atualiza_campo("tecnico_de_instalacao_dias", "tecnico_de_instalacao_dias")  # atualiza dias de técnico de instalação
    atualiza_campo("tecnico_em_seguranca_dias", "tecnico_em_seguranca_dias")    # atualiza dias de técnico em segurança

    # ===== Novos campos: Horas extras por função =====
    atualiza_campo("encarregado_hora_extra", "encarregado_hora_extra")          # atualiza horas extras de encarregado
    atualiza_campo("instalador_hora_extra", "instalador_hora_extra")            # atualiza horas extras de instalador
    atualiza_campo("auxiliar_hora_extra", "auxiliar_hora_extra")                # atualiza horas extras de auxiliar
    atualiza_campo("tecnico_de_instalacao_hora_extra", "tecnico_de_instalacao_hora_extra")  # horas extras de técnico de instalação
    atualiza_campo("tecnico_em_seguranca_hora_extra", "tecnico_em_seguranca_hora_extra")    # horas extras de técnico em segurança

    # ===== Novos campos: Trabalho em domingos/feriados por função =====
    atualiza_campo("encarregado_trabalho_domingo", "encarregado_trabalho_domingo")          # atualiza domingos/feriados de encarregado
    atualiza_campo("instalador_trabalho_domingo", "instalador_trabalho_domingo")            # atualiza domingos/feriados de instalador
    atualiza_campo("auxiliar_trabalho_domingo", "auxiliar_trabalho_domingo")                # atualiza domingos/feriados de auxiliar
    atualiza_campo("tecnico_de_instalacao_trabalho_domingo", "tecnico_de_instalacao_trabalho_domingo")  # domingos/feriados técnico instalação
    atualiza_campo("tecnico_em_seguranca_trabalho_domingo", "tecnico_em_seguranca_trabalho_domingo")    # domingos/feriados técnico segurança

    # ===== Novos campos: Alimentação =====
    atualiza_campo("almoco_qtd", "almoco_qtd")                                  # atualiza quantidade de almoços, se enviada
    atualiza_campo("lanche_qtd", "lanche_qtd")                                  # atualiza quantidade de lanches, se enviada

    # ===== Novos campos: Cronograma e prazos =====
    atualiza_campo("cronograma_execucao", "cronograma_execucao")                # atualiza flag de cronograma de execução
    atualiza_campo("dias_instalacao", "dias_instalacao")                        # atualiza quantidade de dias de instalação
    atualiza_campo("as_built", "as_built")                                      # atualiza flag de As Built
    atualiza_campo("dias_entrega_relatorio", "dias_entrega_relatorio")          # atualiza prazo em dias para entrega de relatório
    atualiza_campo("art", "art")                                                # atualiza flag de ART

    if not alteracoes:                                           # se a lista de alterações ficou vazia
        # Nenhum campo relevante foi alterado; podemos optar por não registrar auditoria detalhada
        detalhe_log = "Atualização chamada, mas nenhum campo foi alterado."  # mensagem simples de detalhe
    else:
        detalhe_log = json.dumps(                                # converte a lista de alterações em JSON
            {"alteracoes": alteracoes},                          # dicionário com a chave "alteracoes"
            ensure_ascii=False                                   # mantém acentos e caracteres especiais
        )

    # Persiste as alterações no banco
    db.add(avaliacao)                                            # garante que o objeto está na sessão
    db.commit()                                                  # grava as mudanças no banco
    db.refresh(avaliacao)                                        # recarrega o objeto com dados atualizados

    # Registra o log de auditoria para a atualização
    log = AvaliacaoAuditoria(                                    # instancia um novo registro de auditoria
        avaliacao_id=avaliacao.id,                               # associa à avaliação alterada
        usuario="sistema",                                       # identificador do usuário (ajustar depois para usuário real)
        acao="EDITAR",                                           # tipo de ação
        detalhes=detalhe_log                                     # detalhes do que foi alterado (JSON ou texto)
    )

    db.add(log)                                                  # adiciona o log na sessão
    db.commit()                                                  # grava o log no banco

    return avaliacao                                             # retorna a avaliação atualizada

# -----------------------------------------------------------
# Endpoint opcional: listar auditoria de uma avaliação
# -----------------------------------------------------------
@app.get("/avaliacoes/{avaliacao_id}/auditoria",                 # rota GET /avaliacoes/{id}/auditoria
         response_model=List[AvaliacaoAuditoriaOutSchema])       # resposta: lista de registros de auditoria
def listar_auditoria(                                            # função para listar auditoria de uma avaliação
    avaliacao_id: int,                                           # id da avaliação na rota
    db: Session = Depends(get_db)                               # sessão de banco
):
    logs = db.query(AvaliacaoAuditoria).filter(                  # monta a query filtrando por avaliacao_id
        AvaliacaoAuditoria.avaliacao_id == avaliacao_id          # condição de filtro
    ).order_by(AvaliacaoAuditoria.data_hora.asc()).all()         # ordena por data/hora (do mais antigo para o mais novo)

    if not logs:                                                 # se não houver logs
        # opcionalmente, podemos checar se a avaliação existe antes de dizer que não há logs
        avaliacao_existe = db.query(Avaliacao).filter(           # checa se existe avaliação com esse id
            Avaliacao.id == avaliacao_id                         # condição de filtro pelo id
        ).first()                                                # pega o primeiro resultado

        if not avaliacao_existe:                                 # se não encontrou avaliação
            raise HTTPException(                                 # lança erro HTTP 404
                status_code=404,                                 # código 404
                detail="Avaliação não encontrada"                # mensagem
            )

    return logs                                                  # retorna a lista de logs (pode ser vazia se não houve ações)
# ====================== fim do main.py ======================

# -----------------------------------------------------------
# Endpoint: listar auditoria de um usuário (somente admin)
# -----------------------------------------------------------
@app.get("/usuarios/{usuario_id}/auditoria",                      # rota GET para listar auditoria de um usuário específico
         response_model=List[UsuarioAuditoriaOutSchema])          # resposta será uma lista de registros de auditoria de usuário
async def listar_auditoria_usuario(                               # função assíncrona que devolve o histórico daquele usuário
    usuario_id: int,                                              # id do usuário alvo vindo da URL
    db: Session = Depends(get_db),                                # sessão de banco injetada pelo FastAPI
    admin: Usuario = Depends(obter_admin_atual)                   # garante que apenas administradores possam acessar
):
    logs = db.query(UsuarioAuditoria).filter(                     # monta a query na tabela de auditoria de usuários
        UsuarioAuditoria.usuario_alvo_id == usuario_id            # filtra somente os registros relativos ao usuário alvo
    ).order_by(UsuarioAuditoria.data_hora.asc()).all()            # ordena por data/hora do mais antigo para o mais recente

    # Opcionalmente, podemos checar se o usuário existe quando não houver logs
    if not logs:                                                  # se a lista de logs vier vazia
        usuario_existe = db.query(Usuario).filter(                # consulta simples para verificar se o usuário existe
            Usuario.id == usuario_id                              # filtra pelo id informado
        ).first()                                                 # pega o primeiro resultado (ou None)

        if not usuario_existe:                                    # se não existir usuário com esse id
            raise HTTPException(                                  # lança erro HTTP 404
                status_code=404,                                  # código de "não encontrado"
                detail="Usuário não encontrado"                   # mensagem para o cliente
            )

    return logs                                                   # retorna a lista de registros (vazia ou não) para o cliente
