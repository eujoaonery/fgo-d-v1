Especificação do sistema FOGO

Documento de referência funcional. Descreve o sistema como ele opera em 26 de outubro de 2026.
FOGO significa Ferramenta Onisciente de Gestão e Operações. É o centro de comando de uma prefeitura: a mesma tela em que o plantão vê o que está aberto na cidade e o que o histórico permite antecipar.

1. Para que serve

O operador acompanha alertas, ordens de serviço, equipes, câmeras e o inventário da cidade. O gestor configura usuários, permissões e integrações. A previsão de volume de ocorrências fica no Prevision Engine, separada da fila do dia.

Cada cidade é uma organização. O que uma cidade grava não entra na leitura de outra. Quem administra a plataforma pode cuidar de mais de uma cidade. Quem administra uma cidade mexe só na dela. A cidade pode estar em demonstração ou em operação real. Em demonstração o motor pode fabricar alerta sintético. Em cidade real o servidor não fabrica alerta sintético, e o que for marcado como simulado fica de fora da amostra da previsão.

O relógio da previsão é o de São Paulo. Dia fechado é o dia que já terminou nesse fuso. O dia de hoje ainda está aberto e não entra como exemplo de treino.

A interface do centro fica em `/`. A administração da plataforma fica em `/mng`, separada do plantão da cidade.

2. Quem entra e o que pode ver

A entrada é por sessão em cookie, com renovação ligada à própria sessão de quem entrou. Ação sensível de administração pede a senha de novo. Cada módulo concede ver, gerenciar e, quando cabe, exportar. Operador não administra a cidade.

Os papéis da cidade são estes.

Administrador de cidade. Teto da administração municipal. Não é o superadministrador da plataforma.

Gestor de mobilidade. Indicadores, equipamentos, ordens de serviço e previsões da cidade ou da região autorizada.

Operador da central. Mapa, fila de alertas, plantão, abertura de ordem de serviço e agendamento nos agentes.

Equipe de manutenção. Ordens atribuídas: diagnóstico, deslocamento, execução e evidências. Sem configurações globais.

Agente de campo. Escala, tarefas e ocorrências atribuídas. Localização só no período autorizado.

Auditor. Consulta registros e relatórios. Não altera cadastros. Exportação só com permissão explícita.

O superadministrador da plataforma atravessa cidades. Ele não substitui o administrador de uma cidade.

3. Visão geral e mapa

A visão geral é o painel do momento. A faixa de indicadores traz o total de ativos, os operacionais com o percentual de disponibilidade, as ordens em aberto, os agentes em atividade, os alertas de ocorrência e as previsões vigentes. Ao lado do mapa fica o painel de alertas críticos. Embaixo, quatro leituras dos últimos sete dias: ocorrências por categoria, fluxo de registradas e resolvidas, disponibilidade dos ativos e regiões com mais ocorrências. O mapa da cidade fica no mesmo cartão.

O mapa desenha só o que tem coordenada gravada e dentro do município. Ativo sem latitude salva não ganha pino. A leitura não inventa coordenada. Ponto marcado no mapa, ponto de GPS e número já confirmado não são reescritos por uma sugestão. Quando o pino veio de geocodificação e o número da porta não foi confirmado, a ficha diz que a posição é a da rua e o número não está confirmado.

As camadas separam câmeras e radares, semáforos, sensores e totens, conectividade, frota e móveis, agentes e ordens de serviço. O filtro de região da barra vale para o mapa. Há filtro por situação cadastral, por categoria de ativo e por função do agente. A cor do pino segue a situação cadastral. O clique abre a ficha do ativo, do agente ou da ordem.

A situação cadastral é uma destas: operacional, ainda não instalado, mau funcionamento, em manutenção, em uso ou em ocorrência, desativado, furtado, baixado ou retirado. A conectividade, quando o equipamento tem comunicação própria, é conectado, atrasado, sem comunicação, desconhecido ou não aplicável. A origem do dado é real, integração, importado, manual ou simulado.

4. O que o operador usa no plantão

Alertas. Lista do que a cidade emitiu. O operador assume, acompanha o estado e, quando cabe, abre ordem de serviço a partir do alerta. Alerta de sistema e alerta de integração não entram na grade de ocorrência, nem ativo inativo gera ocorrência. A fila pode ser filtrada pela região.

Ordens de serviço. Abertura, despacho de equipe conforme a capacidade do agente, agendamento e histórico do que foi feito. A previsão não abre ordem sozinha. A ordem cancelada ou resolvida sai da conta de frota em uso.

Rotas. Planejamento do deslocamento a partir das ordens, com origem do agente, paradas, geometria da via e conflito de agenda. A rota pode ser salva, duplicada, editada e consultada no histórico. O traçado usa o OSRM sobre a malha do OpenStreetMap.

Agenda. Compromissos operacionais da cidade e o que já está marcado para cada agente.

Câmeras. Parede do que está cadastrado como câmera no inventário, com busca, região, situação do fluxo, grade compacta ou confortável e abertura da ficha do equipamento.

Previsões. Lista operacional do que o motor já emitiu como sinal de pico ou de situação, para o plantão ler e decidir. Não é a mesa de volume do Prevision Engine.

Ação. Registro do que foi decidido no plantão: tomada, delegada ou deixada de lado, com prioridade e responsável. Ação tomada pede o que foi feito. Ação delegada pede para quem. Ação deixada de lado pede o motivo.

Operadores do CCO. Quem está na escala do centro, o expediente, a fila que cada um segura e o cumprimento de prazo.

5. Inventário, frota e agentes

Inventário da cidade. Catálogo dos equipamentos e dos veículos. O cadastro antigo de ativos redireciona para esta tela. A lista aceita tabela ou blocos, busca e filtro, e um mapa só com os ativos que já têm coordenada. Quem pode exportar baixa o CSV do que está filtrado e o modelo de importação. Quem pode gerenciar importa CSV e edita a ficha.

Categorias do catálogo: câmera de vigilância, radar de trânsito, semáforo, sensor urbano, ponto de conectividade, totem de estacionamento, veículo de transporte, balança rodoviária, cancela automática, painel de mensagem, veículo autônomo de fiscalização, patinete elétrico, motocicleta de agente e viatura. Cada categoria tem subtipo. Câmera guarda visão noturna, resolução e se a imagem é colorida ou preto e branco. Radar guarda o subtipo de fiscalização e a velocidade máxima. Equipamento com hardware guarda série, fabricante e modelo. A data de instalação entra quando a categoria a pede. Anexo pode ser manual, certificado, foto de instalação, documento patrimonial ou outro.

O endereço guarda CEP, bairro, cidade, UF, logradouro, número ou referência e coordenada. A referência pode ser número, oposto ao número, quilômetro, sem número ou ponto conhecido. O CEP preenche o endereço pelo ViaCEP. A sugestão de coordenada passa pelo Nominatim. Aceitar a sugestão ou clicar no mapa grava o ponto e confirma o número. O tipo de local pode ser ponto fixo, base, trecho, área ou recurso móvel.

A ficha também guarda o plano de vida do equipamento: ciclo preventivo em dias, próxima manutenção, última realizada, vida útil em meses, nível de degradação e nota do plano. O vencimento gera aviso. Não marca defeito sozinho e não muda a situação cadastral. Mudar a situação cadastral pede justificativa. A situação cadastral também não é alterada sozinha por falta de comunicação.

Frota. Recorte dos veículos já cadastrados: viatura, moto, transporte e demais móveis. Os estados operacionais da frota são disponível, em uso ou em ocorrência, em manutenção e indisponível. A tela mostra as ordens ainda abertas daquele veículo. Mudar o estado grava a situação cadastral do ativo.

Agentes. Cadastro de quem atua em campo: agente de trânsito, guarda de trânsito, guarda municipal, policial militar ou outro profissional operacional. Cada agente tem função, região, órgão responsável, disponibilidade e capacidades: semáforos, câmeras, sensores, conectividade, painéis, trânsito e manutenção. O despacho usa essa capacidade para casar a ordem com quem pode executá-la. Agentes também entram e saem por CSV, com o mesmo critério de ver, gerenciar e exportar.

6. O que a inteligência mostra além da fila

Análises. Cinco leituras: indicadores no tempo, disponibilidade dos ativos, concentração no território, relação entre alerta e resolução, e eventos de telemetria. O período e a região recortam a conta.

Visão por Região. Mapa por camada: ocorrências, ordens de serviço, previsão, clima e comparação. O horizonte vai do agora até sete dias à frente. O clima dessa tela vem do Open-Meteo. A camada de previsão deixa explícito que o número não é ocorrência confirmada.

Painel estratégico. Lê clima e trânsito quando essas fontes estão configuradas e monta um resumo para o gestor. O texto estratégico, quando a integração está ligada, passa pelo serviço de linguagem e volta validado no servidor. Não inventa ocorrência. Os avisos meteorológicos oficiais entram pelo INMET.

Prometheus Alpha. Consulta orientada sobre a operação: amanhã, os próximos sete dias, capacidade de campo, cumprimento de prazo, clima, risco, demanda por região e tráfego. Cada análise substitui a anterior daquela execução e pode ser conversada em seguida. O texto separa fato, previsão, tendência, modelo, hipótese e recomendação. É leitura e recomendação. Não altera o número da mesa do Prevision Engine. As vias nomeadas que essa consulta precisa passam pelo Overpass.

7. Prevision Engine

Esta é a previsão de quantidade. A pergunta da mesa é quantas ocorrências de alerta devem entrar numa janela, não qual equipe despachar e não quantas ordens de serviço abrir.

A amostra são os alertas da cidade. Ficam de fora falso positivo, alerta gerado pela própria previsão e, em cidade real, o que for marcado como simulado. Menos de 50 alertas na amostra é tratado como histórico curto: a conta ainda roda, e a tela deixa isso explícito.

A mesa tem sinais, avaliação do modelo, recomendações e previsibilidade. Nenhuma dessas abas abre ordem de serviço.

7.1 O que a mesa mostra

Para o instante em que o operador abre a tela, a mesa mostra a próxima 1 hora, as próximas 3, 8, 12 e 24 horas, e os dias à frente a partir de hoje. Em cada janela o número é a quantidade prevista.

Abaixo, em Agora na mesa, ficam os alertas ainda abertos e até três sinais extras que o ciclo já tenha emitido.

No fim da tela, o histórico dos dias já fechados, até 30 dias, do mais recente para o mais antigo. Cada dia traz o total e as mesmas cinco janelas contadas a partir da meia-noite. Em cada uma há dois números: o que a fórmula colocaria naquele momento e o que de fato entrou. A comparação usa uma régua simples. Bateu, quando a diferença cabe em cerca de 10 por cento ou em uma unidade. Perto, quando o realizado ficou entre a metade e uma vez e meia do previsto. Longe, quando passou disso e houve ocorrência. Não entrou, quando a previsão era positiva e não veio nada.

7.2 Como o número é formado

O modelo em uso na mesa chama-se fogo-alert-ewma-v1. A mesa do plantão usa esta conta, não a rede. É uma fórmula com quatro peças, todas tiradas dos dias já fechados. O dia que se quer prever não entra na conta que o prevê. O aprendizado por máquina fica na seção 8 e não muda este número enquanto a rede não for provisionada.

Nível do dia. Os totais diários passam por uma média móvel exponencial. O dia mais recente pesa 0,45. O restante do peso fica no nível que já vinha. Assim um pico não apaga a semana, e uma semana fraca não fica invisível.

Dia da semana. A média dos dias iguais (as terças, por exemplo) é misturada com o nível geral. Enquanto houver poucas terças, a mistura puxa para o nível geral. O peso dessa âncora equivale a quatro dias. Uma terça isolada não manda na previsão da próxima terça.

Perfil da hora. Soma-se, nos dias fechados, quantas ocorrências caíram em cada hora de 0 a 23. Isso vira uma fatia: a parte do dia que costuma cair naquela hora. A janela da mesa multiplica o nível do dia por essa fatia e pelo tempo da janela.

Correção do dia em curso. Se o dia já andou o bastante e o realizado está acima ou abaixo do que se esperava até agora, o resto do dia é esticado ou encolhido. O fator fica entre 0,55 e 1,8. Cedo demais no dia, o fator fica em 1 para não reagir a uma hora vazia.

Chuva. Se houver início de chuva prevista dentro da janela, a quantidade daquela janela sobe 20 por cento. Fora isso, o clima não altera o número.

O cruzamento é este: o nível diz o tamanho do dia, o dia da semana corrige o tamanho, o perfil da hora distribui esse tamanho nas horas, o andamento de hoje corrige o que ainda falta, e a chuva só mexe na janela em que ela cabe. Nada disso olha o futuro do próprio dia que está sendo medido no histórico.

7.3 Como ele é treinado

Não há uma fase separada de treino com arquivo de pesos. Cada vez que a mesa é montada, a fórmula é refeita com os alertas já gravados.

Para um dia passado, o treino são somente os dias anteriores a ele. O total previsto é comparado com o total que esse dia teve. Para uma janela de hora no passado, vale a mesma regra: o perfil e o nível saem dos dias anteriores ao dia da janela. É assim que o histórico da tela é reconstruído, à meia-noite de cada dia fechado, e não com um número que alguém tenha digitado depois.

O ciclo também pode emitir sinais de pico quando as últimas 24 horas estão claramente acima da média dos sete dias. Esses sinais aparecem na fila de previsões operacionais, para leitura humana. Continua valendo que a previsão não abre ordem de serviço.

8. Aprendizado: rede neural

O aprendizado do Prevision Engine é a rede neural, modelo fogo-neural-v1. Não há um segundo ajuste aplicado por cima da fórmula, nem uma aba de machine learning nas configurações. A mesa que o plantão abre continua em fogo-alert-ewma-v1. A rede fica numa tela própria, aberta de dentro do Prevision Engine, para ser olhada enquanto ainda não se sustenta.

O que ela aprende. A rede não inventa a quantidade do zero. Ela recebe o número que a fórmula já calculou e a duração da janela: 1, 3, 8, 12 ou 24 horas, e o dia. Por dentro há uma camada escondida de quatro unidades. A saída é a quantidade da fórmula multiplicada por um fator que a rede aprende. No começo esse fator vale 1, então o número da rede começa igual ao da fórmula. A resposta do treino é o que aconteceu, nunca a previsão anterior da própria rede.

Como treina. Não existe arquivo de pesos gravado. Cada vez que a tela é montada, a rede é refeita com até 120 dias já fechados. Ela só passa a ajustar o fator quando a amostra chega ao mínimo para treinar. Antes disso o número exibido é o da partida, próximo da fórmula, e serve só para olhar. Os 14 dias mais recentes ficam de fora do treino e servem de prova, na próxima 1 hora e nas próximas 3 horas. O erro dessa prova é comparado com o erro da fórmula nas mesmas janelas.

O que a tela mostra. São três abas. Nenhuma delas mexe na fila do CCO por si só.

Previsões. Repete o layout da mesa: próximas horas, dias à frente e o histórico do que a rede teria dito contra o que entrou. No topo há o aviso de que o treino ainda é curto e os parâmetros são poucos, então o número pode errar. Mesmo sem dia fechado a aba mostra um número, para visualização. Esse número não entra na fila dos operadores.

Comparação. Em cada dia já fechado, uma tabela com três colunas: previsão da fórmula, previsão da rede neural e resultado real. Entram o dia inteiro e as janelas de 1, 3, 8, 12 e 24 horas.

Confiabilidade. A rede sobe de degrau: Sem base, Inicial, Em formação, Em prova e Confiável. Confiável exige 60 dias fechados e erro da rede, na prova de 1 hora e de 3 horas, igual ou menor que o erro da fórmula. Só então aparece o botão de provisionar a rede neural, para quem administra a cidade. Provisionar envia a quantidade da rede para a fila de previsões operacionais, no lugar da fórmula nessas janelas. A mesa do Prevision Engine permanece na fórmula. Se a prova piorar depois, a rede deixa de ser oficial e a fila volta à fórmula.

9. Integrações

OpenAI. Quando a chave da cidade está configurada, o texto do painel estratégico e do Prometheus sai pela OpenAI, no modelo gpt-4o-mini.

OpenStreetMap. O mapa da operação usa os tiles do OpenStreetMap. A busca de endereço e a coordenada de um ponto passam pelo Nominatim. As vias nomeadas consultadas pelo Prometheus passam pelo Overpass. O traçado de rota das equipes usa o OSRM, sobre a malha do OpenStreetMap.

INMET. Os avisos meteorológicos oficiais entram pela API de avisos ativos do INMET e aparecem na leitura estratégica.

Open-Meteo. A previsão do tempo e o arquivo histórico de clima vêm do Open-Meteo.

CEP. O endereço preenchido a partir do CEP vem do ViaCEP.

Conectores da cidade. A tela de integrações configura a OpenAI. A API da cidade também cadastra, testa e executa conectores de equipamento: ICMP, TCP, HTTP, API REST, webhook de entrada, webhook de saída, MQTT, SNMP, câmera ONVIF, câmera RTSP e importação de arquivo. O webhook de entrada recebe telemetria assinada. Credencial não aparece em tela aberta nem em log.

10. Stack

A interface é React e TypeScript, empacotada com Vite. A API é Node.js com Express e TypeScript. O banco é PostgreSQL com PostGIS, pelo Supabase self hosted.

11. Infraestrutura

O sistema publicado está hospedado em uma máquina virtual Linux, Debian. A interface, a API e o banco ficam nessa mesma máquina. O Supabase é self-hosted: sobe por Docker Compose como serviço da VM, com Postgres, autenticação, REST, storage e realtime. A entrada dele escuta em 127.0.0.1, na porta 8000. O Nginx fica na frente: entrega a interface já construída, encaminha o caminho /api para a API e também encaminha autenticação, REST, storage e realtime do Supabase. Quem roda a interface no próprio computador usa esse endereço público e as chaves do arquivo de ambiente. A API sobe como serviço do sistema, com Node.js na linha 22, e escuta só na própria máquina, em 127.0.0.1 na porta 8787. O endereço público é fgo.criativfy.com.br.

12. Administração da plataforma

Quem administra a plataforma entra em `/mng`. Cada tela mostra a espera enquanto o primeiro dado chega.

Painel. Totais das cidades, situação de cada uma e atalho para o restante da administração.

Cidades. Alta, suspensão, arquivamento e provisionamento. Cada cidade tem modo de operação: demonstração ou real. Duplicar uma cidade copia estrutura de interface, categorias, configurações operacionais, regras de negócio e permissões-modelo. Usuários só entram se forem escolhidos, sem senha e sem o superadministrador global. Inventário e histórico operacional não são copiados.

SuperADMs. Quem administra a plataforma inteira, separado dos administradores de cada cidade.

Infraestrutura. CPU, memória e disco da máquina virtual em que a aplicação está rodando, com o valor ao vivo e o histórico da última hora. A leitura é da VM, não do processo da API.

Firewall. Listas de permissão e de bloqueio por IP ou faixa, para o site inteiro e, à parte, para a rota `/mng`. Lista de permissão vazia não restringe. Lista de bloqueio recusa o acesso antes de a aplicação carregar. O IP de quem está configurando pode ser incluído sozinho, para a regra não trancar quem a gravou.

Sessões. Tempo máximo da sessão da plataforma, de 30 minutos a 24 horas.

13. Administração da cidade

Usuários e grupos. Acesso por módulo, em ver, gerenciar e exportar. A auditoria e os logs de acesso ficam na mesma área.

Integrações e dados. A chave da OpenAI, o modelo e os canais do painel estratégico e do Prometheus. A credencial fica no cofre.

Configurações. Conta, motor de alertas, fila do centro, prazos quando o perfil permite e cidade de referência quando o perfil permite. O motor de alertas, em cidade de demonstração, tem intensidade baixa, média ou alta. Intensidade alta aumenta o pico simulado e não abre ordem de serviço. Apagar histórico de análise não apaga o cadastro da cidade e não liga um gerador de alerta.

Perfil. Nome e conta, aparência e segurança da própria sessão.

14. O que a previsão não faz

Não estima ordem de serviço nem ticket. Não escolhe equipe. Não dá o alerta por encerrado. Não coloca a rede na fila antes de ela estar confiável. Com histórico curto, o número da fórmula existe e a tela avisa que a amostra ainda é pequena.

O plantão continua responsável pela decisão. A mesa informa a quantidade que o histórico sustenta naquela janela.

15. Desenvolvimento (utilização de LLM)

Este projeto foi potencializado pela utilização de inteligência artificial.

O desenvolvimento usou o Composer 2.5 e o Grok 4.7, na plataforma IDE Grok antigo Cursor.
