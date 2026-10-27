# F.O.G.O. — Ferramenta Onisciente de Gestão e Operações

**Plataforma de gestão urbana inteligente desenvolvida para o DSIN Coder Challenge 2026.**

O F.O.G.O. centraliza informações operacionais de uma cidade em uma única plataforma, reunindo monitoramento, gestão de ativos, ocorrências, equipes e recursos analíticos para apoiar a tomada de decisões.

O projeto foi desenvolvido com foco em três pilares:

- **Gestão inteligente de ativos:** organização e acompanhamento de recursos urbanos.
- **Centro de Controle Operacional (CCO):** monitoramento de ocorrências e atividades operacionais.
- **Cidade preditiva:** análise de dados e exploração de mecanismos de previsão.

## Funcionalidades

| Módulo | Descrição |
|---|---|
| Painel operacional | Visão consolidada da operação e de seus indicadores. |
| Mapa operacional | Visualização geográfica de informações e ativos. |
| Alertas e ocorrências | Acompanhamento de eventos que exigem atenção. |
| Ordens de serviço | Gerenciamento de atividades operacionais. |
| Rotas e agenda | Organização de rotas e atividades programadas. |
| Ativos e cadastros | Cadastro e consulta de recursos urbanos. |
| Agentes operacionais | Gerenciamento das equipes de campo. |
| Câmeras | Recursos relacionados ao monitoramento urbano. |
| Estoque | Controle de materiais e recursos operacionais. |
| Indicadores e análises | Acompanhamento de dados e métricas. |
| Painel estratégico | Informações para apoiar o planejamento. |
| Prometheus Alpha | Componente experimental de inteligência operacional. |
| Prevision Engine | Análise estatística e modelo neural experimental para previsão. |

## Tecnologias

- **Frontend:** React, TypeScript e Vite.
- **Backend:** Node.js, Express e TypeScript.
- **Banco de dados:** PostgreSQL com PostGIS.
- **Plataforma de dados:** Supabase self-hosted.
- **Infraestrutura:** Linux e Nginx.
- **Inteligência artificial:** integração com serviços externos e componentes analíticos experimentais.

## Arquitetura que sera utilizada:

O frontend e o backend são executados na máquina utilizada para a avaliação. O banco de dados permanece hospedado remotamente.

```text
Máquina da banca
    │
    ├── Frontend: React + Vite
    │
    └── Backend: Node.js + Express
                    │
                    ▼
             Supabase remoto
                    │
                    └── PostgreSQL + PostGIS
```

**Não é necessário instalar o banco de dados localmente.**

## Como executar

### 1. Pré-requisitos

- Git
- Node.js em versão compatível com o projeto
- npm
- Conexão com a internet

### 2. Clonar o repositório

```bash
git clone https://github.com/eujoaonery/f.o.g.o-dsin.git
cd f.o.g.o-dsin
```

### 3. Instalar as dependências

```bash
npm install
```

### 4. Configurar o ambiente

O arquivo `.env` e as credenciais de avaliação serão fornecidos separadamente.

Coloque o arquivo `.env` na raiz do projeto, no mesmo diretório do `package.json`.

### 5. Iniciar a aplicação

```bash
npm run dev:all
```

Na configuração de desenvolvimento, os endereços são:

| Serviço | Endereço |
|---|---|
| Aplicação | http://localhost:5173 |
| API | http://localhost:8787 |

## Acesso ao sistema

Após iniciar a aplicação:

- **Login:** http://localhost:5173/prefeitura-marilia/login
- **Painel operacional:** http://localhost:5173/prefeitura-marilia
- **Gerenciamento:** http://localhost:5173/mng

As credenciais para avaliação serão disponibilizadas separadamente.

## Ambiente demonstrativo

O projeto utiliza um ambiente demonstrativo associado ao município de **Marília, São Paulo**.

Os dados apresentados têm finalidade de demonstração e não devem ser considerados automaticamente dados oficiais do município.

## Inteligência artificial

O desenvolvimento deste projeto foi potêncializado por inteligência artificial.

LLMs utilizados: Composer 2.5 e Grok 4.7
Plataforma IDE: grok antigo Cursor

**F.O.G.O. — Da operação urbana à decisão orientada por dados.**

Desenvolvido para o **DSIN Coder Challenge 2026**.